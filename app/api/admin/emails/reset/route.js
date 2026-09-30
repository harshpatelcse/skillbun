import { NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { invalidateCacheTag } from '@/utils/server/redisCache';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    // 0. Verify Admin Authorization
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Authentication required for admin access' }, { status: 401 });
    }

    let adminUid;
    try {
      const adminAuth = getFirebaseAdminAuth();
      if (!adminAuth) {
        return NextResponse.json({ error: 'Server authentication configuration error' }, { status: 500 });
      }
      const decodedToken = await adminAuth.verifyIdToken(token);
      const isAdmin = await isUserAuthorizedAdmin(decodedToken);
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden: Admin privileges required' }, { status: 403 });
      }
      adminUid = decodedToken.uid;
    } catch (authErr) {
      return NextResponse.json({ error: 'Invalid or expired authentication token' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'A valid JSON reset request is required' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.resetAll !== 'boolean') {
      return NextResponse.json({ error: 'resetAll must be an explicit boolean' }, { status: 400 });
    }

    const { resetAll, targetEmail, targetUid } = body;
    const hasUid = Object.hasOwn(body, 'targetUid');
    const hasEmail = Object.hasOwn(body, 'targetEmail');
    const validUid = typeof targetUid === 'string' && targetUid.length > 0 && targetUid.length <= 128
      && targetUid === targetUid.trim() && !/[\s/\u0000-\u001f\u007f]/.test(targetUid) && targetUid !== '.' && targetUid !== '..';
    const validEmail = typeof targetEmail === 'string' && targetEmail.trim().length <= 254
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail.trim());

    // Bulk resets require an explicit choice with no target; invalid single targets never fall through to bulk.
    if ((resetAll && (hasUid || hasEmail)) || (!resetAll && (
      (!hasUid && !hasEmail) || (hasUid && !validUid) || (hasEmail && !validEmail)
    ))) {
      return NextResponse.json({ error: 'Choose a bulk reset or provide a valid student UID and/or email' }, { status: 400 });
    }

    const limit = await checkServerRateLimit({
      namespace: resetAll ? 'adminEmailResetAll' : 'adminEmailReset', subject: adminUid,
      limits: [{ name: 'minute', windowMs: 60_000, maxRequests: resetAll ? 3 : 30 }],
    });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many email reset requests. Please try again shortly.' }, {
      status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
    });

    const normalizedEmail = hasEmail ? targetEmail.trim().toLowerCase() : '';
    const db = getFirebaseAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    // 1. Single User Reset
    if (!resetAll) {
      let userDocRef = null;

      if (hasUid) {
        const docRef = db.collection('users').doc(targetUid);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          if (hasEmail && String(docSnap.data()?.email || '').trim().toLowerCase() !== normalizedEmail) {
            return NextResponse.json({ error: 'Student UID and email do not match' }, { status: 400 });
          }
          userDocRef = docRef;
        }
      } else {
        const emailSnap = await db.collection('users').where('email', '==', normalizedEmail).limit(2).get();
        if (emailSnap.docs.length > 1) {
          return NextResponse.json({ error: 'Multiple student records match this email; provide a UID' }, { status: 400 });
        }
        if (!emailSnap.empty) {
          userDocRef = emailSnap.docs[0].ref;
        }
      }

      if (!userDocRef) {
        return NextResponse.json({ error: 'Student document not found in Firestore' }, { status: 404 });
      }

      await userDocRef.update({ sentEmailHistory: [] });
      await invalidateCacheTag('admin:analytics');
      return NextResponse.json({
        success: true,
        message: `Sent email counter reset to 0 for ${normalizedEmail || targetUid}.`,
        resetCount: 1,
      });
    }

    // 2. Bulk Reset: Clear sentEmailHistory for all users in Firestore
    const usersSnap = await db.collection('users').get();
    if (usersSnap.empty) {
      return NextResponse.json({
        success: true,
        message: 'No student records found to reset.',
        resetCount: 0,
      });
    }

    // Firestore batch writes limit is 500 ops per batch
    const docs = usersSnap.docs;
    const batchSize = 400;
    let totalUpdated = 0;

    for (let i = 0; i < docs.length; i += batchSize) {
      const chunk = docs.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach((docSnap) => {
        batch.update(docSnap.ref, { sentEmailHistory: [] });
        totalUpdated++;
      });
      await batch.commit();
    }

    await invalidateCacheTag('admin:analytics');

    return NextResponse.json({
      success: true,
      message: `Sent email counters successfully reset to 0 for all ${totalUpdated} students.`,
      resetCount: totalUpdated,
    });
  } catch (err) {
    console.error('Reset Sent Email Counter API Error:', err);
    return NextResponse.json({
      error: 'Internal server error while resetting sent email counters.',
      details: err?.message,
    }, { status: 500 });
  }
}
