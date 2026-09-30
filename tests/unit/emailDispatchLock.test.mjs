import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { emailCategory } from '../../utils/shared/emailRecommendation.js';
import {
  EMAIL_DISPATCH_LOCK_MS,
  claimRecommendedEmailDispatch,
  finalizeRecommendedEmailDispatch,
  markEmailDispatchUnknown,
  releaseEmailDispatch,
  resolveEmailDispatch,
} from '../../utils/server/emailDispatchLock.js';

function createDb(seed = {}) {
  const records = new Map(Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]));
  let tail = Promise.resolve();
  const ref = (collection, id) => ({
    path: `${collection}/${id}`,
    collection,
    id,
    async get() {
      const value = records.get(`${collection}/${id}`);
      return { exists: value !== undefined, data: () => structuredClone(value) };
    },
  });
  const db = {
    collection: collection => ({ doc: id => ref(collection, id) }),
    read: (collection, id) => structuredClone(records.get(`${collection}/${id}`)),
    runTransaction(callback) {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      return (async () => {
        await previous;
        const writes = [];
        const transaction = {
          async get(documentRef) {
            const value = records.get(documentRef.path);
            return { exists: value !== undefined, data: () => structuredClone(value) };
          },
          set(documentRef, value, options = {}) { writes.push({ type: 'set', documentRef, value: structuredClone(value), merge: options.merge }); },
          delete(documentRef) { writes.push({ type: 'delete', documentRef }); },
        };
        try {
          const result = await callback(transaction);
          for (const write of writes) {
            if (write.type === 'delete') records.delete(write.documentRef.path);
            else if (write.merge && records.has(write.documentRef.path)) {
              records.set(write.documentRef.path, { ...records.get(write.documentRef.path), ...write.value });
            } else records.set(write.documentRef.path, write.value);
          }
          return result;
        } finally { release(); }
      })();
    },
  };
  return db;
}

function claimArgs(db, overrides = {}) {
  return {
    db,
    uid: 'student-1',
    email: 'student@example.com',
    templateId: 'reengagement_v1',
    category: 'reengagement',
    subject: 'Continue learning',
    now: 2_000_000_000_000,
    ...overrides,
  };
}

test('account erasure blocks new dispatch claims, including force-send requests', async () => {
  const db = createDb({ 'accountDeletions/student-1': { status: 'pending' } });
  for (const forceOverride of [false, true]) {
    await assert.rejects(claimRecommendedEmailDispatch(claimArgs(db, { forceOverride })), { code: 'auth/account-deleting' });
  }
  assert.equal(db.read('emailDispatchLocks', 'student-1'), undefined);
  assert.equal(db.read('users', 'student-1'), undefined);
});

test('in-flight dispatch completion and review cannot recreate an erased profile', async () => {
  const db = createDb({
    'accountDeletions/student-1': { status: 'complete' },
    'emailDispatchLocks/student-1': {
      status: 'UNKNOWN', owner: 'in-flight', uid: 'student-1', templateId: 'reengagement_v1',
      expiresAt: 0, createdAt: 2_000_000_000_000,
    },
  });
  await assert.rejects(finalizeRecommendedEmailDispatch({ db, uid: 'student-1', owner: 'in-flight' }), { code: 'auth/account-deleting' });
  await assert.rejects(resolveEmailDispatch({ db, uid: 'student-1', resolution: 'sent' }), { code: 'auth/account-deleting' });
  assert.equal(db.read('users', 'student-1'), undefined);
});

test('a student has one in-flight recommended dispatch across concurrent callers', async () => {
  const db = createDb({ 'users/student-1': { sentEmailHistory: [] } });
  const claims = await Promise.all([claimRecommendedEmailDispatch(claimArgs(db)), claimRecommendedEmailDispatch(claimArgs(db))]);
  assert.deepEqual(claims.map(claim => claim.kind).sort(), ['claimed', 'in_progress']);
  assert.equal(db.read('emailDispatchLocks', 'student-1').status, 'SENDING');
});

test('an expired sending lock becomes review-only and can be resolved as sent', async () => {
  const now = 2_000_000_000_000;
  const db = createDb({
    'users/student-1': { sentEmailHistory: [{ templateId: 'welcome_v1', isTest: true }] },
    'emailDispatchLocks/student-1': {
      status: 'SENDING', owner: 'old-owner', uid: 'student-1', templateId: 'reengagement_v1',
      category: 'reengagement', subject: 'Continue', createdAt: now - EMAIL_DISPATCH_LOCK_MS - 10,
      expiresAt: now - 1, adminEmail: 'admin@example.com',
    },
  });

  assert.equal((await claimRecommendedEmailDispatch(claimArgs(db, { now }))).kind, 'review');
  assert.equal(db.read('emailDispatchLocks', 'student-1').status, 'UNKNOWN');
  const resolved = await resolveEmailDispatch({ db, uid: 'student-1', resolution: 'sent', adminEmail: 'admin@example.com', now });
  assert.equal(resolved.kind, 'sent');
  assert.equal(resolved.log.manuallyConfirmed, true);
  assert.equal(db.read('emailDispatchLocks', 'student-1'), undefined);
  assert.equal(db.read('users', 'student-1').sentEmailHistory.length, 2);
  assert.equal(db.read('users', 'student-1').sentEmailHistory[0].isTest, true);
  assert.equal((await claimRecommendedEmailDispatch(claimArgs(db, { now: now + 1 }))).kind, 'already_sent');
});

