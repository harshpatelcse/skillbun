import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Run the actual handler with isolated service stubs; these tests never access Firebase.
const routeSource = (await readFile(new URL('../../app/api/admin/emails/reset/route.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export /gm, '');

function setup({ records = [], admin = true, invalidToken = false, authConfigured = true, limited = false, deletedBeforeWrite = false } = {}) {
  const writes = [];
  const batches = [];
  const invalidations = [];
  let databaseCalls = 0;
  let collectionReads = 0;
  const refs = new Map(records.map(record => [record.uid, {
    id: record.uid,
    get: async () => ({ exists: true, data: () => record }),
    update: async data => {
      if (deletedBeforeWrite) throw new Error('Document no longer exists');
      writes.push({ uid: record.uid, data: JSON.parse(JSON.stringify(data)) });
    },
  }]));
  const snapshots = records.map(record => ({ ref: refs.get(record.uid) }));
  const db = {
    collection: name => {
      assert.equal(name, 'users');
      return {
        doc: uid => refs.get(uid) || { get: async () => ({ exists: false }) },
        get: async () => {
          collectionReads++;
          return { empty: !snapshots.length, docs: snapshots };
        },
        where: (field, operator, email) => {
          assert.equal(field, 'email');
          assert.equal(operator, '==');
          return { limit: limit => ({ get: async () => {
            const docs = records.filter(record => record.email === email).slice(0, limit).map(record => ({ ref: refs.get(record.uid) }));
            return { empty: !docs.length, docs };
          } }) };
        },
      };
    },
    batch: () => {
      const pending = [];
      return {
        update: (ref, data) => pending.push({ uid: ref.id, data: JSON.parse(JSON.stringify(data)) }),
        commit: async () => { if (deletedBeforeWrite) throw new Error('Document no longer exists'); batches.push(pending.length); writes.push(...pending); },
      };
    },
  };
  const handler = vm.runInNewContext(`${routeSource}\nPOST;`, {
    NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, body }) },
    getFirebaseAdminAuth: () => authConfigured ? { verifyIdToken: async () => {
      if (invalidToken) throw new Error('Invalid token');
      return { uid: 'admin-user' };
    } } : null,
    isUserAuthorizedAdmin: async () => admin,
    checkServerRateLimit: async ({ subject }) => {
      assert.equal(subject, 'admin-user');
      return { allowed: !limited, retryAfterMs: 12000 };
    },
    invalidateCacheTag: async tag => { invalidations.push(tag); },
    getFirebaseAdminFirestore: () => { databaseCalls++; return db; },
    console,
  });
  return {
    writes, batches, invalidations,
    get databaseCalls() { return databaseCalls; },
    get collectionReads() { return collectionReads; },
    post: (body, { authorization = 'Bearer admin-token', malformed = false } = {}) => handler({
      headers: new Headers(authorization ? { authorization } : {}),
      json: async () => {
        if (malformed) throw new SyntaxError('Malformed JSON');
        return body;
      },
    }),
  };
}

test('authentication and admin denial cannot read or reset student counters', async () => {
  for (const [options, authorization, status] of [
    [{}, '', 401], [{}, 'Basic user', 401], [{ invalidToken: true }, 'Bearer invalid', 401],
    [{ admin: false }, 'Bearer student', 403], [{ authConfigured: false }, 'Bearer admin', 500],
  ]) {
    const app = setup(options);
    assert.equal((await app.post({ resetAll: true }, { authorization })).status, status);
    assert.equal(app.databaseCalls, 0);
    assert.deepEqual(app.writes, []);
  }
});

test('malformed, missing, invalid, and mixed reset targets never access Firestore', async () => {
  const invalidBodies = [
    undefined, null, [], 'reset', {}, { resetAll: 'true' }, { resetAll: 0 }, { resetAll: false },
    { resetAll: false, targetUid: '' }, { resetAll: false, targetUid: '  ' },
    { resetAll: false, targetUid: 'users/other' }, { resetAll: false, targetUid: {} },
    { resetAll: false, targetUid: '..' }, { resetAll: false, targetUid: 'x'.repeat(129) },
    { resetAll: false, targetEmail: '' }, { resetAll: false, targetEmail: 'invalid' },
    { resetAll: false, targetEmail: null }, { resetAll: false, targetEmail: [] },
    { resetAll: false, targetUid: 'chosen', targetEmail: '' },
    { resetAll: true, targetUid: 'chosen' }, { resetAll: true, targetEmail: null },
  ];
  for (const body of invalidBodies) {
    const app = setup();
    assert.equal((await app.post(body)).status, 400, JSON.stringify(body));
    assert.equal(app.databaseCalls, 0);
    assert.deepEqual(app.writes, []);
  }
  const app = setup();
  assert.equal((await app.post(undefined, { malformed: true })).status, 400);
  assert.equal(app.databaseCalls, 0);
  assert.deepEqual(app.writes, []);
});

