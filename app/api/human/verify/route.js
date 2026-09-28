import { NextResponse } from 'next/server'

import { getTurnstileSecretKey, isCaptchaEnabled } from '@/utils/server/env'
import { getFirebaseAdminAuth } from '@/utils/server/firebaseAdmin'
import { issueHumanProofToken, verifyHumanProofToken, isHumanProofBoundTo } from '@/utils/server/humanProof'
import { validateSchema } from '@/utils/server/inputValidator'
import { checkServerRateLimit } from '@/utils/server/rateLimitStore'
import { getClientAddress } from '@/utils/server/requestUtils'

/**
 * Resolves the authenticated caller's uid for token binding. Returns '' when no valid
 * session is presented, which keeps the pre-auth signup OTP flow (no Authorization
 * header) working while binding every signed-in caller to their own account.
 */
async function resolveBoundUid(request) {
  const authHeader = request.headers.get('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match || !match[1]) return ''
  try {
    const adminAuth = getFirebaseAdminAuth()
    if (!adminAuth) return ''
    const decoded = await adminAuth.verifyIdToken(match[1])
    return typeof decoded?.uid === 'string' ? decoded.uid : ''
  } catch {
    return ''
  }
}

export async function POST(request) {
  const limit = await checkServerRateLimit({ namespace: 'humanVerify', subject: getClientAddress(request),
    limits: [{ name: 'minute', windowMs: 60000, maxRequests: 30 }], increment: true })
  if (!limit.allowed) return NextResponse.json({ error: 'Too many verification requests.' }, {
    status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
  })
  const boundUid = await resolveBoundUid(request)
  const captchaEnabled = isCaptchaEnabled()
  const existingToken = request.headers.get('x-skillbun-human') || ''
  const existingVerification = verifyHumanProofToken(existingToken)

  // Only re-use the presented token when it belongs to the caller; never echo a token
  // bound to another student back into this session.
  if (existingVerification.valid && isHumanProofBoundTo(existingVerification, boundUid)) {
    return NextResponse.json({
      captchaEnabled: captchaEnabled,
      humanToken: existingToken,
      expiresAt: existingVerification.expiresAt,
    })
  }

  if (!captchaEnabled) {
    const issued = issueHumanProofToken({ v: 1, uid: boundUid })

    if (!issued) {
      return NextResponse.json({ error: 'Human verification is not configured.' }, { status: 500 })
    }

    return NextResponse.json({
      captchaEnabled: false,
      humanToken: issued.token,
      expiresAt: issued.expiresAt,
    })
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 });
    }

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
      return NextResponse.json({ error: schemaCheck.error }, { status: 400 });
    }

    const token = schemaCheck.value.token;

    const bypassHeader = request.headers.get('x-skillbun-bypass') || '';
    const isLocal = process.env.NODE_ENV === 'development';
    const isBypassed = (token === 'bypass-captcha-dev') || (bypassHeader === 'bypass-captcha-dev');

    if (isBypassed && isLocal) {
      const issued = issueHumanProofToken({ v: 1, uid: boundUid });

      if (!issued) {
        return NextResponse.json({ error: 'Human verification is not configured.' }, { status: 500 });
      }

      return NextResponse.json({
        captchaEnabled: true,
        humanToken: issued.token,
        expiresAt: issued.expiresAt,
      });
    }

    const formBody = new URLSearchParams({
      secret: getTurnstileSecretKey(),
      response: token
    })

    const forwardedFor = request.headers.get('x-forwarded-for') || ''
    const remoteIp = forwardedFor.split(',')[0]?.trim()
    if (remoteIp) {
      formBody.set('remoteip', remoteIp)
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
        return NextResponse.json({ error: 'Human verification is not configured.' }, { status: 500 })
      }

      return NextResponse.json({
        captchaEnabled: true,
        humanToken: issued.token,
        expiresAt: issued.expiresAt
      })
    }

    return NextResponse.json({ error: 'Captcha verification failed.' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Captcha error.' }, { status: 500 })
  }
}
