import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { submitExamAttempt, ExamError } from '@/utils/server/certificationState.mjs';
import { gradeExamAttempt } from '@/utils/server/certifyEngine';

export const runtime = 'nodejs';

const SUBMIT_RATE_LIMITS = [
  { name: 'submitMinute', windowMs: 60 * 1000, maxRequests: 10, getSubject: ({ uid }) => `user:${uid}` },
  { name: 'submitIpHour', windowMs: 60 * 60 * 1000, maxRequests: 40, getSubject: ({ address }) => `ip:${address}` },
];

export async function POST(request) {
  try {
    // 1. Verify User Authentication
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Authentication required to submit exam.' }, { status: 401 });
    }

    let decodedToken;
    try {
      const adminAuth = getFirebaseAdminAuth();
      if (!adminAuth) {
        return NextResponse.json({ error: 'Server authentication configuration error.' }, { status: 500 });
      }
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired authentication token. Please log in again.' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const address = getClientAddress(request);

    // 2. Rate Limiting Protection
    const rateLimit = await checkServerRateLimit({
      namespace: 'certSubmit',
      subject: { uid, address },
      limits: SUBMIT_RATE_LIMITS,
      increment: true,
      requireDistributed: process.env.NODE_ENV === 'production',
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many exam submission requests. Please wait a moment.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))) },
        }
      );
    }

    // 3. Parse Request Payload
    let rawBody;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 });
    }

    const attemptId = rawBody?.attemptId;
    const answers = rawBody?.answers ?? {};
    const isDevBypass = process.env.NODE_ENV === 'development' && Boolean(rawBody?.isDevBypass);

    // 4. Retrieve and Validate Attempt from Firestore
    const db = getFirebaseAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Database service unavailable.' }, { status: 500 });
    }

    const result = await submitExamAttempt(db, {
      uid, attemptId, answers,
      developmentBypass: isDevBypass,
      grade: (questions, submitted) => {
        if (isDevBypass) return gradeExamAttempt(questions, Object.fromEntries(questions.map((q, i) => [i, q.correctIndex])));
        return gradeExamAttempt(questions, submitted);
      },
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ExamError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error.message === 'Distributed rate limiting is unavailable.') return NextResponse.json({ error: 'Exam service temporarily unavailable.' }, { status: 503 });
    console.error('[Certify Submit API Error]:', { code: error.code || 'EXAM_SUBMIT_FAILED' });
    return NextResponse.json({ error: 'Failed to evaluate exam answers. Please try again.' }, { status: 500 });
  }
}