test('active locks cannot be manually resolved and a confirmed non-send releases the lock', async () => {
  const db = createDb({ 'users/student-1': { sentEmailHistory: [] } });
  const claim = await claimRecommendedEmailDispatch(claimArgs(db));
  const pending = await resolveEmailDispatch({ db, uid: 'student-1', resolution: 'not_sent', now: 2_000_000_000_001 });
  assert.equal(pending.kind, 'in_progress');
  assert.equal(db.read('emailDispatchLocks', 'student-1').status, 'SENDING');

  await db.runTransaction(async tx => {
    tx.set(db.collection('emailDispatchLocks').doc('student-1'), { status: 'UNKNOWN', expiresAt: 0 }, { merge: true });
  });
  const resolved = await resolveEmailDispatch({ db, uid: 'student-1', resolution: 'not_sent' });
  assert.equal(resolved.kind, 'not_sent');
  assert.equal(db.read('emailDispatchLocks', 'student-1'), undefined);
  assert.equal(db.read('users', 'student-1').sentEmailHistory.length, 0);
  assert.equal(typeof claim.owner, 'string');
});

test('unsubscribe, duplicate variation, and 72-hour gap checks remain enforced unless explicitly overridden', async () => {
  const now = 2_000_000_000_000;
  const unsubscribed = createDb({
    'users/student-1': { sentEmailHistory: [] },
    'unsubscribes/student@example.com': { unsubscribedAt: now },
  });
  assert.equal((await claimRecommendedEmailDispatch(claimArgs(unsubscribed, { now }))).kind, 'unsubscribed');
  assert.equal((await claimRecommendedEmailDispatch(claimArgs(unsubscribed, { now, forceOverride: true }))).kind, 'claimed');
  assert.equal(unsubscribed.read('emailDispatchLocks', 'student-1').forceOverride, true);

  const duplicate = createDb({ 'users/student-1': { sentEmailHistory: [{ templateId: 'reengagement_v1', sentAt: now - 4 * 86400000 }] } });
  assert.equal((await claimRecommendedEmailDispatch(claimArgs(duplicate, { now }))).kind, 'already_sent');

  const gap = createDb({ 'users/student-1': { sentEmailHistory: [{ templateId: 'welcome_v1', sentAt: now - 12 * 60 * 60 * 1000 }] } });
  assert.equal((await claimRecommendedEmailDispatch(claimArgs(gap, { now }))).kind, 'gap');
  assert.equal((await claimRecommendedEmailDispatch(claimArgs(gap, { now, forceOverride: true }))).kind, 'claimed');

  const malformedHistory = createDb({ 'users/student-1': { sentEmailHistory: [null, 42, { templateId: 123, sentAt: 'not-a-date' }] } });
  assert.equal((await claimRecommendedEmailDispatch(claimArgs(malformedHistory, { now }))).kind, 'claimed');
});

test('successful finalization is idempotent and records a server-side dispatch log', async () => {
  const db = createDb({
    'users/student-1': { sentEmailHistory: [{ templateId: 'welcome_v1', isTest: true }] },
  });
  const claim = await claimRecommendedEmailDispatch(claimArgs(db, { now: 2_000_000_000_000, forceOverride: true }));
  const first = await finalizeRecommendedEmailDispatch({ db, uid: 'student-1', owner: claim.owner, messageId: 'smtp-id', now: 2_000_000_000_010 });
  assert.equal(first.messageId, 'smtp-id');
  assert.equal(first.forceOverride, true);
  assert.equal(db.read('users', 'student-1').sentEmailHistory.length, 2);
  assert.equal(db.read('users', 'student-1').sentEmailHistory[0].isTest, true);
  assert.equal(db.read('emailDispatchLocks', 'student-1'), undefined);
});

test('the admin resolve route returns retry timing for an active dispatch', async () => {
  let resolvedArgs;
  let resolutionResult = { kind: 'in_progress', retryAfterMs: 90_000 };
  let source = await fs.readFile(new URL('../../app/api/admin/emails/send/route.js', import.meta.url), 'utf8');
  source = source.replace(/import[\s\S]*?from\s*['"][^'"]+['"];\s*/g, '')
    .replace(/export const runtime = 'nodejs';/, '')
    .replace('export async function POST', 'async function POST');
  const post = new Function(
    'NextResponse', 'getFirebaseAdminAuth', 'getFirebaseAdminFirestore', 'isUserAuthorizedAdmin',
    'checkServerRateLimit', 'getClientAddress', 'resolveEmailDispatch', source + '; return POST;',
  )(
    { json: Response.json },
    () => ({ verifyIdToken: async () => ({ uid: 'admin', email: 'admin@example.com' }) }),
    () => ({}), async () => true, async () => ({ allowed: true }), () => '127.0.0.1',
    async args => { resolvedArgs = args; return resolutionResult; },
  );
  const request = () => new Request('http://localhost/api/admin/emails/send', {
    method: 'POST',
    headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
    body: JSON.stringify({ dispatchAction: 'resolve', uid: 'student-1', dispatchResolution: 'sent' }),
  });
  const pending = await post(request());
  assert.equal(pending.status, 409);
  assert.equal(pending.headers.get('Retry-After'), '90');
  assert.equal(resolvedArgs.uid, 'student-1');
  resolutionResult = { kind: 'sent', log: { templateId: 'reengagement_v1', manuallyConfirmed: true } };
  const confirmed = await post(request());
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).dispatch.manuallyConfirmed, true);
});

