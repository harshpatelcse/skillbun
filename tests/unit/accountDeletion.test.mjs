import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountDeletionError, deleteStudentAccount } from '../../utils/server/accountDeletion.mjs';

const UID = 'student-1';
const EMAIL = 'student@example.com';
const START = 2_000_000_000_000;
const authRecord = () => ({ uid: UID, email: EMAIL, emailVerified: true, metadata: { creationTime: '2020-01-01T00:00:00.000Z' } });

function createHarness(seed = {}, record = authRecord()) {
  const records = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
  let time = START;
  let transactionTail = Promise.resolve();
  const stats = { mutations: 0, transactionSizes: [], queryLimits: [], authDeletes: 0, emailLookups: 0 };
  const harness = { records, stats, failDeleteAuth: false, failComplete: false, failDataDelete: false, beforeTransactionRead: null, beforeAuthDelete: null };
  const tick = () => { time += harness.tickMs || 0; };
  const snapshot = ref => ({ ref, id: ref.id, exists: records.has(ref.path), data: () => structuredClone(records.get(ref.path)) });
  function document(path) {
    const ref = {
      path, id: path.split('/').at(-1),
      async get() { tick(); return snapshot(ref); },
      collection: name => collection(`${path}/${name}`),
      async listCollections() {
        tick();
        const prefix = `${path}/`;
        const names = new Set([...records.keys()].filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length).split('/')[0]));
        return [...names].sort().map(name => collection(`${path}/${name}`));
      },
    };
    return ref;
  }
  function collection(path, filters = [], limit = Infinity, after = '') {
    return {
      path,
      doc: id => document(`${path}/${id}`),
      where: (key, operator, value) => {
        assert.equal(operator, '==');
        return collection(path, [...filters, [key, value]], limit, after);
      },
      orderBy: field => { assert.equal(field, '__name__'); return collection(path, filters, limit, after); },
      startAfter: value => collection(path, filters, limit, value),
      limit: value => collection(path, filters, value, after),
      async get() {
        tick();
        stats.queryLimits.push(limit);
        const prefix = `${path}/`;
        const docs = [...records.entries()]
          .filter(([key, value]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/')
            && key.slice(prefix.length) > after && filters.every(([field, expected]) => value[field] === expected))
          .sort(([left], [right]) => left.localeCompare(right))
          .slice(0, limit).map(([key]) => snapshot(document(key)));
        return { docs, size: docs.length, empty: !docs.length };
      },
    };
  }
  harness.db = {
    collection,
    runTransaction(callback) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise(resolve => { release = resolve; });
      return (async () => {
        await previous;
        tick();
        const writes = [];
        const tx = {
          async get(ref) {
            tick();
            assert.equal(writes.length, 0, 'transaction reads must precede writes');
            if (harness.beforeTransactionRead) await harness.beforeTransactionRead(ref);
            return snapshot(ref);
          },
          set(ref, data, options) { writes.push({ ref, data: structuredClone(data), merge: options?.merge }); },
          delete(ref) { writes.push({ ref, delete: true }); },
        };
        try {
          const result = await callback(tx);
          if (harness.failDataDelete && writes.some(write => write.delete)) throw new Error('synthetic data deletion failure');
          if (harness.failComplete && writes.some(write => write.data?.status === 'complete')) throw new Error('synthetic completion failure');
          stats.transactionSizes.push(writes.length);
          for (const write of writes) {
            stats.mutations++;
            if (write.delete) records.delete(write.ref.path);
            else records.set(write.ref.path, write.merge ? { ...records.get(write.ref.path), ...write.data } : write.data);
          }
          return result;
        } finally { release(); }
      })();
    },
  };
  harness.authRecord = record;
  harness.auth = {
    async getUser(uid) {
      tick();
      assert.equal(uid, UID);
      if (!harness.authRecord) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
      return structuredClone(harness.authRecord);
    },
    async getUserByEmail() { stats.emailLookups++; throw new Error('Email lookup is forbidden'); },
    async deleteUser(uid) {
      tick();
      assert.equal(uid, UID);
      stats.authDeletes++;
      if (harness.beforeAuthDelete) await harness.beforeAuthDelete();
      if (harness.failDeleteAuth) throw new Error('synthetic Auth failure');
      if (!harness.authRecord) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
      harness.authRecord = null;
    },
  };
  harness.now = () => time;
  harness.advance = amount => { time += amount; };
  harness.run = options => deleteStudentAccount({ db: harness.db, auth: harness.auth, uid: UID, now: harness.now, ...options });
  return harness;
}

