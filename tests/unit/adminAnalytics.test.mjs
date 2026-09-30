import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';

const source = (await readFile(new URL('../../app/api/admin/analytics/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');

function setup({ limited = false } = {}) {
  const pages = [];
  let cacheCalls = 0;
  const profile = { displayName: 'Legacy name', current_year: '3', interest_area: 'Security', providers: ['password'], sentEmailHistory: [{ category: 'welcome', sentAt: 12 }] };
  const empty = { docs: [] };
  const db = {
    collection(name) {
      if (name === 'unsubscribes') return { get: async () => empty };
      if (name === 'certificates') return { orderBy: () => ({ get: async () => ({ docs: [{ id: 'cert-1', data: () => ({ uid: 'second-page-user', name: 'Second student', createdAt: new Date(0) }) }] }) }) };
      if (name === 'examAttempts') return { select: () => ({ get: async () => empty }) };
      assert.equal(name, 'users');
      return {
        select: (...fields) => ({ get: async () => ({ docs: [{
          id: 'first-page-user',
          data: () => Object.fromEntries(Object.entries(profile).filter(([key]) => fields.includes(key))),
        }] }) }),
        doc: () => ({ collection: () => ({ get: async () => empty }) }),
      };
    },
  };
  const api = vm.runInNewContext(`${source}; ({ GET, computeAdminAnalytics });`, {
    path, process, fs: { existsSync: () => false }, console,
    getFirebaseAdminAuth: () => ({
      verifyIdToken: async () => ({ uid: 'admin' }),
      listUsers: async (size, token) => {
        assert.equal(size, 1000);
        pages.push(token);
        return token ? { users: [{ uid: 'second-page-user', email: 'second@example.com' }] }
          : { users: [{ uid: 'first-page-user', email: 'first@example.com' }], pageToken: 'page-2' };
      },
    }),
    getFirebaseAdminFirestore: () => db,
    enrichEmailProgress: async value => value,
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
});

test('analytics rate-limit denial stops before cache reads or collection scans', async () => {
  const app = setup({ limited: true });
  const response = await app.GET({ headers: new Headers({ authorization: 'Bearer token' }) });
  assert.equal(response.status, 429);
  assert.equal(app.cacheCalls, 0);
  assert.deepEqual(app.pages, []);
});
