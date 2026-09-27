import { NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import { validateString, validateEmail } from '@/utils/server/inputValidator';

export const runtime = 'nodejs';

export async function DELETE(request, { params }) {
  try {
    const { uid } = await params;
    const uidCheck = validateString(uid, {
      fieldName: 'uid',
      minLength: 1,
      maxLength: 128,
      pattern: /^[a-zA-Z0-9_-]+$/,
    });

    if (!uidCheck.isValid) {
      return NextResponse.json({ error: uidCheck.error }, { status: 400 });
    }

    const reqUrl = new URL(request.url);
    const rawEmailParam = reqUrl.searchParams.get('email');
    let emailParam = '';

    if (rawEmailParam) {
      const emailCheck = validateEmail(rawEmailParam);
      if (!emailCheck.isValid) {
        return NextResponse.json({ error: emailCheck.error }, { status: 400 });
      }
      emailParam = emailCheck.normalizedEmail;
    }

    // Verify Admin Authorization
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Authentication token required for admin action' }, { status: 401 });
    }

    let authUserEmail = '';
    try {
      const adminAuth = getFirebaseAdminAuth();
      if (!adminAuth) {
        return NextResponse.json({ error: 'Server authentication configuration error' }, { status: 500 });
      }
      const decodedToken = await adminAuth.verifyIdToken(token);
      authUserEmail = (decodedToken.email || '').toLowerCase();
      const isAdmin = await isUserAuthorizedAdmin(decodedToken);
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden: Admin privileges required' }, { status: 403 });
      }
    } catch (authErr) {
      return NextResponse.json({ error: 'Invalid or expired admin authentication token' }, { status: 401 });
    }

    let firestoreDeleted = false;
    let authDeleted = false;

    // 1. Delete Firestore user document, subcollections, AND issued certificates
    try {
      const db = getFirebaseAdminFirestore();
      if (db) {
        // Delete roadmapProgress subcollection
        const progSnap = await db.collection('users').doc(uid).collection('roadmapProgress').get();
        const progBatch = db.batch();
        progSnap.docs.forEach((doc) => progBatch.delete(doc.ref));
        await progBatch.commit();

        // Delete quizAttempts subcollection
        const quizSnap = await db.collection('users').doc(uid).collection('quizAttempts').get();
        const quizBatch = db.batch();
        quizSnap.docs.forEach((doc) => quizBatch.delete(doc.ref));
        await quizBatch.commit();

        // Delete main user profile document
        await db.collection('users').doc(uid).delete();
        firestoreDeleted = true;

        // Cascade delete all issued certificates belonging to this user (by UID and Email)
        const certBatch = db.batch();
        let certsToDeleteCount = 0;

        const certsByUid = await db.collection('certificates').where('uid', '==', uid).get();
        certsByUid.docs.forEach((cDoc) => {
          certBatch.delete(cDoc.ref);
          certsToDeleteCount++;
        });

        if (emailParam && emailParam.includes('@')) {
          const certsByEmail = await db.collection('certificates').where('email', '==', emailParam.toLowerCase()).get();
          certsByEmail.docs.forEach((cDoc) => {
            certBatch.delete(cDoc.ref);
            certsToDeleteCount++;
          });
        }

        if (certsToDeleteCount > 0) {
          await certBatch.commit();
          console.warn(`[Admin Delete]: Cascade deleted ${certsToDeleteCount} certificates for user ${uid} (${emailParam}).`);
        }
      }
    } catch (dbErr) {
      console.warn('[Admin Delete Firestore Error]:', dbErr.message);
    }

    // 2. Delete Firebase Auth User Account (by UID and by Email to free up email address for new signup)
    try {
      const adminAuth = getFirebaseAdminAuth();
      if (adminAuth) {
        // Delete by UID
        try {
          await adminAuth.deleteUser(uid);
          authDeleted = true;
        } catch (e1) {
          console.warn('[Admin Delete Auth UID Notice]:', e1.message);
        }

        // Delete by Email if provided to guarantee email is completely freed up
        if (emailParam && emailParam.includes('@')) {
          try {
            const userByEmail = await adminAuth.getUserByEmail(emailParam);
            if (userByEmail?.uid) {
              await adminAuth.deleteUser(userByEmail.uid);
              authDeleted = true;
            }
          } catch (e2) {
            console.warn('[Admin Delete Auth Email Notice]:', e2.message);
          }
        }
      }
    } catch (authDeleteErr) {
      console.warn('[Admin Delete Auth Account Error]:', authDeleteErr.message);
    }

    // Invalidate cached analytics and certificates
    try {
      const { invalidateCacheTag } = await import('@/utils/server/redisCache');
      await Promise.all([
        invalidateCacheTag('admin:analytics'),
        invalidateCacheTag('admin:certs'),
      ]);
    } catch (cacheErr) {
      console.warn('[Admin Delete Cache Invalidation Warning]:', cacheErr.message);
    }

    return NextResponse.json({
      success: true,
      message: `Student account (${uid}) and associated certificates permanently deleted. Email address freed up.`,
      firestoreDeleted,
      authDeleted,
    });
  } catch (error) {
    console.error('Admin Delete User API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete user account' }, { status: 500 });
  }
}