test('deletion removes owned student data but preserves workforce/legal, suppression, and abuse records', async () => {
  const old = START - 1000;
  const app = createHarness({
    [`users/${UID}`]: { email: EMAIL },
    [`users/${UID}/roadmapProgress/javascript`]: { completedNodeIds: ['one'] },
    [`users/${UID}/quizAttempts/javascript`]: { attempts: [old] },
    [`users/${UID}/future/one`]: {},
    [`users/${UID}/future/one/details/two`]: { detail: true },
    'users/other': { email: 'other@example.com' },
    'examAttempts/owned': { uid: UID },
    'examAttempts/other': { uid: 'other' },
    'certificates/owned': { uid: UID, email: EMAIL, cert_type: 'ROADMAP', createdAt: old },
    'certificates/legacy': { email: EMAIL, cert_type: 'ROADMAP', createdAt: old },
    'certificates/other': { uid: 'other', email: EMAIL, cert_type: 'ROADMAP', createdAt: old },
    'certificates/workforce': { uid: UID, email: EMAIL, cert_type: 'INTERNSHIP', createdAt: old },
    'certificates/employee': { uid: UID, email: EMAIL, cert_type: 'ROADMAP', employee_id: 'employee-1', createdAt: old },
    'certificates/future': { email: EMAIL, cert_type: 'ROADMAP', createdAt: START + 1000 },
    'certificates/undated': { email: EMAIL, cert_type: 'ROADMAP' },
    'certificates/previous-owner': { email: EMAIL, cert_type: 'ROADMAP', createdAt: Date.parse('2019-01-01') },
    'certificates/malformed-owner': { uid: false, email: EMAIL, cert_type: 'ROADMAP', createdAt: old },
    'certificates/malformed-employee': { uid: UID, employee_id: 0, cert_type: 'ROADMAP' },
    'certificates/malformed-date': { email: EMAIL, cert_type: 'ROADMAP', createdAt: true },
    'certificates/unknown': { uid: UID, email: EMAIL, createdAt: old },
    [`emailDispatchLocks/${UID}`]: { uid: UID },
    'emailSignupChallenges/owned': { uid: UID },
    'emailSignupChallenges/other': { uid: 'other' },
    [`unsubscribes/${EMAIL}`]: { email: EMAIL },
    'serverRateLimits/key': { count: 1 },
    'employees/one': { user_uid: UID },
    'workforce_docs/one': { employee_id: 'one' },
    'admins/admin@example.com': { role: 'admin' },
  });
  app.beforeAuthDelete = () => {
    assert.equal([...app.records.keys()].some(key => key === `users/${UID}` || key.startsWith(`users/${UID}/`)), false);
    assert.equal(app.records.has('examAttempts/owned'), false);
    assert.equal(app.records.has('certificates/owned'), false);
    assert.equal(app.records.has('certificates/legacy'), false);
  };
  const result = await app.run({ expectedEmail: ' Student@Example.com ' });
  assert.deepEqual(result, { success: true, status: 'complete', firestoreDeleted: true, authDeleted: true });
  for (const path of ['certificates/other', 'certificates/workforce', 'certificates/employee', 'certificates/future', 'certificates/undated', 'certificates/unknown',
    'certificates/previous-owner', 'certificates/malformed-owner', 'certificates/malformed-employee', 'certificates/malformed-date',
    'examAttempts/other', 'emailSignupChallenges/other', 'users/other', `unsubscribes/${EMAIL}`, 'serverRateLimits/key', 'employees/one', 'workforce_docs/one', 'admins/admin@example.com']) {
    assert.equal(app.records.has(path), true, `${path} must survive`);
  }
  assert.equal(app.records.has(`emailDispatchLocks/${UID}`), false);
  assert.equal(app.records.has('emailSignupChallenges/owned'), false);
  assert.deepEqual(app.records.get(`accountDeletions/${UID}`), { status: 'complete', startedAt: START, completedAt: START });
  assert.equal(app.stats.emailLookups, 0);
});

test('mismatched email rejects before any mutation or Auth deletion', async () => {
  const app = createHarness({ [`users/${UID}`]: { email: EMAIL } });
  await assert.rejects(app.run({ expectedEmail: 'different@example.com' }), error => error instanceof AccountDeletionError && error.code === 'ACCOUNT_IDENTITY_MISMATCH');
  assert.equal(app.stats.mutations, 0);
  assert.equal(app.stats.authDeletes, 0);
});

