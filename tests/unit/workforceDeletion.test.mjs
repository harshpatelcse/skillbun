import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../../app/api/admin/workforce/employees/[id]/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replace(/^export /gm, '');

function setup(count, { employeeData = {}, certificates = [], workforceDocs = [] } = {}) {
  const deleted = [];
  const invalidations = [];
  let commits = 0;
  const employeeRef = { id: 'employee-1', get: async () => ({ exists: true, data: () => employeeData }), update: async () => {} };
  const asDocument = ({ id, data }) => ({ id, ref: { id }, data: () => data });
  const milestoneDocs = Array.from({ length: count }, (_, index) => asDocument({ id: `milestone-${index}`, data: { employee_id: employeeRef.id } }));
  const collections = {
    milestones: milestoneDocs,
    certificates: certificates.map(asDocument),
    workforce_docs: workforceDocs.map(asDocument),
  };
  const db = {
    collection: name => ({
      doc: () => employeeRef,
      where: (field, operator, value) => ({ get: async () => {
        assert.equal(operator, '==');
        const docs = (collections[name] || []).filter(document => document.data()[field] === value);
        return { docs, size: docs.length };
      } }),
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

test('email matches cannot delete certificates or legal records explicitly owned by another employee', async () => {
  const email = 'employee@example.com';
  const app = setup(0, {
    employeeData: { personal_email: email },
    certificates: [
      { id: 'owned-cert', data: { employee_id: 'employee-1', email, cert_type: 'INTERNSHIP' } },
      { id: 'other-cert', data: { employee_id: 'employee-2', email, cert_type: 'INTERNSHIP' } },
      { id: 'legacy-workforce-cert', data: { email, cert_type: 'TRAINING' } },
      { id: 'malformed-owner-cert', data: { employee_id: false, email, cert_type: 'LOR' } },
    ],
    workforceDocs: [
      { id: 'owned-letter', data: { employee_id: 'employee-1', dispatched_to: email } },
      { id: 'other-letter', data: { employee_id: 'employee-2', dispatched_to: email } },
      { id: 'legacy-letter', data: { dispatched_to: email } },
      { id: 'malformed-owner-letter', data: { employee_id: 0, dispatched_to: email } },
    ],
  });
  const response = await app.run();
  assert.equal(response.status, 200);
  assert.deepEqual(app.deleted.sort(), ['employee-1', 'legacy-letter', 'legacy-workforce-cert', 'owned-cert', 'owned-letter'].sort());
  assert.equal(response.body.cascadeCount.certificates, 2);
  assert.equal(response.body.cascadeCount.workforceDocs, 2);
  assert.equal(app.commits, 1);
});

test('email-only academic, untyped and unidentified credentials survive workforce deletion', async () => {
  const email = 'employee@example.com';
  const app = setup(0, {
    employeeData: { personal_email: email },
    certificates: [
      { id: 'academic', data: { email, cert_type: 'ROADMAP', roadmapSlug: 'frontend' } },
      { id: 'legacy-academic', data: { email, uid: 'student-1', roadmapSlug: 'frontend' } },
      { id: 'empty-type', data: { email, cert_type: '' } },
      { id: 'unknown-type', data: { email, cert_type: 'UNKNOWN' } },
      { id: 'untyped', data: { email } },
      { id: 'explicitly-owned', data: { email, employee_id: 'employee-1' } },
      { id: 'known-legacy-workforce', data: { email, cert_type: ' internship ' } },
    ],
  });
  assert.equal((await app.run()).status, 200);
  assert.deepEqual(app.deleted.sort(), ['employee-1', 'explicitly-owned', 'known-legacy-workforce'].sort());
});

test('preserved email matches do not consume the atomic cascade write budget', async () => {
  const email = 'employee@example.com';
  const app = setup(499, {
    employeeData: { personal_email: email },
    certificates: Array.from({ length: 20 }, (_, index) => ({ id: `other-${index}`, data: { employee_id: 'employee-2', email, cert_type: 'LOR' } })),
  });
  assert.equal((await app.run()).status, 200);
  assert.equal(app.deleted.length, 500);
  assert.equal(app.commits, 1);
});

test('the workforce delete UI displays recovery guidance without removing the employee after failure', async () => {
  const page = await readFile(new URL('../../app/dashboard/console/admin/workforce/page.jsx', import.meta.url), 'utf8');
  const start = page.indexOf('  const handleDeleteEmployee = async () => {');
  const end = page.indexOf('\n  const handleCourseSelectChange', start);
  assert.ok(start !== -1 && end > start);
  const handlerSource = `${page.slice(start, end)}; handleDeleteEmployee;`;
  const guidance = 'This employee has too many linked records for one atomic deletion. No records were deleted; archive the employee and arrange a maintenance deletion.';
  for (const [error, expected] of [
    [{ code: 'CASCADE_TOO_LARGE', message: guidance }, guidance],
    ['Please try again later.', 'Please try again later.'],
    [{ code: 'UNKNOWN' }, 'Failed to delete employee record.'],
    [{ message: { unexpected: true } }, 'Failed to delete employee record.'],
  ]) {
    const errors = [];
    const submitting = [];
    const untouched = () => assert.fail('Failed deletion must not close the modal, remove the employee, or show success');
    const handler = vm.runInNewContext(handlerSource, {
      employeeToDelete: { id: 'employee-1', full_name: 'Test Employee' },
      user: { getIdToken: async () => 'test-token' },
      fetch: async () => ({ ok: false, json: async () => ({ error }) }),
      setSubmitting: value => submitting.push(value),
      setError: value => errors.push(value),
      setEmployees: untouched,
      setModal: untouched,
      setEmployeeToDelete: untouched,
      showToast: untouched,
    });
    await handler();
    assert.equal(errors.at(-1), expected);
    assert.deepEqual(submitting, [true, false]);
  }
});
