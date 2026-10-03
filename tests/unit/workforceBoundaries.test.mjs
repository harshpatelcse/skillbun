import { isActiveWorkforceMember, assertWorkforceAction, transitionWorkforceEmployee, finishWorkforceAction, WorkforcePolicyError } from '../../utils/server/workforcePolicy.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateFirestoreId, validateSchema, validateString } from '../../utils/server/inputValidator.js';
import { CertificateMutationError, changeCertificateRevocation } from '../../utils/server/certificateIntegrity.mjs';
import { validateWorkforceAction, validateWorkforceCredentials } from '../../utils/server/workforceActionValidation.mjs';
import { paginateWorkforceDocuments, parseWorkforceDocumentCursor, validateWorkforceDocumentId, WorkforceDocumentQueryError } from '../../utils/server/workforceDocumentPagination.mjs';
import { fetchAllWorkforceDocuments } from '../../utils/client/workforceDocuments.mjs';

async function loadSource(relative) {
  return (await readFile(new URL(`../../${relative}`, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
}
const milestoneSource = await loadSource('utils/server/workforceMilestones.js');
const validateMilestonePayload = vm.runInNewContext(`${milestoneSource}; validateMilestonePayload;`, {
  URL, validateFirestoreId, validateSchema, validateString,
});
const create = { employee_id: 'employee-1', title: 'Build the learning portal', due_date: '2026-10-10' };

test('milestone creation retains valid values and defaults without accepting unexpected fields', () => {
  const result = validateMilestonePayload(create);
  assert.equal(result.isValid, true);
  assert.equal(result.value.priority, 'MEDIUM');
  assert.equal(result.value.status, 'TODO');
  assert.equal(result.value.due_date, create.due_date);
  for (const patch of [{ employee_id: '../other' }, { employee_id: 'users/other' }, { due_date: '2026-02-30' },
    { due_date: 12345 }, { due_date: '2026-10-10T00:00:00Z' }, { employee_email: 'forged@example.test' },
    { title: 'Unsafe\u0000title' }, { priority: 'OTHER' }]) {
    assert.equal(validateMilestonePayload({ ...create, ...patch }).isValid, false);
  }
  assert.equal(validateMilestonePayload(JSON.parse('{"__proto__": {}, "employee_id":"employee-1","title":"Valid title","due_date":"2026-10-10"}')).isValid, false);
});
test('intern milestone updates preserve clear actions while rejecting admin fields, empty updates and unsafe links', () => {
  const options = { partial: true, isIntern: true };
  for (const payload of [null, [], {}, { employee_id: 'other' }, { review_notes: 'approve' },
    { deliverable_url: 'javascript:alert(1)' }, { deliverable_url: {} }, { status: 'APPROVED' }]) {
    assert.equal(validateMilestonePayload(payload, options).isValid, false);
  }
  const cleared = validateMilestonePayload({ deliverable_url: null }, options);
  assert.equal(cleared.isValid, true);
  assert.equal(cleared.value.deliverable_url, '');
  const updated = validateMilestonePayload({ status: 'UNDER_REVIEW', deliverable_url: 'https://example.test/deliverable' }, options);
  assert.equal(updated.isValid, true);
  assert.equal(Object.keys(updated.value).length, 2);
  assert.equal(validateMilestonePayload({}, { partial: true }).isValid, false);
});

function fakeDb(seed = {}) {
  const rows = new Map(Object.entries(seed));
  let reads = 0;
  let writes = 0;
  let transactions = 0;
  return {
    rows,
    get reads() { return reads; }, get writes() { return writes; }, get transactions() { return transactions; },
    collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }),
    async runTransaction(callback) {
      transactions++;
      const pending = [];
      const result = await callback({
        async get(ref) { reads++; return { exists: rows.has(ref.path), data: () => rows.get(ref.path) }; },
        update(ref, patch) { pending.push(() => { writes++; rows.set(ref.path, { ...rows.get(ref.path), ...patch }); }); },
      });
      pending.forEach(write => write());
      return result;
    },
  };
}
const apiError = (message, status, code) => Response.json({ success: false, error: { message, code } }, { status });

test('workforce credential revocation strictly validates payload and normalizes corporate IDs', async () => {
  const source = await loadSource('app/api/admin/workforce/credentials/[id]/route.js');
  const key = 'certificates/SKB-2026-INT-REC-8K29DF';
  const db = fakeDb({ [key]: { name: 'Synthetic Intern', score: 100, template_version: 'v1', is_revoked: false } });
  const invalidations = [];
  const patch = vm.runInNewContext(`${source}; PATCH;`, {
    console, NextResponse: { json: Response.json }, apiError,
    requireWorkforceAdmin: async () => ({ email: 'harsh@skillbun.tech' }),
    getFirebaseAdminFirestore: () => db, CertificateMutationError, changeCertificateRevocation,
    invalidateCacheTag: async tag => invalidations.push(tag),
  });
  const call = (body, id = 'SKB/2026/INT-REC/8K29DF') => patch(new Request('https://skillbun.test/api/admin/workforce/credentials/test', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
  for (const payload of [null, [], {}, { is_revoked: 'false' }, { is_revoked: true, name: 'Replacement' }]) {
    assert.equal((await call(payload)).status, 400);
  }
  assert.equal((await call({ is_revoked: true }, '../other')).status, 400);
  assert.equal(db.reads, 0);
  assert.equal(db.writes, 0);
  assert.equal((await call({ is_revoked: true })).status, 200);
  assert.equal(db.rows.get(key).is_revoked, true);
  assert.equal(db.rows.get(key).name, 'Synthetic Intern');
  assert.equal(db.rows.get(key).template_version, 'v1');
  assert.equal(invalidations.length, 3);
  assert.equal((await call({ is_revoked: false }, 'missing')).status, 404);
});

test('milestone mutation verifies assignment within its write transaction and binds reassignment email', async () => {
  const source = await loadSource('app/api/admin/workforce/milestones/[id]/route.js');
  const key = 'milestones/milestone-1';
  const db = fakeDb({ [key]: { ...create, employee_email: 'assigned@example.test' }, 'employees/employee-1': { personal_email: 'assigned@example.test', status: 'ACTIVE' }, 'employees/employee-2': { personal_email: 'NEXT@example.test', status: 'ACTIVE' } });
  let caller = { uid: 'intern', email: 'former@example.test', isIntern: true, isAdmin: false };
  const patch = vm.runInNewContext(`${source}; PATCH;`, {
    console, NextResponse: { json: Response.json }, apiError,
    isActiveWorkforceMember, authenticateMilestoneCaller: async () => caller,
    getFirebaseAdminFirestore: () => db, enforceEmployeeRateLimit: async () => null,
    validateMilestoneId: id => ({ isValid: true, value: id.trim() }), validateMilestonePayload,
    serializeMilestone: (id, data) => ({ id, ...data }), invalidateCacheTag: async () => {},
  });
  const call = body => patch(new Request('https://skillbun.test/api/admin/workforce/milestones/milestone-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: ' milestone-1 ' }) });
  assert.equal((await call({ status: 'UNDER_REVIEW' })).status, 403);
  assert.equal(db.transactions, 1);
  assert.equal(db.writes, 0);
  caller = { ...caller, email: 'assigned@example.test' };
  assert.equal((await call({ status: 'UNDER_REVIEW' })).status, 200);
  caller = { uid: 'admin', email: 'harsh@skillbun.tech', isIntern: false, isAdmin: true };
  assert.equal((await call({ employee_id: 'employee-2' })).status, 200);
  assert.equal(db.rows.get(key).employee_email, 'next@example.test');
  caller = { uid: 'intern', email: 'assigned@example.test', isIntern: true, isAdmin: false };
  assert.equal((await call({ status: 'COMPLETED' })).status, 403);
  assert.equal(db.rows.get(key).status, 'UNDER_REVIEW');
});

test('workforce action schemas match form bodies and reject truthy option strings before mutations', () => {
  const credentials = { work_email: 'synthetic-intern@example.org', password: '  Significant spaces  ', access_notes: 'Workspace access' };
  assert.equal(validateWorkforceCredentials(credentials).value.password, credentials.password);
  for (const action of ['offer', 'activate', 'extension', 'terminate']) {
    for (const payload of [null, [], { employeeId: '../other' }, { employeeId: 'employee-1', unknown: true }]) {
      assert.equal(validateWorkforceAction(payload, action).isValid, false);
    }
    assert.equal(validateWorkforceAction({ employeeId: ' employee-1 ' }, action).value.employeeId, 'employee-1');
  }
  assert.equal(validateWorkforceAction({ employeeId: 'employee-1', credentials_data: null, skipEmail: true }, 'activate').isValid, true);
  assert.equal(validateWorkforceAction({ employeeId: 'employee-1', credentials_data: credentials }, 'offer').isValid, true);
  for (const patch of [{ skipEmail: 'false' }, { skipEmail: null }, { credentials_data: { work_email: 'invalid', password: '123' } },
    { credentials_data: { ...credentials, password: {} } }, { credentials_data: { ...credentials, isAdmin: true } }]) {
    assert.equal(validateWorkforceAction({ employeeId: 'employee-1', ...patch }, 'activate').isValid, false);
  }
  for (const field of ['grantInternshipCert', 'grantTrainingCert', 'grantLor', 'revokeAccess', 'sendEmail']) {
    for (const value of ['false', 1, null]) assert.equal(validateWorkforceAction({ employeeId: 'employee-1', [field]: value }, 'terminate').isValid, false);
  }
  assert.equal(validateWorkforceAction({ employeeId: 'employee-1', reasonCode: 'CUSTOM', reason: 'Synthetic reason', sendEmail: false }, 'terminate').isValid, true);
});

async function activationHarness({ encryptionFailure = false } = {}) {
  const source = await loadSource('app/api/admin/workforce/activate/route.js');
  const mutations = [];
  const logs = [];
  let sends = 0;
  const employee = { full_name: 'Synthetic Intern', personal_email: 'synthetic-intern@example.org', status: 'OFFER_SENT' };
  const db = {
    async runTransaction(fn) {
      const result = await fn({
        get: async () => ({ exists: true, data: () => employee }),
        update: (ref, data) => { Object.assign(employee, data); mutations.push(data); },
      });
      return result;
    },
    collection: name => ({
    doc: id => ({ id, get: async () => ({ exists: true, data: () => employee }), update: async data => mutations.push(data) }),
    add: async data => { assert.equal(name, 'workforce_docs'); logs.push(data); },
  }) };
  const post = vm.runInNewContext(`${source}; POST;`, {
    assertWorkforceAction, transitionWorkforceEmployee, finishWorkforceAction, WorkforcePolicyError, console: { warn() {}, error() {} }, NextResponse: { json: Response.json }, apiError,
    requireWorkforceAdmin: async () => ({ uid: 'admin', email: 'harsh@skillbun.tech' }),
    enforceEmployeeRateLimit: async () => null, validateEmployeeId: value => ({ isValid: true, value }), validateWorkforceAction,
    getFirebaseAdminFirestore: () => db,
    encryptCredentials: () => { if (encryptionFailure) throw new Error('Synthetic key missing'); return 'encrypted'; },
    buildActivationWelcomeEmail: () => ({ subject: 'Welcome', from: 'SkillBun <noreply@skillbun.tech>', replyTo: 'harsh@skillbun.tech' }),
    sendMailWithAttachment: async () => { sends++; }, invalidateCacheTag: async () => {},
  });
  const call = body => post(new Request('https://skillbun.test/api/admin/workforce/activate', { method: 'POST', body: JSON.stringify(body) }));
  return { call, mutations, logs, get sends() { return sends; } };
}
test('activation rejects malformed bodies and persists a sortable dispatch record for successful welcome actions', async () => {
  const app = await activationHarness();
  for (const body of [null, { employeeId: 'employee-1', skipEmail: 'false' }]) assert.equal((await app.call(body)).status, 400);
  assert.equal(app.mutations.length, 0);
  assert.equal(app.sends, 0);
  assert.equal((await app.call({ employeeId: 'employee-1', skipEmail: true })).status, 200);
  assert.equal(app.sends, 0);
  assert.equal((await app.call({ employeeId: 'employee-1' })).status, 409);
  assert.equal(app.sends, 0);
  const welcome = await activationHarness();
  assert.equal((await welcome.call({ employeeId: 'employee-1' })).status, 200);
  assert.equal(welcome.sends, 1);
  assert.equal(welcome.logs.length, 1);
  assert.equal(welcome.logs[0].status, 'DISPATCHED');
  assert.equal(welcome.logs[0].issued_at.getTime(), welcome.logs[0].dispatched_at.getTime());
});
test('activation stops before sending or changing status when credentials cannot be encrypted', async () => {
  const app = await activationHarness({ encryptionFailure: true });
  const response = await app.call({ employeeId: 'employee-1', credentials_data: { work_email: 'synthetic-intern@example.org', password: 'Synthetic password' } });
  assert.equal(response.status, 503);
  assert.equal(app.mutations.length, 0);
  assert.equal(app.sends, 0);
  assert.equal(app.logs.length, 0);
});

test('document pagination keeps same-time siblings and legacy timestamp cursors usable', () => {
  const documents = [
    { id: 'c', issued_at: '2026-10-01T00:00:00.000Z' },
    { id: 'a', issued_at: '2026-10-01T00:00:00.000Z' },
    { id: 'older', issued_at: '2026-09-30T00:00:00.000Z' },
    { id: 'b', issued_at: '2026-10-01T00:00:00.000Z' },
    { id: 'undated', issued_at: null },
  ];
  const ids = [];
  let cursor = null;
  do {
    const page = paginateWorkforceDocuments(documents, { limit: 2, cursor });
    ids.push(...page.documents.map(doc => doc.id));
    cursor = parseWorkforceDocumentCursor(page.nextPageToken);
  } while (cursor);
  assert.deepEqual(ids, ['a', 'b', 'c', 'older', 'undated']);
  const legacy = paginateWorkforceDocuments(documents, { cursor: parseWorkforceDocumentCursor('2026-10-01T00:00:00.000Z') });
  assert.deepEqual(legacy.documents.map(doc => doc.id), ['older', 'undated']);
  for (const token of ['', 'not-a-date', '2026-02-30T00:00:00.000Z', 'v1:invalid', 'v1:' + Buffer.from(JSON.stringify(['', '../other'])).toString('base64url')]) {
    assert.throws(() => parseWorkforceDocumentCursor(token), WorkforceDocumentQueryError);
  }
});
test('document registry includes historical activation logs without exposing stored PDFs', async () => {
  const source = await loadSource('app/api/admin/workforce/documents/route.js');
  const rows = [
    { id: 'offer', doc_type: 'OFFER_PACK', issued_at: { toDate: () => new Date('2026-10-01T00:00:00Z') }, pdf_base64: 'private-pdf' },
    { id: 'activation', doc_type: 'ACTIVATION_WELCOME', dispatched_at: { toDate: () => new Date('2026-09-30T00:00:00Z') } },
  ];
  let reads = 0;
  const query = filter => ({
    where: (field, op, value) => { assert.equal(field, 'doc_type'); return query(value); },
    get: async () => { reads++; return { docs: rows.filter(row => !filter || row.doc_type === filter).map(row => ({ id: row.id, data: () => row })) }; },
  });
  const get = vm.runInNewContext(`${source}; GET;`, {
    URL, console, apiError,
    requireWorkforceAdmin: async () => ({ uid: 'admin' }), getFirebaseAdminFirestore: () => ({ collection: () => query() }),
    getOrSetCache: async (key, ttl, fetcher) => fetcher(), createCachedJsonResponse: (request, body) => Response.json(body),
    formatWorkforceDisplayId: id => id, paginateWorkforceDocuments, parseWorkforceDocumentCursor, WorkforceDocumentQueryError,
  });
  const call = suffix => get(new Request(`https://skillbun.test/api/admin/workforce/documents${suffix}`));
  for (const suffix of ['?limit=50junk', '?limit=1.5', '?limit=', '?pageToken=invalid']) assert.equal((await call(suffix)).status, 400);
  assert.equal(reads, 0);
  const all = await (await call('')).json();
  assert.deepEqual(all.documents.map(doc => doc.id), ['offer', 'activation']);
  assert.equal(all.documents[1].issued_at, '2026-09-30T00:00:00.000Z');
  assert.equal(all.documents[0].has_pdf, true);
  assert.equal(Object.hasOwn(all.documents[0], 'pdf_base64'), false);
  const filtered = await (await call('?doc_type=ACTIVATION_WELCOME')).json();
  assert.deepEqual(filtered.documents.map(doc => doc.id), ['activation']);
});
test('the admin document client follows every opaque cursor and rejects repeated pages', async () => {
  const urls = [];
  const docs = await fetchAllWorkforceDocuments('synthetic-token', { fetcher: async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    const second = new URL(url, 'https://skillbun.test').searchParams.get('pageToken');
    return Response.json({ success: true, documents: [{ id: second ? 'second' : 'first' }], has_more: !second, nextPageToken: second ? null : 'v1:opaque-token' });
  } });
  assert.deepEqual(docs.map(doc => doc.id), ['first', 'second']);
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1], 'https://skillbun.test').searchParams.get('pageToken'), 'v1:opaque-token');
  let calls = 0;
  await assert.rejects(fetchAllWorkforceDocuments('token', { fetcher: async () => {
    calls++;
    return Response.json({ success: true, documents: [], has_more: true, nextPageToken: 'repeated' });
  } }), /invalid page cursor/);
  assert.equal(calls, 2);
});
test('document type selection immediately filters the loaded registry alongside status and search', async () => {
  const page = await readFile(new URL('../../app/dashboard/console/admin/documents/page.jsx', import.meta.url), 'utf8');
  const start = page.indexOf('  const filteredDocuments = useMemo(');
  const end = page.indexOf('\n  // Metrics', start);
  assert.ok(start > 0 && end > start);
  const source = `${page.slice(start, end)}; filteredDocuments;`;
  const documents = [{ id: 'offer', doc_type: 'OFFER_PACK', title: 'Offer', is_revoked: false },
    { id: 'activation', doc_type: 'ACTIVATION_WELCOME', title: 'Welcome', is_revoked: false }];
  const run = typeFilter => vm.runInNewContext(source, { useMemo: callback => callback(), documents, typeFilter, searchTerm: '', statusFilter: 'ACTIVE' });
  assert.deepEqual([...run('ACTIVATION_WELCOME')].map(doc => doc.id), ['activation']);
  assert.deepEqual([...run('ALL')].map(doc => doc.id), ['offer', 'activation']);
});

test('document revocation accepts only a safe ID and boolean, preserving the issued snapshot', async () => {
  const source = await loadSource('app/api/admin/workforce/documents/route.js');
  const key = 'SKB-2026-HR-OFF-8K29DF';
  const issued = { full_name: 'Synthetic Intern', template_version: 'v1', pdf_base64: 'immutable-pdf' };
  let reads = 0;
  let stored = { metadata_snapshot: issued, is_revoked: false };
  const patch = vm.runInNewContext(`${source}; PATCH;`, {
    console, apiError, NextResponse: { json: Response.json }, validateSchema, validateWorkforceDocumentId,
    requireWorkforceAdmin: async () => ({ uid: 'admin', email: 'harsh@skillbun.tech' }), invalidateCacheTag: async () => {},
    getFirebaseAdminFirestore: () => ({ collection: () => ({ doc: id => ({
      get: async () => { reads++; return { exists: id === key }; },
      update: async data => { stored = { ...stored, ...data }; },
    }) }) }),
  });
  const call = body => patch(new Request('https://skillbun.test/api/admin/workforce/documents', { method: 'PATCH', body: JSON.stringify(body) }));
  for (const body of [null, [], {}, { docId: ' ', is_revoked: true }, { docId: 'nested/path/record', is_revoked: true },
    { docId: key, is_revoked: 'false' }, { docId: key, is_revoked: true, metadata_snapshot: {} }]) {
    assert.equal((await call(body)).status, 400);
  }
  assert.equal(reads, 0);
  assert.equal((await call({ docId: 'SKB/2026/HR-OFF/8K29DF', is_revoked: true })).status, 200);
  assert.equal(stored.is_revoked, true);
  assert.equal(stored.metadata_snapshot, issued);
  assert.equal((await call({ docId: key, is_revoked: false })).status, 200);
  assert.equal(stored.is_revoked, false);
});
