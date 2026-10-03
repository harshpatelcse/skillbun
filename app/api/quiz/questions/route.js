import { assertAdultStudent, StudentEligibilityError } from '@/utils/server/studentEligibility.mjs';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs'
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin'
import { verifyHumanProofToken, isHumanProofBoundTo } from '@/utils/server/humanProof'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createDecipheriv, createHmac, createHash } from 'crypto'

export const runtime = 'nodejs'

const SB_PEPPER = Buffer.from('SkillBunVault2026!HopIntoSecurity@SBV1#Pepper$Key%Guard', 'utf8')

function deriveFileKey(masterKeyHex, salt, fileIdentity) {
  const masterKey = Buffer.from(masterKeyHex, 'hex')
  const prk = createHmac('sha256', salt).update(masterKey).digest()
  const info = Buffer.from(`sbv1:quiz:${fileIdentity}`, 'utf8')
  return createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest()
}

function xorScramble(data) {
  const result = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ SB_PEPPER[i % SB_PEPPER.length] ^ ((i * 7 + 13) & 0xFF)
  }
  return result
}

function normalizeEncryptionKey(value) {
  return (value || '').trim().replace(/^['"]|['"]$/g, '')
}

function decryptSBV1(filePath, encryptionKey, fileIdentity) {
  const data = readFileSync(filePath)

  const magic = data.subarray(0, 4).toString('ascii')
  if (magic !== 'SBV1') {
    throw new Error('Invalid SBV1 file format')
  }

  const version = data[4]
  if (version !== 0x01) {
    throw new Error(`Unsupported SBV1 version: ${version}`)
  }

  const salt = data.subarray(5, 21)
  const iv = data.subarray(21, 33)
  const authTag = data.subarray(33, 49)
  const contentHash = data.subarray(49, 81)
  const cipherText = data.subarray(81)

  const fileKey = deriveFileKey(encryptionKey, salt, fileIdentity)

  const decipher = createDecipheriv('aes-256-gcm', fileKey, iv)
  decipher.setAuthTag(authTag)
  const scrambled = Buffer.concat([decipher.update(cipherText), decipher.final()])

  const plaintext = xorScramble(scrambled)

  const actualHash = createHash('sha256').update(plaintext).digest()
  if (!actualHash.equals(contentHash)) {
    throw new Error('Content integrity check failed — quiz data corrupted')
  }

  return plaintext.toString('utf-8')
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!idToken) {
    return NextResponse.json(
      { error: 'Authentication required. Please log in to access the quiz.' },
      { status: 401 }
    )
  }

  let quizUid = ''
  try {
    const decodedQuizToken = await getFirebaseAdminAuth().verifyIdToken(idToken)
    quizUid = typeof decodedQuizToken?.uid === 'string' ? decodedQuizToken.uid : ''
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired authentication token. Please log in again.' },
      { status: 401 }
    )
  }

  try { await assertAdultStudent(getFirebaseAdminFirestore(), quizUid); }
  catch (error) { return NextResponse.json({ error: error instanceof StudentEligibilityError ? error.message : 'Student eligibility is temporarily unavailable.' }, { status: error instanceof StudentEligibilityError ? error.status : 503 }); }

  const token = request.headers.get('x-skillbun-human') || ''
  const verification = verifyHumanProofToken(token)
  if (!isHumanProofBoundTo(verification, quizUid)) {
    return NextResponse.json({ error: 'Human verification required.' }, { status: 403 })
  }

  try {
    const quota = await checkServerRateLimit({
      namespace: 'quizQuestions', subject: { uid: quizUid, address: getClientAddress(request) },
      limits: [
        { name: 'userMinute', windowMs: 60000, maxRequests: 12, getSubject: s => `uid:${s.uid}` },
        { name: 'ipHour', windowMs: 3600000, maxRequests: 120, getSubject: s => `ip:${s.address}` },
      ], requireDistributed: process.env.NODE_ENV === 'production',
    });
    if (!quota.allowed) return NextResponse.json({ error: 'Too many quiz reloads. Please wait.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000))) } });
  } catch { return NextResponse.json({ error: 'Quiz protection is temporarily unavailable.' }, { status: 503 }); }

  const encryptionKey = normalizeEncryptionKey(process.env.DOCS_ENCRYPTION_KEY)
  if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
    console.error('DOCS_ENCRYPTION_KEY is not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    const filePath = join(process.cwd(), 'content', 'quiz', 'questions.sbv')

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Quiz question bank not found' }, { status: 404 })
    }

    const quizJson = decryptSBV1(filePath, encryptionKey, 'questions')
    const payload = JSON.parse(quizJson)

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-cache, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('Error serving encrypted quiz questions:', err)
    return NextResponse.json(
      { error: 'Failed to load quiz questions. Please try again.' },
      { status: 500 }
    )
  }
}