test('missing or unverified Auth never authorizes email-only credential deletion', async () => {
  for (const user of [null, { ...authRecord(), emailVerified: false }]) {
    const app = createHarness({
      [`users/${UID}/quizAttempts/orphan`]: {},
      'certificates/uid': { uid: UID, cert_type: 'ROADMAP' },
      'certificates/email': { email: EMAIL, cert_type: 'ROADMAP', createdAt: START - 1000 },
    }, user);
    assert.equal((await app.run({ expectedEmail: EMAIL })).status, 'complete');
    assert.equal(app.records.has('certificates/uid'), false);
    assert.equal(app.records.has(`users/${UID}/quizAttempts/orphan`), false);
    assert.equal(app.records.has('certificates/email'), true);
    assert.equal(app.stats.emailLookups, 0);
  }
});

test('large collections are paged and retained credentials do not starve later owned certificates', async () => {
  const seed = {};
  for (let index = 0; index < 235; index++) {
    const id = String(index).padStart(4, '0');
    seed[`users/${UID}/roadmapProgress/${id}`] = {};
    seed[`examAttempts/${id}`] = { uid: UID };
    seed[`certificates/${id}`] = { uid: UID, cert_type: index < 110 ? 'TRAINING' : 'ROADMAP' };
  }
  const app = createHarness(seed);
  assert.equal((await app.run()).status, 'complete');
  assert.equal([...app.records.keys()].filter(path => path.startsWith('certificates/')).length, 110);
  assert.equal(app.stats.queryLimits.every(limit => limit === 100), true);
  assert.equal(Math.max(...app.stats.transactionSizes), 101);
});

test('a data deletion failure leaves Auth available and retry resumes safely', async () => {
  const app = createHarness({ [`users/${UID}`]: {}, [`users/${UID}/quizAttempts/js`]: {} });
  app.failDataDelete = true;
  await assert.rejects(app.run(), error => error.retryable && error.status === 503);
  assert.equal(app.stats.authDeletes, 0);
  assert.equal(app.records.get(`accountDeletions/${UID}`).status, 'pending');
  app.failDataDelete = false;
  assert.equal((await app.run()).status, 'complete');
});

test('Auth deletion failure preserves resumable identity and does not report success', async () => {
  const app = createHarness({ [`users/${UID}`]: {} });
  app.failDeleteAuth = true;
  await assert.rejects(app.run(), error => error.retryable && error.code === 'ACCOUNT_DELETION_RETRY_REQUIRED');
  const marker = app.records.get(`accountDeletions/${UID}`);
  assert.equal(marker.phase, 'auth');
  assert.equal(marker.identityEmail, EMAIL);
  assert.equal(marker.status, 'pending');
  app.failDeleteAuth = false;
  assert.equal((await app.run({ expectedEmail: EMAIL })).status, 'complete');
});

test('failure after Auth deletion is recoverable and completed deletion is idempotent', async () => {
  const app = createHarness({ [`users/${UID}`]: {} });
  app.failComplete = true;
  await assert.rejects(app.run(), error => error.retryable);
  assert.equal(app.authRecord, null);
  app.failComplete = false;
  assert.equal((await app.run({ expectedEmail: EMAIL })).status, 'complete');
  const deletes = app.stats.authDeletes;
  assert.equal((await app.run()).status, 'complete');
  assert.equal(app.stats.authDeletes, deletes);
});

test('concurrent callers share one durable deletion lease', async () => {
  const app = createHarness({ [`users/${UID}`]: {} });
  const results = await Promise.all([app.run(), app.run()]);
  assert.deepEqual(results.map(result => result.status).sort(), ['complete', 'pending']);
  assert.equal(app.stats.authDeletes, 1);
});

test('an expired worker lease can be reclaimed, but an active lease only returns pending', async () => {
  const app = createHarness({
    [`users/${UID}`]: {},
    [`accountDeletions/${UID}`]: { status: 'running', phase: 'subtree', startedAt: START - 1000, leaseOwner: 'old', leaseExpiresAt: START + 1000, identityEmail: EMAIL, verifiedEmail: EMAIL, authCreatedAt: Date.parse('2020-01-01') },
  });
  assert.deepEqual(await app.run(), { success: false, status: 'pending', retryAfterMs: 1000 });
  assert.equal(app.stats.mutations, 0);
  app.advance(1001);
  assert.equal((await app.run()).status, 'complete');
});

