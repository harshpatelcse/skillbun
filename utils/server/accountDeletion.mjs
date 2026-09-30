import { randomUUID } from 'node:crypto';

const PAGE_SIZE = 100;
const LEASE_MS = 60_000;
const COMPLETE = Object.freeze({ success: true, status: 'complete', firestoreDeleted: true, authDeleted: true });
const PENDING = Object.freeze({ success: false, status: 'pending', retryAfterMs: 1000 });

export class AccountDeletionError extends Error {
  constructor(message, status, code, retryable = false) {
    super(message);
    this.name = 'AccountDeletionError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

class DeletionYield extends Error {}

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function timestamp(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return typeof value === 'string' && value ? Date.parse(value) : NaN;
}

function isRoadmapCertificate(data, uid, verifiedEmail, startedAt, authCreatedAt, byEmail) {
  if (data.employee_id !== undefined && data.employee_id !== null && data.employee_id !== '') return false;
  const legacyRoadmap = (data.cert_type === undefined || data.cert_type === null || data.cert_type === '')
    && (/^[a-z0-9_]{1,80}$/.test(data.roadmapSlug || '') || /^att_[A-Za-z0-9_-]{6,116}$/.test(data.attemptId || ''))
    && !['department', 'designation', 'start_date', 'end_date', 'recommendation_text'].some(field => data[field]);
  if (data.cert_type !== 'ROADMAP' && !legacyRoadmap) return false;
  if (!byEmail) return data.uid === uid;
  // Email-only legacy credentials are eligible only with authoritative ownership
  // within this account's lifetime. Never claim another UID's credential.
  const issuedAt = timestamp(data.createdAt);
  const unowned = data.uid === undefined || data.uid === null || data.uid === '';
  return unowned && verifiedEmail && normalizedEmail(data.email) === verifiedEmail
    && Number.isFinite(issuedAt) && Number.isFinite(authCreatedAt)
    && issuedAt >= authCreatedAt && issuedAt <= startedAt;
}

/**
 * Resumable student-data deletion. The caller authorizes the operation; all
 * writers and client rules must honor the durable accountDeletions marker.
 * Workforce/legal records, unsubscribe preferences, and abuse counters survive.
 */
export async function deleteStudentAccount({ db, auth, uid, expectedEmail = '', now = Date.now, budgetMs = 15_000 }) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
    throw new AccountDeletionError('A valid account ID is required.', 400, 'INVALID_ACCOUNT_ID');
  }
  if (!db || !auth || typeof auth.getUser !== 'function' || typeof auth.deleteUser !== 'function') {
    throw new AccountDeletionError('Account deletion is temporarily unavailable.', 503, 'DELETION_UNAVAILABLE', true);
  }
  const clock = typeof now === 'function' ? now : () => Number(now);
  const started = clock();
  const deadline = started + Math.max(1, Math.min(20_000, Number(budgetMs) || 15_000));
  const owner = randomUUID();
  const markerRef = db.collection('accountDeletions').doc(uid);
  const userRef = db.collection('users').doc(uid);
  let acquired = false;
  let job;

  function checkBudget() {
    if (clock() >= deadline) throw new DeletionYield();
  }

