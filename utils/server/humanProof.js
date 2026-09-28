import crypto from 'node:crypto'

import { getHumanProofSecret, getHumanProofTtlMs } from '@/utils/server/env'

const TOKEN_SEPARATOR = '.'

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function getSignature(payloadSegment, secret) {
  return crypto.createHmac('sha256', secret).update(payloadSegment).digest('base64url')
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function getUsableSecret() {
  const secret = getHumanProofSecret()
  return typeof secret === 'string' && secret.trim() ? secret : ''
}

export function issueHumanProofToken(claims = {}) {
  const secret = getUsableSecret()
  if (!secret) return null

  const issuedAt = Date.now()
  const expiresAt = issuedAt + getHumanProofTtlMs()
  const payload = {
    iat: issuedAt,
    exp: expiresAt,
    ...claims,
  }

  const payloadSegment = toBase64Url(JSON.stringify(payload))
  const signatureSegment = getSignature(payloadSegment, secret)

  return {
    token: `${payloadSegment}${TOKEN_SEPARATOR}${signatureSegment}`,
    expiresAt,
    payload,
  }
}

export function isHumanProofBoundTo(verification, uid) {
  if (!verification?.valid) return false

  const boundUid = typeof verification.payload?.uid === 'string' ? verification.payload.uid : ''

  // Tokens minted before uid binding (legacy, or the pre-auth signup OTP flow) carry no
  // uid. They stay valid so no existing flow breaks; a token bound to a different
  // student is always rejected.
  return boundUid === '' || boundUid === uid
}

export function verifyHumanProofToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, reason: 'missing' }
  }

  const secret = getUsableSecret()
  if (!secret) {
    return { valid: false, reason: 'misconfigured' }
  }

  const [payloadSegment, signatureSegment, ...rest] = token.split(TOKEN_SEPARATOR)
  if (!payloadSegment || !signatureSegment || rest.length > 0) {
    return { valid: false, reason: 'malformed' }
  }

  const expectedSignature = getSignature(payloadSegment, secret)
  if (!safeCompare(signatureSegment, expectedSignature)) {
    return { valid: false, reason: 'invalid-signature' }
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadSegment))
    const expiresAt = Number.parseInt(payload?.exp, 10)

    if (!Number.isFinite(expiresAt)) {
      return { valid: false, reason: 'invalid-expiry' }
    }

    if (expiresAt <= Date.now()) {
      return { valid: false, reason: 'expired', payload }
    }

    return { valid: true, payload, expiresAt }
  } catch {
    return { valid: false, reason: 'invalid-payload' }
  }
}
