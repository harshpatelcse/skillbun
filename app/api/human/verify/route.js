import { NextResponse } from 'next/server'
import { isIP } from 'node:net'

import { getTurnstileSecretKey, isCaptchaEnabled } from '@/utils/server/env'
import { getFirebaseAdminAuth } from '@/utils/server/firebaseAdmin'
import { issueHumanProofToken, verifyHumanProofToken, isHumanProofBoundTo } from '@/utils/server/humanProof'
import { validateSchema } from '@/utils/server/inputValidator'
import { checkServerRateLimit } from '@/utils/server/rateLimitStore'
import { getClientAddress } from '@/utils/server/requestUtils'

/**
 * Anonymous signup may request an unbound proof, but an invalid supplied session
 * must never silently downgrade a signed-in caller to anonymous verification.
 */
async function resolveBoundUid(request) {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader) return ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match || !match[1]) throw Object.assign(new Error('Invalid session.'), { status: 401 })
  let adminAuth
  try {
    adminAuth = getFirebaseAdminAuth()
  } catch {
    throw Object.assign(new Error('Authentication is unavailable.'), { status: 503 })
  }
  if (!adminAuth) throw Object.assign(new Error('Authentication is unavailable.'), { status: 503 })
  try {
    const decoded = await adminAuth.verifyIdToken(match[1])
    if (typeof decoded?.uid !== 'string' || !decoded.uid) throw new Error('Missing user identity.')
    return decoded.uid
  } catch {
    throw Object.assign(new Error('Invalid session.'), { status: 401 })
  }
}

function jsonResponse(body, options = {}) {
  return NextResponse.json(body, {
    ...options,
    headers: { ...options.headers, 'Cache-Control': 'no-store' },
  })
}

export async function POST(request) {
  const clientAddress = getClientAddress(request)
  const limit = await checkServerRateLimit({ namespace: 'humanVerify', subject: clientAddress,
    limits: [{ name: 'minute', windowMs: 60000, maxRequests: 30 }], increment: true })
  if (!limit.allowed) return jsonResponse({ error: 'Too many verification requests.' }, {
    status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
  })
  const bypassHeader = request.headers.get('x-skillbun-bypass') || ''
  const isLocal = process.env.NODE_ENV === 'development'
  let body = {}
  try {
    if (request.body !== null) body = await request.json()
  } catch {
    return jsonResponse({ error: 'Payload must be valid JSON.' }, { status: 400 })
  }
  const isBypassed = body?.token === 'bypass-captcha-dev' || bypassHeader === 'bypass-captcha-dev'
  // Reject legacy bypass attempts before cached-proof and disabled-CAPTCHA paths.
  if (isBypassed && !isLocal) {
    console.warn('[human-verify] rejected legacy dev bypass attempt')
    return jsonResponse({ error: 'Captcha verification failed.' }, { status: 403 })
  }

  let boundUid
  try {
    boundUid = await resolveBoundUid(request)
  } catch (error) {
    return jsonResponse({ error: error.message }, { status: error.status || 401 })
  }
  const captchaEnabled = isCaptchaEnabled()
  const existingToken = request.headers.get('x-skillbun-human') || ''
  const existingVerification = verifyHumanProofToken(existingToken)

  // Only re-use the presented token when it belongs to the caller; never echo a token
  // bound to another student back into this session.
  if (existingVerification.valid && isHumanProofBoundTo(existingVerification, boundUid)) {
    return jsonResponse({
      captchaEnabled: captchaEnabled,
      humanToken: existingToken,
      expiresAt: existingVerification.expiresAt,
    })
  }

  if (!captchaEnabled) {
    const issued = issueHumanProofToken({ v: 1, uid: boundUid })

    if (!issued) {
      return jsonResponse({ error: 'Human verification is not configured.' }, { status: 500 })
    }

    return jsonResponse({
      captchaEnabled: false,
      humanToken: issued.token,
      expiresAt: issued.expiresAt,
    })
  }

  try {
    const schemaCheck = validateSchema(body, {
      token: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 2048,
        label: 'Captcha token',
      },
    }, {
      fieldName: 'Captcha verification payload',
      allowUnknown: false,
      maxKeys: 1,
    });

    if (!schemaCheck.isValid) {
      return jsonResponse({ error: schemaCheck.error }, { status: 400 });
    }

    const token = schemaCheck.value.token;

    if (isBypassed && isLocal) {
      const issued = issueHumanProofToken({ v: 1, uid: boundUid });

      if (!issued) {
        return jsonResponse({ error: 'Human verification is not configured.' }, { status: 500 });
      }

      return jsonResponse({
        captchaEnabled: true,
        humanToken: issued.token,
        expiresAt: issued.expiresAt,
      });
    }

    const formBody = new URLSearchParams({
      secret: getTurnstileSecretKey(),
      response: token
    })

    // The shared limiter returns a trusted IPv4 address or a grouped IPv6 bucket.
    // Cloudflare's optional remoteip field accepts addresses, not bucket labels.
    if (isIP(clientAddress)) {
      formBody.set('remoteip', clientAddress)
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
      signal: AbortSignal.timeout(8000),
    })

    const data = await response.json()
    if (data.success) {
      const issued = issueHumanProofToken({ v: 1, uid: boundUid })

      if (!issued) {
        return jsonResponse({ error: 'Human verification is not configured.' }, { status: 500 })
      }

      return jsonResponse({
        captchaEnabled: true,
        humanToken: issued.token,
        expiresAt: issued.expiresAt
      })
    }

    return jsonResponse({ error: 'Captcha verification failed.' }, { status: 403 })
  } catch {
    return jsonResponse({ error: 'Captcha error.' }, { status: 500 })
  }
}
