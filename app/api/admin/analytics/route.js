import { NextResponse } from 'next/server';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import fs from 'fs';
import path from 'path';
import { enrichEmailProgress } from '@/utils/server/emailStudentContext';
import { emailTime } from '@/utils/shared/emailRecommendation';
import { getOrSetCache, createCachedJsonResponse } from '@/utils/server/redisCache';

export const runtime = 'nodejs';

/**
 * Concurrently maps items with bounded worker concurrency to prevent database overload
 */
async function mapConcurrently(items, concurrency, fn) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function computeAdminAnalytics() {
  const roadmapsDir = path.join(process.cwd(), 'public', 'data', 'roadmaps');
  const quizzesDir = path.join(process.cwd(), 'public', 'data', 'quizzes');

  // Count available roadmap JSON files
  let roadmapsCount = 0;
  if (fs.existsSync(roadmapsDir)) {
    roadmapsCount = fs.readdirSync(roadmapsDir).filter((f) => f.endsWith('.json')).length;
  }

  // Count static quizzes & total question bank
  let quizFilesCount = 0;
  let totalQuestionsCount = 0;
  if (fs.existsSync(quizzesDir)) {
    const files = fs.readdirSync(quizzesDir).filter((f) => f.endsWith('.json'));
    quizFilesCount = files.length;
    files.forEach((file) => {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(quizzesDir, file), 'utf8'));
        if (Array.isArray(content)) {
          totalQuestionsCount += content.length;
        }
      } catch (e) {}
    });
  }

  let usersList = [];
  let certsList = [];
  let authUsersMap = {};
  let unsubscribedEmailsMap = {};

  // 1. Fetch Firebase Auth Users metadata (lastSignInTime, creationTime)
  try {
    const adminAuth = getFirebaseAdminAuth();
    if (adminAuth) {
      const listUsersResult = await adminAuth.listUsers(1000);
      listUsersResult.users.forEach((userRecord) => {
        authUsersMap[userRecord.uid] = {
          lastSignInTime: userRecord.metadata?.lastSignInTime
            ? new Date(userRecord.metadata.lastSignInTime).toISOString()
            : null,
          creationTime: userRecord.metadata?.creationTime
            ? new Date(userRecord.metadata.creationTime).toISOString()
            : null,
          email: userRecord.email || '',
          displayName: userRecord.displayName || '',
          providers: userRecord.providerData?.map((p) => p.providerId) || [],
        };
      });
    }
  } catch (authErr) {
    console.warn('[Admin Analytics API] Firebase Auth listUsers warning:', authErr.message);
  }

  // 2. Fetch Firestore Users, Unsubscribes, Roadmap Progress, Quiz Attempts, and Certificates
  try {
    const db = getFirebaseAdminFirestore();
    if (db) {
      // Fetch unsubscribed emails map
      try {
        const unsubSnap = await db.collection('unsubscribes').get();
        unsubSnap.docs.forEach((uDoc) => {
          const uData = uDoc.data();
          unsubscribedEmailsMap[uDoc.id.toLowerCase()] = {
            unsubscribedAt: uData.unsubscribedAt || null,
          };
        });
      } catch (unsubErr) {
        console.warn('[Admin Analytics API] Unsubscribes fetch warning:', unsubErr.message);
      }

      // Fetch all raw certificates from Firestore
      const certsSnap = await db.collection('certificates').orderBy('createdAt', 'desc').get();
      const rawCerts = certsSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          certId: doc.id,
          ref: doc.ref,
          uid: data.uid || '',
          name: data.name || data.studentName || data.userName || 'Anonymous Student',
          email: (data.email || data.userEmail || '').toLowerCase(),
          roadmapTitle: data.roadmapTitle || data.roadmapSlug || 'Roadmap',
          roadmapSlug: data.roadmapSlug || '',
          score: typeof data.score === 'number' ? data.score : 0,
          createdAt: data.createdAt ? new Date(data.createdAt.toDate?.() || data.createdAt).toISOString() : null,
        };
      });

      // Fetch all real user documents from Firestore with selective field projection
      const usersSnap = await db
        .collection('users')
        .select('name', 'email', 'degree', 'year', 'interest', 'createdAt', 'updatedAt', 'emailVerified', 'role', 'status')
        .get();
      const processedUids = new Set();
      const activeUserUids = new Set();
      const activeUserEmails = new Set();

      // Parallel batch fetch for user subcollections (roadmapProgress & quizAttempts) with concurrency limit 12
      const fetchedUsers = await mapConcurrently(usersSnap.docs, 12, async (userDoc) => {
        const uData = userDoc.data();
        const uid = userDoc.id;
        processedUids.add(uid);
        activeUserUids.add(uid);

        const authMeta = authUsersMap[uid] || {};
        const userEmailLower = (uData.email || authMeta.email || '').toLowerCase();
        if (userEmailLower) activeUserEmails.add(userEmailLower);

        const unsubMeta = unsubscribedEmailsMap[userEmailLower];
        const isUnsubscribed = Boolean(unsubMeta);
        const unsubscribedAt = isUnsubscribed ? unsubMeta.unsubscribedAt : null;

        // Fetch user's roadmap progress and quiz attempts concurrently
        const [progressList, quizAttemptsList] = await Promise.all([
          db
            .collection('users')
            .doc(uid)
            .collection('roadmapProgress')
            .get()
            .then((progSnap) =>
              progSnap.docs.map((pDoc) => {
                const pData = pDoc.data();
                return {
                  slug: pDoc.id,
                  completedNodeIds: Array.isArray(pData.completedNodeIds) ? pData.completedNodeIds : [],
                  updatedAt: pData.updatedAt
                    ? new Date(pData.updatedAt.toDate?.() || pData.updatedAt).toISOString()
                    : null,
                };
              })
            )
            .catch(() => []),
          db
            .collection('users')
            .doc(uid)
            .collection('quizAttempts')
            .get()
            .then((quizSnap) =>
              quizSnap.docs.map((qDoc) => {
                const qData = qDoc.data();
                return {
                  slug: qDoc.id,
                  attemptsCount: Array.isArray(qData.attempts) ? qData.attempts.length : 0,
                  lastAttemptAt: qData.lastAttemptAt ? new Date(qData.lastAttemptAt).toISOString() : null,
                  updatedAt: qData.updatedAt ? new Date(qData.updatedAt).toISOString() : null,
                };
              })
            )
            .catch(() => []),
        ]);

        return {
          uid,
          name: uData.name || uData.displayName || uData.fullName || authMeta.displayName || 'Registered Student',
          email: uData.email || authMeta.email || 'N/A',
          degree: uData.degree || 'N/A',
          year: uData.year || uData.current_year || 'N/A',
          interest: uData.interest || uData.interest_area || 'N/A',
          providers: Array.isArray(uData.providers) && uData.providers.length > 0 ? uData.providers : (authMeta.providers || []),
          createdAt: uData.createdAt ? new Date(uData.createdAt.toDate?.() || uData.createdAt).toISOString() : (authMeta.creationTime || null),
          lastSignInTime: authMeta.lastSignInTime || null,
          isUnsubscribed,
          unsubscribedAt,
          progress: progressList,
          quizAttempts: quizAttemptsList,
          sentEmailHistory: Array.isArray(uData.sentEmailHistory) ? uData.sentEmailHistory : [],
          certificates: [], // Populated after filtering
        };
      });

      usersList.push(...fetchedUsers);

      // Include any Auth users who haven't created a Firestore profile document yet
      Object.keys(authUsersMap).forEach((authUid) => {
        if (!processedUids.has(authUid)) {
          const authMeta = authUsersMap[authUid];
          const userEmailLower = (authMeta.email || '').toLowerCase();
          activeUserUids.add(authUid);
          if (userEmailLower) activeUserEmails.add(userEmailLower);

          const unsubMeta = unsubscribedEmailsMap[userEmailLower];
          const isUnsubscribed = Boolean(unsubMeta);
          const unsubscribedAt = isUnsubscribed ? unsubMeta.unsubscribedAt : null;

          usersList.push({
            uid: authUid,
            name: authMeta.displayName || 'Auth User',
            email: authMeta.email || 'N/A',
            degree: 'N/A',
            year: 'N/A',
            interest: 'N/A',
            providers: authMeta.providers || [],
            createdAt: authMeta.creationTime || null,
            lastSignInTime: authMeta.lastSignInTime || authMeta.creationTime || null,
            isUnsubscribed,
            unsubscribedAt,
            progress: [],
            quizAttempts: [],
            sentEmailHistory: [],
            certificates: [],
          });
        }
      });

      // Clean up Orphaned Certificates (Certificates belonging to deleted users that no longer exist in usersList)
      const orphanedCertRefs = [];
      certsList = rawCerts.filter((c) => {
        const isValidUserCert =
          (c.uid && activeUserUids.has(c.uid)) ||
          (c.email && activeUserEmails.has(c.email));

        if (!isValidUserCert) {
          if (c.ref) orphanedCertRefs.push(c.ref);
          return false;
        }
        return true;
      });

      // Automatically purge orphaned certificate records from Firestore
      if (orphanedCertRefs.length > 0) {
        try {
          const purgeBatch = db.batch();
          orphanedCertRefs.forEach((ref) => purgeBatch.delete(ref));
          await purgeBatch.commit();
          console.warn(`[Admin Analytics]: Automatically wiped ${orphanedCertRefs.length} orphaned certificates belonging to deleted accounts.`);
        } catch (purgeErr) {
          console.warn('[Admin Analytics Purge Warning]:', purgeErr.message);
        }
      }

      // Recommendation evidence excludes question banks and submitted answers.
      let examOutcomes = [];
      try {
        const outcomes = await db.collection('examAttempts').select('uid', 'roadmapSlug', 'status', 'passed', 'submittedAt').get();
        examOutcomes = outcomes.docs.map(d => ({ ...d.data(), id: d.id, submittedAt: emailTime(d.data().submittedAt) }));
      } catch { /* Unknown exam results never imply a failed exam. */ }

      await Promise.all(usersList.map(async u => {
        u.progress = await enrichEmailProgress(u.progress);
        u.examOutcomes = examOutcomes.filter(exam => exam.uid === u.uid);
      }));

      // Link valid certificates back to their respective active users
      usersList.forEach((u) => {
        const userEmailLower = (u.email || '').toLowerCase();
        u.certificates = certsList.filter(
          (c) => c.uid === u.uid || (c.email && userEmailLower && c.email === userEmailLower)
        );
      });
    }
  } catch (err) {
    console.warn('[Admin Analytics API] Firestore server fetch:', err.message);
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    stats: {
      totalStudents: usersList.length,
      totalCertificates: certsList.length,
      totalRoadmaps: roadmapsCount,
      quizQuestionBank: totalQuestionsCount,
      quizCategoriesCount: quizFilesCount,
    },
    users: usersList,
    certificates: certsList.map(({ ref, ...rest }) => rest), // Strip internal ref property before sending JSON
  };
}

export async function GET(request) {
  try {
    // 0. Verify Admin Authorization
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Authentication required for admin access' }, { status: 401 });
    }

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
    } catch (authErr) {
      return NextResponse.json({ error: 'Invalid or expired authentication token' }, { status: 401 });
    }

    // High-speed cached execution with SWR and single-flight protection
    const analyticsData = await getOrSetCache(
      'admin:analytics:overview',
      60, // 60 seconds fresh TTL
      computeAdminAnalytics,
      {
        tags: ['admin:analytics', 'admin:crm'],
        swr: true,
      }
    );

    return createCachedJsonResponse(request, analyticsData);
  } catch (error) {
    console.error('[Admin Analytics API Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics stats' },
      { status: 500 }
    );
  }
}
