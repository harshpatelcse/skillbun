import { passwordResetOrigin, canonicalPasswordResetLink } from '@/utils/server/passwordResetOrigin.mjs'
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';

import { getAppOrigin } from '@/utils/server/env'
import { getFirebaseAdminAuth } from '@/utils/server/firebaseAdmin'
import { checkServerRateLimit, hashRateLimitSubject } from '@/utils/server/rateLimitStore'
import { sendSkillBunPasswordResetEmail } from '@/utils/server/zohoMailer'
import { validateSchema } from '@/utils/server/inputValidator'
import { getClientAddress } from '@/utils/server/requestUtils'

export const runtime = 'nodejs'

const RATE_LIMITS = [
  { name: 'emailMinute', windowMs: 60 * 1000, maxRequests: 1, getSubject: ({ email }) => `email:${email}` },
  { name: 'emailHour', windowMs: 60 * 60 * 1000, maxRequests: 3, getSubject: ({ email }) => `email:${email}` },
  { name: 'ipHour', windowMs: 60 * 60 * 1000, maxRequests: 10, getSubject: ({ address }) => `ip:${address}` },
]

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

async function checkRateLimit({ address, email, increment = true }) {
  return checkServerRateLimit({
    namespace: 'passwordReset',
    subject: { address, email },
    limits: RATE_LIMITS,
    increment,
    requireDistributed: process.env.NODE_ENV === 'production',
  })
}

function retryAfterSeconds(ms) {
  return String(Math.max(1, Math.ceil(ms / 1000)))
}

function okResponse() {
  return NextResponse.json({ ok: true })
}

function getPasswordResetBaseUrl(request) {
  return passwordResetOrigin({ configuredOrigin: getAppOrigin(), requestOrigin: request.headers.get('origin') || new URL(request.url).origin });
}

function buildActionCodeSettings(request) {
  const baseUrl = getPasswordResetBaseUrl(request)

  return {
    url: `${baseUrl}/auth?mode=login`,
    handleCodeInApp: false,
  }
}

export async function POST(request) {
  let email = ''

  try {
    let rawBody
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 })
    }

    const schemaCheck = validateSchema(rawBody, {
      email: { type: 'email', required: true, label: 'Email address' },
    }, {
      fieldName: 'Password reset payload',
      allowUnknown: false,
      maxKeys: 1,
    })

    if (!schemaCheck.isValid) {
      return NextResponse.json({ error: schemaCheck.error }, { status: 400 })
    }

    email = schemaCheck.value.email

    const address = getClientAddress(request)
    // Reserve before looking up the user or sending mail; concurrent requests
    // must not all pass the same unconsumed allowance.
    const rateLimit = await checkRateLimit({ address, email, increment: true })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Please wait before requesting another reset email.', retryAfterMs: rateLimit.retryAfterMs },
        {
          status: 429,
          headers: { 'Retry-After': retryAfterSeconds(rateLimit.retryAfterMs) },
        }
      )
    }

    const auth = getFirebaseAdminAuth()

    try {
      await auth.getUserByEmail(email)
    } catch (error) {
      if (error?.code === 'auth/user-not-found') {
        return okResponse()
      }

      throw error
    }

    const rawResetLink = await auth.generatePasswordResetLink(email, buildActionCodeSettings(request))
    const baseUrl = getPasswordResetBaseUrl(request)
    const resetLink = canonicalPasswordResetLink(rawResetLink, baseUrl)

    await sendSkillBunPasswordResetEmail({ email, resetLink })

    return okResponse()
  } catch (error) {
    console.error('Password reset request failed:', {
      code: error?.code || '',
      message: 'Password reset operation failed.',
      emailHash: email ? hashRateLimitSubject(email).slice(0, 32) : '',
    })

    return NextResponse.json({ error: 'Could not send password reset email. Please try again later.' }, { status: 503 })
  }
}