  async function ownedTransaction(work, { budget = true } = {}) {
    if (budget) checkBudget();
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(markerRef);
      const current = snapshot.data() || {};
      if (!snapshot.exists || current.status === 'complete' || current.leaseOwner !== owner) throw new DeletionYield();
      const result = await work(tx, current);
      return result;
    });
  }

  async function checkpoint(patch) {
    await ownedTransaction(async tx => {
      tx.set(markerRef, { ...patch, updatedAt: clock(), leaseExpiresAt: clock() + LEASE_MS }, { merge: true });
    });
    job = { ...job, ...patch };
  }

  async function deletePage(documents, accepts = () => true, markerPatch = {}) {
    await ownedTransaction(async tx => {
      const snapshots = await Promise.all(documents.map(document => tx.get(document.ref || document)));
      for (const snapshot of snapshots) {
        if (snapshot.exists && accepts(snapshot.data() || {})) tx.delete(snapshot.ref);
      }
      tx.set(markerRef, { ...markerPatch, updatedAt: clock(), leaseExpiresAt: clock() + LEASE_MS }, { merge: true });
    });
    job = { ...job, ...markerPatch };
  }

  async function drainQuery(query, accepts) {
    while (true) {
      checkBudget();
      const snapshot = await query.limit(PAGE_SIZE).get();
      if (!snapshot.docs.length) return;
      await deletePage(snapshot.docs, accepts);
    }
  }

  async function drainCollection(collection) {
    while (true) {
      checkBudget();
      const snapshot = await collection.limit(PAGE_SIZE).get();
      if (!snapshot.docs.length) return;
      const descendants = await Promise.all(snapshot.docs.map(document => document.ref.listCollections()));
      for (const collections of descendants) {
        for (const nested of collections) await drainCollection(nested);
      }
      await deletePage(snapshot.docs);
    }
  }

  async function deleteSubtree(documentRef) {
    checkBudget();
    const collections = await documentRef.listCollections();
    for (const collection of collections) await drainCollection(collection);
    await deletePage([documentRef]);
  }

  async function drainCertificates(byEmail) {
    if (byEmail && !job.verifiedEmail) return;
    const query = db.collection('certificates')
      .where(byEmail ? 'email' : 'uid', '==', byEmail ? job.verifiedEmail : uid)
      .orderBy('__name__');
    while (true) {
      checkBudget();
      const page = job.cursor ? query.startAfter(job.cursor) : query;
      const snapshot = await page.limit(PAGE_SIZE).get();
      if (!snapshot.docs.length) return;
      await deletePage(snapshot.docs,
        data => isRoadmapCertificate(data, uid, job.verifiedEmail, job.startedAt, job.authCreatedAt, byEmail),
        { cursor: snapshot.docs.at(-1).id });
    }
  }

  async function release() {
    await ownedTransaction(async tx => {
      tx.set(markerRef, { status: 'pending', leaseOwner: null, leaseExpiresAt: 0, updatedAt: clock() }, { merge: true });
    }, { budget: false }).catch(() => {});
  }

  async function lookupAuthUser() {
    try { return await auth.getUser(uid); }
    catch (error) {
      if (error?.code === 'auth/user-not-found') return null;
      throw error;
    }
  }

  async function confirmCompletedDeletion() {
    if (await lookupAuthUser()) {
      throw new AccountDeletionError('The account ID now belongs to an existing Auth identity. Review it before taking further action.', 409, 'ACCOUNT_IDENTITY_MISMATCH');
    }
    return { ...COMPLETE };
  }

  try {
    const previousSnapshot = await markerRef.get();
    if (previousSnapshot.data()?.status === 'complete') return await confirmCompletedDeletion();

    const authUser = await lookupAuthUser();
    if (authUser && authUser.uid !== uid) {
      throw new AccountDeletionError('The account identity could not be confirmed.', 409, 'ACCOUNT_IDENTITY_MISMATCH');
    }
    const expected = normalizedEmail(expectedEmail);
    const identityEmail = normalizedEmail(authUser?.email);
    const previous = previousSnapshot.data() || {};
    if (expected && (authUser ? expected !== identityEmail : previous.identityEmail && expected !== previous.identityEmail)) {
      throw new AccountDeletionError('The email does not belong to the selected account.', 409, 'ACCOUNT_IDENTITY_MISMATCH');
    }
    const authCreatedAt = timestamp(authUser?.metadata?.creationTime);
    if (authUser && !Number.isFinite(authCreatedAt)) {
      throw new AccountDeletionError('The account identity could not be confirmed. Please try again later.', 409, 'ACCOUNT_IDENTITY_MISMATCH');
    }
    if (authUser && Number.isFinite(previous.authCreatedAt) && authCreatedAt !== previous.authCreatedAt) {
      throw new AccountDeletionError('The account identity changed. Review it before retrying deletion.', 409, 'ACCOUNT_IDENTITY_MISMATCH');
    }

    job = await db.runTransaction(async tx => {
      const snapshot = await tx.get(markerRef);
      const current = snapshot.data() || {};
      if (current.status === 'complete') return current;
      if (current.leaseOwner && Number(current.leaseExpiresAt) > clock()) return null;
      if (expected && current.identityEmail && expected !== current.identityEmail) {
        throw new AccountDeletionError('The email does not belong to the selected account.', 409, 'ACCOUNT_IDENTITY_MISMATCH');
      }
      const next = snapshot.exists ? { ...current } : {
        status: 'pending', phase: 'subtree', cursor: '', startedAt: started,
        // An absent Auth account cannot authorize email-based cleanup.
        identityEmail, verifiedEmail: authUser?.emailVerified === true ? identityEmail : '',
        ...(Number.isFinite(authCreatedAt) ? { authCreatedAt } : {}),
      };
      Object.assign(next, { status: 'running', leaseOwner: owner, leaseExpiresAt: clock() + LEASE_MS, updatedAt: clock() });
      tx.set(markerRef, next);
      return next;
    });
    if (!job) return { ...PENDING };
    if (job.status === 'complete') return await confirmCompletedDeletion();
    acquired = true;

    if (job.phase === 'subtree') {
      await deleteSubtree(userRef);
      await checkpoint({ phase: 'exams', cursor: '' });
    }
    if (job.phase === 'exams') {
      await drainQuery(db.collection('examAttempts').where('uid', '==', uid), data => data.uid === uid);
      await checkpoint({ phase: 'certificatesByUid', cursor: '' });
    }
    if (job.phase === 'certificatesByUid') {
      await drainCertificates(false);
      await checkpoint({ phase: 'certificatesByEmail', cursor: '' });
    }
    if (job.phase === 'certificatesByEmail') {
      await drainCertificates(true);
      await checkpoint({ phase: 'signupChallenges', cursor: '' });
    }
    if (job.phase === 'signupChallenges') {
      await drainQuery(db.collection('emailSignupChallenges').where('uid', '==', uid), data => data.uid === uid);
      await checkpoint({ phase: 'dispatch', cursor: '' });
    }
    if (job.phase === 'dispatch') {
      await deletePage([db.collection('emailDispatchLocks').doc(uid)]);
      await checkpoint({ phase: 'auth', cursor: '' });
    }
    if (job.phase !== 'auth') throw new AccountDeletionError('Account deletion needs review before it can continue.', 409, 'INVALID_DELETION_STATE');

    // Auth stays usable for authorized retries until all data phases finish.
    await checkpoint({ phase: 'auth' });
    const finalAuthUser = await lookupAuthUser();
    if (finalAuthUser && (finalAuthUser.uid !== uid || !Number.isFinite(job.authCreatedAt)
      || timestamp(finalAuthUser.metadata?.creationTime) !== job.authCreatedAt)) {
      throw new AccountDeletionError('The account identity changed. Review it before retrying deletion.', 409, 'ACCOUNT_IDENTITY_MISMATCH');
    }
    try { await auth.deleteUser(uid); }
    catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    await ownedTransaction(async tx => {
      // Retain only a minimal tombstone. Old ID tokens must never recreate data.
      tx.set(markerRef, { status: 'complete', startedAt: job.startedAt, completedAt: clock() });
    }, { budget: false });
    return { ...COMPLETE };
  } catch (error) {
    if (acquired) await release();
    if (error instanceof DeletionYield) return { ...PENDING };
    if (error instanceof AccountDeletionError) throw error;
    const failure = new AccountDeletionError('Account deletion could not finish. Please retry to continue safely.', 503, 'ACCOUNT_DELETION_RETRY_REQUIRED', true);
    failure.cause = error;
    throw failure;
  }
}
