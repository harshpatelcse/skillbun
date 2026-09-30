import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../../app/api/admin/workforce/employees/[id]/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replace(/^export /gm, '');

function setup(count) {
  const deleted = [];
  const invalidations = [];
  let commits = 0;
  const employeeRef = { id: 'employee-1', get: async () => ({ exists: true, data: () => ({}) }), update: async () => {} };
  const milestoneDocs = Array.from({ length: count }, (_, index) => ({ ref: { id: `milestone-${index}` } }));
  const db = {
    collection: name => ({
      doc: () => employeeRef,
      where: () => ({ get: async () => ({ docs: name === 'milestones' ? milestoneDocs : [], size: name === 'milestones' ? count : 0 }) }),
    }),
    batch: () => ({ delete: ref => deleted.push(ref.id), commit: async () => { commits++; } }),
  };
  const handler = vm.runInNewContext(`${source}; DELETE;`, {
    URL, console,
    getFirebaseAdminFirestore: () => db,
    requireWorkforceAdmin: async () => ({ uid: 'admin' }),
    enforceEmployeeRateLimit: async () => null,
    validateEmployeeId: value => ({ isValid: true, value }),
    invalidateCacheTag: async tag => invalidations.push(tag),
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    apiError: (message, status, code) => ({ status, body: { error: { message, code } } }),
  });
  return { deleted, invalidations, get commits() { return commits; }, run: (query = '') => handler({ url: `https://skillbun.test/api/admin/workforce/employees/employee-1${query}` }, { params: Promise.resolve({ id: 'employee-1' }) }) };
}

test('an oversized workforce cascade refuses before any delete is enqueued or committed', async () => {
  const app = setup(500);
  const response = await app.run();
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'CASCADE_TOO_LARGE');
  assert.deepEqual(app.deleted, []);
  assert.equal(app.commits, 0);
});

test('the maximum supported workforce cascade commits all records in exactly one batch', async () => {
  const app = setup(499);
  assert.equal((await app.run()).status, 200);
  assert.equal(app.deleted.length, 500);
  assert.equal(app.deleted.at(-1), 'employee-1');
  assert.equal(app.commits, 1);
});

test('archiving invalidates workforce and analytics caches without deleting linked records', async () => {
  const app = setup(600);
  assert.equal((await app.run('?hard=false')).status, 200);
  assert.deepEqual(app.deleted, []);
  assert.equal(app.commits, 0);
  assert.deepEqual(app.invalidations, ['admin:workforce', 'admin:analytics']);
});