test('valid UID, email, and matching combined targets reset only the selected student', async () => {
  for (const target of [
    { targetUid: 'chosen' }, { targetEmail: ' Chosen@Example.com ' },
    { targetUid: 'chosen', targetEmail: 'chosen@example.com' },
  ]) {
    const app = setup({ records: [{ uid: 'chosen', email: 'chosen@example.com' }, { uid: 'other', email: 'other@example.com' }] });
    const response = await app.post({ resetAll: false, ...target });
    assert.equal(response.status, 200);
    assert.equal(response.body.resetCount, 1);
    assert.deepEqual(app.writes, [{ uid: 'chosen', data: { sentEmailHistory: [] } }]);
    assert.equal(app.collectionReads, 0);
    assert.deepEqual(app.batches, []);
    assert.deepEqual(app.invalidations, ['admin:analytics']);
  }
});

test('missing, mismatched, and ambiguous student records never reset another student', async () => {
  const records = [
    { uid: 'chosen', email: 'chosen@example.com' },
    { uid: 'other', email: 'duplicate@example.com' },
    { uid: 'third', email: 'duplicate@example.com' },
  ];
  for (const [target, status] of [
    [{ targetUid: 'missing' }, 404], [{ targetEmail: 'missing@example.com' }, 404],
    [{ targetUid: 'missing', targetEmail: 'chosen@example.com' }, 404],
    [{ targetUid: 'chosen', targetEmail: 'duplicate@example.com' }, 400],
    [{ targetEmail: 'duplicate@example.com' }, 400],
  ]) {
    const app = setup({ records });
    assert.equal((await app.post({ resetAll: false, ...target })).status, status);
    assert.deepEqual(app.writes, []);
    assert.equal(app.collectionReads, 0);
  }
});

test('explicit bulk reset merges only counters in bounded committed batches', async () => {
  const records = Array.from({ length: 805 }, (_, i) => ({ uid: `student-${i}`, email: `student-${i}@example.com` }));
  const app = setup({ records });
  const response = await app.post({ resetAll: true });
  assert.equal(response.status, 200);
  assert.equal(response.body.resetCount, 805);
  assert.deepEqual(app.batches, [400, 400, 5]);
  assert.equal(app.collectionReads, 1);
  assert.deepEqual(app.writes.map(write => write.uid), records.map(record => record.uid));
  for (const { data } of app.writes) {
    assert.deepEqual(data, { sentEmailHistory: [] });
  }
});

test('a counter reset cannot recreate a student erased after the initial read', async () => {
  for (const body of [{ resetAll: true }, { resetAll: false, targetUid: 'chosen' }]) {
    const app = setup({ records: [{ uid: 'chosen', email: 'chosen@example.com' }], deletedBeforeWrite: true });
    const response = await app.post(body);
    assert.equal(response.status, 500);
    assert.equal(response.body.success, undefined);
    assert.deepEqual(app.writes, []);
  }
});

test('an empty bulk reset returns zero without committing a write', async () => {
  const app = setup();
  const response = await app.post({ resetAll: true });
  assert.equal(response.status, 200);
  assert.equal(response.body.resetCount, 0);
  assert.deepEqual(app.writes, []);
  assert.deepEqual(app.batches, []);
});

test('rate-limited single and bulk resets never access student data', async () => {
  for (const body of [{ resetAll: true }, { resetAll: false, targetUid: 'chosen' }]) {
    const app = setup({ limited: true });
    assert.equal((await app.post(body)).status, 429);
    assert.equal(app.databaseCalls, 0);
    assert.deepEqual(app.writes, []);
    assert.deepEqual(app.invalidations, []);
  }
});
