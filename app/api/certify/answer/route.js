import { NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { validateSchema } from '@/utils/server/inputValidator';
import { recordExamAnswer, ExamError } from '@/utils/server/certificationState.mjs';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' };
const respond = (body, status = 200, headers = {}) => NextResponse.json(body, { status, headers: { ...noStore, ...headers } });
const limits = [
  { name: 'answerUserMinute', windowMs: 60000, maxRequests: 40, getSubject: ({ uid }) => `user:${uid}` },
  { name: 'answerIpMinute', windowMs: 60000, maxRequests: 120, getSubject: ({ address }) => `ip:${address}` },
];

export async function POST(request) {
  try {
    const token = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/)?.[1];
    if (!token) return respond({ error: 'Authentication required.' }, 401);
    let identity;
    try { identity = await getFirebaseAdminAuth()?.verifyIdToken(token); } catch { return respond({ error: 'Invalid or expired authentication token.' }, 401); }
    if (!identity?.uid) return respond({ error: 'Authentication service unavailable.' }, 503);
    const limit = await checkServerRateLimit({ namespace: 'certAnswer', subject: { uid: identity.uid, address: getClientAddress(request) }, limits, increment: true, requireDistributed: process.env.NODE_ENV === 'production' });
    if (limit.unavailable) return respond({ error: 'Exam service temporarily unavailable.' }, 503);
    if (!limit.allowed) return respond({ error: 'Too many answer requests. Please wait.' }, 429, { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) });
    let body;
    try { body = await request.json(); } catch { return respond({ error: 'Payload must be valid JSON.' }, 400); }
    const checked = validateSchema(body, {
      attemptId: { type: 'string', required: true, pattern: /^att_[A-Za-z0-9_-]{6,116}$/, maxLength: 120 },
      questionIndex: { type: 'integer', required: true, min: 0, max: 9 },
      choice: { type: 'integer', required: true, min: -1, max: 3 },
    }, { allowUnknown: false, fieldName: 'Exam answer', maxKeys: 3 });
    if (!checked.isValid) return respond({ error: checked.error }, 400);
    const db = getFirebaseAdminFirestore();
    if (!db) return respond({ error: 'Exam service temporarily unavailable.' }, 503);
    return respond(await recordExamAnswer(db, { uid: identity.uid, ...checked.value }));
  } catch (error) {
    if (error instanceof ExamError) return respond({ error: error.message }, error.status);
    if (error.message === 'Distributed rate limiting is unavailable.') return respond({ error: 'Exam service temporarily unavailable.' }, 503);
    if (error.code === 'auth/account-deleting') return respond({ error: 'Account deletion is in progress.' }, 409);
    console.error('[Certify Answer]', { code: error.code || 'EXAM_ANSWER_FAILED' });
    return respond({ error: 'Could not save your answer. Please retry.' }, 500);
  }
}