test('the send route holds an SMTP-timeout recipient for review instead of sending twice', async () => {
  const db = createDb({ 'users/student-1': { sentEmailHistory: [] } });
  let sendAttempts = 0;
  let sendMode = 'rejected';
  let source = await fs.readFile(new URL('../../app/api/admin/emails/send/route.js', import.meta.url), 'utf8');
  source = source.replace(/import[\s\S]*?from\s*['"][^'"]+['"];\s*/g, '')
    .replace(/export const runtime = 'nodejs';/, '')
    .replace('export async function POST', 'async function POST');
  const names = [
    'NextResponse', 'getFirebaseAdminAuth', 'getFirebaseAdminFirestore', 'isUserAuthorizedAdmin',
    'checkServerRateLimit', 'getClientAddress', 'loadEmailRoadmapContext', 'loadEmailStudent',
    'getSavedDraft', 'recommendEmail', 'renderSavedEmail', 'generateRetentionEmailHtml',
    'emailHtmlToText', 'isEmailDocument', 'buildBaseEmailWrapper', 'buildOfferDispatchEmail',
    'buildActivationWelcomeEmail', 'buildExtensionDispatchEmail', 'buildTerminationDispatchEmail',
    'getTransporter', 'getPasswordResetFrom', 'emailCategory', 'claimRecommendedEmailDispatch',
    'finalizeRecommendedEmailDispatch', 'markEmailDispatchUnknown', 'releaseEmailDispatch',
    'resolveEmailDispatch',
  ];
  const values = [
    { json: Response.json },
    () => ({ verifyIdToken: async () => ({ uid: 'admin', email: 'admin@example.com' }) }),
    () => db,
    async () => true,
    async () => ({ allowed: true }),
    () => '127.0.0.1',
    async () => ({ roadmapSlug: 'fullstack', progressCount: 0, totalTopics: 12 }),
    async () => ({ uid: 'student-1', name: 'Student', email: 'student@example.com', degree: 'CS', sentEmailHistory: [] }),
    async () => null,
    () => ({ eligible: true, category: 'reengagement', eventKey: 'inactive:student-1', roadmapSlug: 'fullstack', roadmapTitle: 'Full Stack', progressCount: 0, totalTopics: 12 }),
    () => null,
    () => ({ subject: 'Continue learning', html: '<p>Continue</p>', text: 'Continue' }),
    html => html.replace(/<[^>]*>/g, ''),
    () => false,
    () => ({}), () => ({}), () => ({}), () => ({}), () => ({}),
    () => ({ sendMail: async () => {
      sendAttempts += 1;
      if (sendMode === 'timeout') throw new Error('socket timeout');
      return { accepted: [], rejected: ['student@example.com'] };
    } }),
    () => 'SkillBun <noreply@skillbun.tech>',
    emailCategory,
    claimRecommendedEmailDispatch,
    finalizeRecommendedEmailDispatch,
    markEmailDispatchUnknown,
    releaseEmailDispatch,
    resolveEmailDispatch,
  ];
  const post = new Function(...names, source + '; return POST;')(...values);
  const request = body => new Request('http://localhost/api/admin/emails/send', {
    method: 'POST',
    headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const recommendedSend = {
    recommendationUid: 'student-1',
    recipientEmail: 'student@example.com',
    templateId: 'reengagement_v1',
    roadmapSlug: 'fullstack',
  };

  const rejected = await post(request(recommendedSend));
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).retryable, true);
  assert.equal(db.read('emailDispatchLocks', 'student-1'), undefined);
  assert.equal(db.read('users', 'student-1').sentEmailHistory.length, 0);

  sendMode = 'timeout';
  const first = await post(request(recommendedSend));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).dispatchReviewRequired, true);
  assert.equal(sendAttempts, 2);
  assert.equal(db.read('emailDispatchLocks', 'student-1').status, 'UNKNOWN');

  const second = await post(request(recommendedSend));
  assert.equal(second.status, 409);
  assert.equal((await second.json()).dispatchReviewRequired, true);
  assert.equal(sendAttempts, 2);

  const resolution = await post(request({ dispatchAction: 'resolve', uid: 'student-1', dispatchResolution: 'sent' }));
  assert.equal(resolution.status, 200);
  assert.equal(sendAttempts, 2);
  assert.equal(db.read('users', 'student-1').sentEmailHistory.length, 1);
  assert.equal(db.read('emailDispatchLocks', 'student-1'), undefined);
});
