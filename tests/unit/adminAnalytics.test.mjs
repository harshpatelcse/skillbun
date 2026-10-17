import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';

const source = (await readFile(new URL('../../app/api/admin/analytics/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');

function setup({ limited = false, missingAuth = false, missingFirestore = false, emptyDatabase = false, failedReads = [], extraProfile = false, failEnrichment = false } = {}) {
  const pages = [];
  let cacheCalls = 0;
  const profile = { displayName: 'Legacy name', current_year: '3', interest_area: 'Security', providers: ['password'], sentEmailHistory: [{ category: 'welcome', sentAt: 12 }] };
  const empty = { docs: [] };
  const read = async (name, snapshot, id = '') => {
    if (failedReads.includes(name) || failedReads.includes(`${name}:${id}`)) {
      throw new Error('Synthetic private backend failure detail');
    }
    return emptyDatabase ? empty : snapshot;
  };
  const db = {
    collection(name) {
      if (name === 'unsubscribes') return { get: () => read(name, empty) };
      if (name === 'certificates') return { orderBy: () => ({ get: () => read(name, { docs: [{ id: 'cert-1', data: () => ({ uid: 'second-page-user', name: 'Second student', createdAt: new Date(0) }) }] }) }) };
      if (name === 'examAttempts') return { select: () => ({ get: () => read(name, empty) }) };
      assert.equal(name, 'users');
      return {
        select: (...fields) => ({ get: () => read(name, { docs: (extraProfile ? ['first-page-user', 'second-page-user'] : ['first-page-user']).map(id => ({
          id,
          data: () => Object.fromEntries(Object.entries(profile).filter(([key]) => fields.includes(key))),
        })) }) }),
        doc: id => ({ collection: collectionName => ({ get: () => read(collectionName, empty, id) }) }),
      };
    },
  };
  const api = vm.runInNewContext(`${source}; ({ GET, computeAdminAnalytics });`, {
    path, process, fs: { existsSync: () => false }, console,
    getFirebaseAdminAuth: () => missingAuth ? null : ({
      verifyIdToken: async () => ({ uid: 'admin' }),
      listUsers: async (size, token) => {
        assert.equal(size, 1000);
        pages.push(token);
        if (failedReads.includes('auth') || failedReads.includes(`auth:${token || 'first'}`)) {
          throw new Error('Synthetic private backend failure detail');
        }
        if (emptyDatabase) return { users: [] };
        return token ? { users: [{ uid: 'second-page-user', email: 'second@example.com' }] }
          : { users: [{ uid: 'first-page-user', email: 'first@example.com' }], pageToken: 'page-2' };
      },
    }),
    getFirebaseAdminFirestore: () => missingFirestore ? null : db,
    enrichEmailProgress: async value => {
      if (failEnrichment) throw new Error('Synthetic private enrichment failure detail');
      return value;
    },
    emailTime: value => value,
    isUserAuthorizedAdmin: async () => true,
    checkServerRateLimit: async ({ subject }) => { assert.equal(subject, 'admin'); return { allowed: !limited, retryAfterMs: 2000 }; },
    getOrSetCache: async (_key, _ttl, load) => { cacheCalls++; return load(); },
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    createCachedJsonResponse: (_request, body) => ({ body, status: 200 }),
  });
  return { ...api, pages, get cacheCalls() { return cacheCalls; } };
}

test('analytics includes every Auth page and preserves projected profile and email-history fields', async () => {
  const app = setup();
  const analytics = await app.computeAdminAnalytics();
  assert.deepEqual(app.pages, [undefined, 'page-2']);
  assert.equal(analytics.stats.totalStudents, 2);
  assert.equal(analytics.stats.totalCertificates, 1);
  assert.equal(analytics.stats.orphanedCertificates, 0);
  const student = analytics.users.find(user => user.uid === 'first-page-user');
  assert.equal(student.name, 'Legacy name');
  assert.equal(student.year, '3');
  assert.equal(student.interest, 'Security');
  assert.deepEqual(student.providers, ['password']);
  assert.deepEqual(student.sentEmailHistory, [{ category: 'welcome', sentAt: 12 }]);
  assert.deepEqual({ ...analytics.dataAvailability }, { auth: true, users: true, certificates: true, progress: true, examOutcomes: true, subscriptions: true });
});

test('analytics rate-limit denial stops before cache reads or collection scans', async () => {
  const app = setup({ limited: true });
  const response = await app.GET({ headers: new Headers({ authorization: 'Bearer token' }) });
  assert.equal(response.status, 429);
  assert.equal(app.cacheCalls, 0);
  assert.deepEqual(app.pages, []);
});

test('analytics distinguishes successful empty scans from unavailable data', async () => {
  const analytics = await setup({ emptyDatabase: true }).computeAdminAnalytics();
  assert.equal(analytics.stats.totalStudents, 0);
  assert.equal(analytics.stats.totalCertificates, 0);
  assert.deepEqual({ ...analytics.dataAvailability }, { auth: true, users: true, certificates: true, progress: true, examOutcomes: true, subscriptions: true });
});

test('analytics marks missing Firebase services unavailable without changing its response contract', async t => {
  for (const [options, expected] of [
    [{ missingAuth: true }, { auth: false, users: true, certificates: true, progress: true, examOutcomes: true, subscriptions: true }],
    [{ missingFirestore: true }, { auth: true, users: false, certificates: false, progress: false, examOutcomes: false, subscriptions: false }],
    [{ missingAuth: true, missingFirestore: true }, { auth: false, users: false, certificates: false, progress: false, examOutcomes: false, subscriptions: false }],
  ]) {
    await t.test(JSON.stringify(options), async () => {
      const analytics = await setup(options).computeAdminAnalytics();
      assert.equal(analytics.success, true);
      assert.ok(Number.isFinite(Date.parse(analytics.timestamp)));
      assert.ok(Array.isArray(analytics.users));
      assert.ok(Array.isArray(analytics.certificates));
      assert.deepEqual({ ...analytics.dataAvailability }, expected);
    });
  }
});

test('an incomplete Auth pagination scan never reports full availability', async () => {
  const app = setup({ failedReads: ['auth:page-2'] });
  const analytics = await app.computeAdminAnalytics();
  assert.deepEqual(app.pages, [undefined, 'page-2']);
  assert.equal(analytics.stats.totalStudents, 1);
  assert.deepEqual({ ...analytics.dataAvailability }, { auth: false, users: true, certificates: true, progress: true, examOutcomes: true, subscriptions: true });
  assert.ok(!JSON.stringify(analytics).includes('private backend failure'));
});

test('analytics marks failed and unreached collection scans unavailable', async t => {
  for (const [collection, expected] of [
    ['certificates', { auth: true, users: false, certificates: false, progress: false, examOutcomes: false, subscriptions: true }],
    ['users', { auth: true, users: false, certificates: false, progress: false, examOutcomes: false, subscriptions: true }],
    ['examAttempts', { auth: true, users: true, certificates: true, progress: true, examOutcomes: false, subscriptions: true }],
  ]) {
    await t.test(collection, async () => {
      const analytics = await setup({ failedReads: [collection] }).computeAdminAnalytics();
      assert.deepEqual({ ...analytics.dataAvailability }, expected);
      assert.ok(!JSON.stringify(analytics).includes('private backend failure'));
    });
  }
});

test('one failed progress or attempt subcollection keeps partial profile data but marks progress unavailable', async t => {
  for (const collection of ['roadmapProgress', 'quizAttempts']) {
    await t.test(collection, async () => {
      const analytics = await setup({ extraProfile: true, failedReads: [`${collection}:first-page-user`] }).computeAdminAnalytics();
      assert.equal(analytics.stats.totalStudents, 2);
      assert.equal(analytics.users.find(user => user.uid === 'second-page-user').name, 'Legacy name');
      assert.deepEqual({ ...analytics.dataAvailability }, { auth: true, users: true, certificates: true, progress: false, examOutcomes: true, subscriptions: true });
    });
  }
});

test('failed roadmap enrichment keeps progress availability false without exposing failure details', async () => {
  const analytics = await setup({ failEnrichment: true }).computeAdminAnalytics();
  assert.equal(analytics.stats.totalStudents, 2);
  assert.deepEqual({ ...analytics.dataAvailability }, { auth: true, users: true, certificates: false, progress: false, examOutcomes: true, subscriptions: true });
  assert.ok(!JSON.stringify(analytics).includes('private enrichment failure'));
});

test('failed subscription scan is reported as unavailable', async () => {
  const analytics = await setup({ failedReads: ['unsubscribes'] }).computeAdminAnalytics();
  assert.equal(analytics.dataAvailability.subscriptions, false);
  assert.equal(analytics.dataAvailability.users, true);
});