test('budget exhaustion saves progress and repeated requests eventually complete', async () => {
  const seed = {};
  for (let index = 0; index < 225; index++) seed[`certificates/${String(index).padStart(4, '0')}`] = { uid: UID, cert_type: index < 210 ? 'TRAINING' : 'ROADMAP' };
  const app = createHarness(seed);
  app.tickMs = 1;
  let result;
  let requests = 0;
  do {
    result = await app.run({ budgetMs: 120 });
    requests++;
    assert.ok(requests < 15, 'stored cursors must prevent restarting the same retained page');
  } while (result.status === 'pending');
  assert.equal(result.status, 'complete');
  assert.ok(requests > 1);
  assert.equal([...app.records.keys()].filter(path => path.startsWith('certificates/')).length, 210);
});

test('a challenge reassigned between query and delete is preserved', async () => {
  const app = createHarness({ 'emailSignupChallenges/reused': { uid: UID } });
  app.beforeTransactionRead = ref => {
    if (ref.path === 'emailSignupChallenges/reused') app.records.set(ref.path, { uid: 'new-account' });
  };
  assert.equal((await app.run()).status, 'complete');
  assert.deepEqual(app.records.get('emailSignupChallenges/reused'), { uid: 'new-account' });
});

test('reusing a deleted UID for a newly created Auth identity requires review', async () => {
  const app = createHarness({
    [`users/${UID}`]: {},
    [`accountDeletions/${UID}`]: { status: 'pending', phase: 'auth', startedAt: START - 1000, identityEmail: EMAIL, authCreatedAt: Date.parse('2019-01-01') },
  });
  await assert.rejects(app.run(), error => error.code === 'ACCOUNT_IDENTITY_MISMATCH');
  assert.equal(app.stats.mutations, 0);
  assert.equal(app.stats.authDeletes, 0);
});

test('a completed tombstone never falsely confirms deletion of a newly reused Auth UID', async () => {
  const app = createHarness({ [`users/${UID}`]: {} });
  assert.equal((await app.run()).status, 'complete');
  const mutations = app.stats.mutations;
  const deletes = app.stats.authDeletes;
  app.authRecord = { ...authRecord(), email: 'new-owner@example.com' };
  await assert.rejects(app.run(), error => error.code === 'ACCOUNT_IDENTITY_MISMATCH');
  assert.equal(app.stats.mutations, mutations);
  assert.equal(app.stats.authDeletes, deletes);
});

test('known legacy academic certificates are removed while ambiguous and workforce records survive', async () => {
  const app = createHarness({
    'certificates/legacy-slug': { uid: UID, roadmapSlug: 'javascript' },
    'certificates/legacy-attempt': { uid: UID, attemptId: 'att_123456789' },
    'certificates/legacy-email': { email: EMAIL, roadmapSlug: 'javascript', createdAt: START - 1000 },
    'certificates/unknown': { uid: UID, name: 'Student' },
    'certificates/workforce': { uid: UID, roadmapSlug: 'internship', designation: 'Intern' },
    'certificates/employee': { uid: UID, roadmapSlug: 'javascript', employee_id: 'employee-1' },
    'certificates/explicit-type': { uid: UID, roadmapSlug: 'javascript', cert_type: 'TRAINING' },
  });
  assert.equal((await app.run()).status, 'complete');
  for (const id of ['legacy-slug', 'legacy-attempt', 'legacy-email']) assert.equal(app.records.has(`certificates/${id}`), false);
  for (const id of ['unknown', 'workforce', 'employee', 'explicit-type']) assert.equal(app.records.has(`certificates/${id}`), true);
});

test('the Auth identity is checked again before deletion after data cleanup', async () => {
  const app = createHarness({ [`users/${UID}`]: {} });
  let authReads = 0;
  const originalGetUser = app.auth.getUser;
  app.auth.getUser = async uid => {
    authReads++;
    if (authReads === 2) app.authRecord = { ...authRecord(), metadata: { creationTime: '2026-01-01' } };
    return originalGetUser(uid);
  };
  await assert.rejects(app.run(), error => error.code === 'ACCOUNT_IDENTITY_MISMATCH');
  assert.equal(app.stats.authDeletes, 0);
  assert.equal(app.records.get(`accountDeletions/${UID}`).status, 'pending');
});

test('unknown Auth creation time fails before changing account data', async () => {
  const app = createHarness({ [`users/${UID}`]: {} }, { ...authRecord(), metadata: {} });
  await assert.rejects(app.run(), error => error.code === 'ACCOUNT_IDENTITY_MISMATCH');
  assert.equal(app.stats.mutations, 0);
  assert.equal(app.stats.authDeletes, 0);
});
