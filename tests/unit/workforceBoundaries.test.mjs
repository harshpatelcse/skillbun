import { isActiveWorkforceMember, assertWorkforceAction, transitionWorkforceEmployee, finishWorkforceAction, WorkforcePolicyError } from '../../utils/server/workforcePolicy.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateFirestoreId, validateSchema, validateString, validatePlainObject } from '../../utils/server/inputValidator.js';
import { CertificateMutationError, changeCertificateRevocation } from '../../utils/server/certificateIntegrity.mjs';
import { validateWorkforceAction, validateWorkforceCredentials } from '../../utils/server/workforceActionValidation.mjs';
import { paginateWorkforceDocuments, parseWorkforceDocumentCursor, validateWorkforceDocumentId, WorkforceDocumentQueryError } from '../../utils/server/workforceDocumentPagination.mjs';
import { fetchAllWorkforceDocuments } from '../../utils/client/workforceDocuments.mjs';
import { formatWorkforceDisplayId, generateWorkforceId, isValidWorkforceId, normalizeWorkforceDbId, WORKFORCE_PREFIXES } from '../../utils/server/workforceId.js';
import { generateOfferLetterPdf } from '../../utils/server/pdf/offerLetterGenerator.js';
import { generateExtensionLetterPdf } from '../../utils/server/pdf/extensionLetterGenerator.js';
import { generateDocumentPdf } from '../../utils/server/pdf/documentPdfService.js';
import { DOCUMENT_CATEGORIES, getActiveTemplateVersion, UnsupportedTemplateVersionError } from '../../utils/common/docTemplateRegistry.js';

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

test('PDF studio rejects malformed and unbounded inputs before rendering, preserves samples and enforces quota', async () => {
  const source = await loadSource('app/api/admin/workforce/pdf/preview/route.js');
  const guardSource = await loadSource('utils/server/workforceEmployees.js');
  const rendered = [];
  let limited = false;
  let denied = false;
  let quotaChecks = 0;
  const generate = async (employee, options) => {
    rendered.push({ employee, options });
    return { referenceId: options.referenceId, filename: 'synthetic.pdf', buffer: Buffer.from('synthetic-pdf') };
  };
  const requireWorkforceAdmin = vm.runInNewContext(`${guardSource}; requireWorkforceAdmin;`, {
    URL, process: { env: { NODE_ENV: 'production' } }, NextResponse: { json: Response.json },
    validateFirestoreId, validateSchema, validateString, validateWorkforceCredentials,
    getFirebaseAdminAuth: () => ({ verifyIdToken: async () => {
      if (denied) throw new Error('Synthetic invalid session');
      return { uid: 'admin', admin: true, email: 'admin@example.test' };
    } }),
    checkServerRateLimit: async () => { quotaChecks++; return { allowed: !limited, retryAfterMs: 1000 }; },
    getClientAddress: () => '127.0.0.1',
  });
  const post = vm.runInNewContext(`${source}; POST;`, {
    console, Date, NextResponse: { json: Response.json }, apiError,
    validateSchema, validatePlainObject,
    requireWorkforceAdmin,
    generateOfferLetterPdf: generate, generateExtensionLetterPdf: generate,
  });
  const request = body => new Request('https://skillbun.test/api/admin/workforce/pdf/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-session' }, body: JSON.stringify(body),
  });
  for (const body of [null, [], 123, { employee: null }, { employee: [] }, { employee: 'invalid' },
    { docType: 'UNKNOWN' }, { employee: { full_name: 'a'.repeat(101) } }, { employee: { full_name: {} } },
    { employee: { stipend_amount: -1 } }, { employee: { template_version: 'v99' } },
    { referenceId: '../secret' }, { isAdmin: true }]) {
    assert.equal((await post(request(body))).status, 400, JSON.stringify(body));
  }
  assert.equal(rendered.length, 0);
  const checksBeforeValidPreview = quotaChecks;
  assert.equal((await post(request({}))).status, 200, 'empty preview retains sample defaults');
  assert.equal(quotaChecks, checksBeforeValidPreview + 1, 'each preview must consume shared quota exactly once');
  assert.equal(rendered[0].employee.full_name, 'Alex Sharma');
  assert.equal((await post(request({ docType: 'EXTENSION_LETTER', referenceId: 'SKB/2026/HR-EXT/8K29DF', newContractEndDate: '30 November 2026',
    employee: { full_name: 'Synthetic Intern', personal_email: 'intern@example.org', joining_date: '01 September 2026', stipend_amount: 0 } }))).status, 200);
  assert.equal(rendered[1].employee.joining_date, '01 September 2026');
  assert.equal(rendered[1].employee.stipend_amount, 0);
  assert.equal(rendered[1].options.newContractEndDate, '30 November 2026');
  limited = true;
  assert.equal((await post(request({}))).status, 429);
  denied = true;
  assert.equal((await post(request({}))).status, 401);
  assert.equal(rendered.length, 2);
});

async function extensionFixture(employeeOverrides = {}) {
  const source = await loadSource('app/api/admin/workforce/pdf/extension/route.js');
  const employee = { status: 'ACTIVE', full_name: 'Synthetic Intern', joining_date: '2026-07-01', contract_end_date: '2026-10-01', ...employeeOverrides };
  const issued = [];
  const doc = { id: 'intern', ref: { path: 'employees/intern' }, exists: true, data: () => employee };
  const db = { collection: name => ({ doc: id => {
    assert.doesNotMatch(id, /\//, 'Firestore IDs must not contain display separators');
    return name === 'employees' ? { get: async () => doc } : { path: `${name}/${id}` };
  } }) };
  const post = vm.runInNewContext(`${source}; POST;`, {
    console, Date, Response, URL, NextResponse: { json: Response.json }, apiError,
    getFirebaseAdminFirestore: () => db, requireWorkforceAdmin: async () => ({ uid: 'admin' }), enforceEmployeeRateLimit: async () => null,
    validateEmployeeId: validateFirestoreId, validateWorkforceAction, normalizeWorkforceDbId, generateWorkforceId, WORKFORCE_PREFIXES,
    assertWorkforceAction, WorkforcePolicyError, generateExtensionLetterPdf,
    getActiveTemplateVersion: () => 'v1', DOCUMENT_CATEGORIES: { EXTENSION_LETTER: 'EXTENSION_LETTER' },
    transitionWorkforceEmployee: async (_db, _ref, action) => issued.push(action), finishWorkforceAction: async () => {},
  });
  const call = body => post(new Request('https://skillbun.test/api/admin/workforce/pdf/extension?format=json', {
    method: 'POST', body: JSON.stringify(body),
  }));
  return { employee, issued, call };
}

test('extension PDF issuance stores the generated display reference as a safe document key', async () => {
  const { issued, call } = await extensionFixture();
  assert.equal((await call(null)).status, 400);
  const response = await call({ employeeId: 'intern', new_contract_end_date: '2026-11-30' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.referenceId, /^SKB\/\d{4}\/HR-EXT\/[A-Z0-9]{6}$/);
  const documentId = normalizeWorkforceDbId(result.referenceId);
  assert.equal(issued[0].document.ref.path, `workforce_docs/${documentId}`);
  assert.equal(issued[0].document.data.id, documentId);
  assert.equal(issued[0].document.data.display_id, result.referenceId);
  assert.equal(issued[0].patch.extension_reference_id, documentId);
  assert.equal(issued[0].document.data.template_version, 'v1');
});

test('new extensions use current employee data and a new reference despite a legacy employee-held offer snapshot', async () => {
  const legacy = { reference_id: 'SKB/2026/HR-OFF/8K29DF', full_name: 'Old Synthetic Name',
    joining_date: '2025-07-01', issued_at: '2025-06-15T00:00:00.000Z', designation: 'Old Role' };
  const { employee, issued, call } = await extensionFixture({ offer_reference_id: legacy.reference_id,
    issued_at: legacy.issued_at, metadata_snapshot: legacy, designation: 'Current Role' });
  const beforeIssuance = Date.now();
  const response = await call({ employeeId: 'intern', new_contract_end_date: '2026-11-30' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.referenceId, /^SKB\/\d{4}\/HR-EXT\/[A-Z0-9]{6}$/);
  assert.notEqual(result.referenceId, legacy.reference_id);
  assert.equal(result.metadataSnapshot.original_reference_id, legacy.reference_id);
  assert.equal(result.metadataSnapshot.full_name, employee.full_name);
  assert.equal(result.metadataSnapshot.designation, employee.designation);
  assert.equal(result.metadataSnapshot.joining_date, employee.joining_date);
  assert.equal(result.metadataSnapshot.extended_contract_end_date, '2026-11-30');
  assert.ok(Date.parse(result.metadataSnapshot.issued_at) >= beforeIssuance);
  assert.equal(result.metadataSnapshot.issued_at, issued[0].document.data.issued_at.toISOString());
  assert.equal(employee.metadata_snapshot, legacy, 'the original employee-held offer remains unchanged');
});

async function offerFixture(seed) {
  const source = await loadSource('app/api/admin/workforce/pdf/offer/route.js');
  const rows = new Map(Object.entries(seed));
  const revisions = new Map();
  const state = { unavailable: false, rendered: 0, writes: 0, transactionAttempts: 0, invalidations: [] };
  const db = {
    collection: name => ({ doc: id => {
      assert.doesNotMatch(id, /\//, 'historical display references must be normalized before lookup');
      return { path: `${name}/${id}`, id };
    } }),
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 5; attempt++) {
        state.transactionAttempts++;
        const reads = new Map();
        const writes = [];
        const result = await callback({
          async get(ref) {
            if (state.unavailable && ref.path.startsWith('workforce_docs/')) throw new Error('Synthetic storage outage');
            reads.set(ref.path, revisions.get(ref.path) || 0);
            const data = structuredClone(rows.get(ref.path));
            return { id: ref.id, exists: rows.has(ref.path), data: () => data };
          },
          create: (ref, data) => writes.push({ ref, data, create: true }),
          update: (ref, data) => writes.push({ ref, data }),
        });
        if ([...reads].some(([key, version]) => (revisions.get(key) || 0) !== version)) continue;
        for (const { ref, create } of writes) if (create && rows.has(ref.path)) throw new Error('Document already exists');
        for (const { ref, data, create } of writes) {
          rows.set(ref.path, structuredClone(create ? data : { ...rows.get(ref.path), ...data }));
          revisions.set(ref.path, (revisions.get(ref.path) || 0) + 1);
          state.writes++;
        }
        return result;
      }
      throw new Error('Synthetic transaction retry limit exceeded');
    },
  };
  const post = vm.runInNewContext(`${source}; POST;`, {
    console: { warn() {}, error() {} }, Date, Response, URL, NextResponse: { json: Response.json }, apiError,
    getFirebaseAdminFirestore: () => db, requireWorkforceAdmin: async () => ({ uid: 'admin' }), enforceEmployeeRateLimit: async () => null,
    validateEmployeeId: validateFirestoreId, validateSchema, validatePlainObject, formatWorkforceDisplayId, isValidWorkforceId, normalizeWorkforceDbId,
    DOCUMENT_CATEGORIES, getActiveTemplateVersion, UnsupportedTemplateVersionError,
    invalidateCacheTag: async tag => state.invalidations.push(tag),
    generateDocumentPdf: async (...args) => { state.rendered++; return generateDocumentPdf(...args); },
  });
  const call = body => post(new Request('https://skillbun.test/api/admin/workforce/pdf/offer?format=json', {
    method: 'POST', body: JSON.stringify(body),
  }));
  return { rows, state, call };
}

test('offer PDFs preserve legacy snapshots and fail closed when their historical record is missing or unsupported', async () => {
  const original = {
    full_name: 'Original Synthetic Intern', personal_email: 'original@example.test',
    joining_date: '2026-07-01', contract_end_date: '2026-10-01', issued_at: '2026-06-15T00:00:00.000Z',
  };
  const key = 'workforce_docs/SKB-2026-HR-OFF-8K29DF';
  const { rows, state, call } = await offerFixture({
    'employees/intern': { ...original, full_name: 'Changed Current Name', personal_email: 'changed@example.test',
      joining_date: '2026-08-01', contract_end_date: '2026-12-01', offer_reference_id: 'SKB/2026/HR-OFF/8K29DF',
      offer_dispatched_at: '2026-06-15T00:00:00.000Z' },
    [key]: { employee_id: 'intern', status: 'DISPATCHED', metadata_snapshot: original },
  });
  assert.equal((await call(null)).status, 400);
  const historical = await call({ employeeId: 'intern' });
  assert.equal(historical.status, 200);
  const { metadataSnapshot } = await historical.json();
  for (const field of Object.keys(original)) assert.equal(metadataSnapshot[field], original[field]);
  assert.equal(metadataSnapshot.template_version, 'v1', 'legacy missing versions retain their original v1 renderer');
  assert.equal(state.writes, 0);
  assert.equal(rows.get(key).status, 'DISPATCHED', 'downloading an already-sent offer preserves dispatch state');
  assert.equal(rows.get('employees/intern').offer_dispatched_at, '2026-06-15T00:00:00.000Z');
  state.unavailable = true;
  assert.equal((await call({ employeeId: 'intern' })).status, 503, 'a historical lookup outage must not recreate the offer from mutable data');
  state.unavailable = false;
  rows.delete(key);
  assert.equal((await call({ employeeId: 'intern' })).status, 503, 'missing records must not reconstruct historical offers');
  rows.set(key, { metadata_snapshot: {} });
  assert.equal((await call({ employeeId: 'intern' })).status, 503);
  rows.set(key, { employee_id: 'different-employee', metadata_snapshot: original });
  assert.equal((await call({ employeeId: 'intern' })).status, 503);
  assert.equal(state.rendered, 1);
  rows.set(key, { template_version: 'v99', metadata_snapshot: original });
  assert.equal((await call({ employeeId: 'intern' })).status, 422, 'an unsupported historical template must never silently render v1');
  assert.equal(state.writes, 0);
});

test('first offer PDF download atomically pins its reference, template and full snapshot before returning', async () => {
  const original = { full_name: 'Synthetic Intern', personal_email: 'intern@example.test', status: 'ACTIVE',
    joining_date: '2026-07-01', contract_end_date: '2026-10-01', stipend_amount: 0 };
  const { rows, state, call } = await offerFixture({ 'employees/intern': original });
  const fresh = await call({ employeeId: 'intern' });
  assert.equal(fresh.status, 200);
  const issued = await fresh.json();
  const documentId = normalizeWorkforceDbId(issued.referenceId);
  const stored = rows.get(`workforce_docs/${documentId}`);
  assert.equal(rows.get('employees/intern').offer_reference_id, documentId);
  assert.equal(rows.get('employees/intern').status, 'ACTIVE', 'download does not change workforce lifecycle status');
  assert.equal(stored.template_version, 'v1');
  assert.equal(stored.employee_id, 'intern');
  assert.equal(stored.status, 'ISSUED');
  assert.deepEqual(stored.metadata_snapshot, issued.metadataSnapshot);
  assert.equal(state.writes, 2);
  assert.deepEqual(state.invalidations, ['admin:workforce', 'admin:workforce_docs']);
  rows.set('employees/intern', { ...rows.get('employees/intern'), full_name: 'Changed Name',
    personal_email: 'changed@example.test', joining_date: '2026-09-01', contract_end_date: '2026-12-01', stipend_amount: 9000 });
  const repeated = await call({ employeeId: 'intern' });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json();
  assert.equal(repeatedBody.referenceId, issued.referenceId);
  assert.deepEqual(repeatedBody.metadataSnapshot, issued.metadataSnapshot);
  assert.equal(state.writes, 2, 'repeat downloads cannot mutate the original snapshot');
});

test('simultaneous first offer downloads converge on one immutable issued document', async () => {
  const { rows, state, call } = await offerFixture({ 'employees/intern': { full_name: 'Synthetic Intern', personal_email: 'intern@example.test' } });
  const responses = await Promise.all([call({ employeeId: 'intern' }), call({ employeeId: 'intern' })]);
  for (const response of responses) assert.equal(response.status, 200);
  const [first, second] = await Promise.all(responses.map(response => response.json()));
  assert.equal(first.referenceId, second.referenceId);
  assert.deepEqual(first.metadataSnapshot, second.metadataSnapshot);
  assert.equal([...rows.keys()].filter(key => key.startsWith('workforce_docs/')).length, 1);
  assert.equal(state.writes, 2);
  assert.ok(state.transactionAttempts >= 3, 'the losing request must retry against the committed offer');
});

test('offer downloads preserve mixed-case legacy IDs and explicitly linked employee-held snapshots', async () => {
  const reference = 'LegacyOfferAbc123XYZ';
  const original = { full_name: 'Legacy Intern', reference_id: reference, issued_at: '2026-06-15T00:00:00.000Z' };
  const { rows, state, call } = await offerFixture({
    'employees/intern': { full_name: 'Changed Name', offer_reference_id: reference, metadata_snapshot: original },
  });
  assert.equal((await call({ employeeId: 'intern' })).status, 200);
  assert.equal(state.writes, 0);
  rows.set('employees/intern', { full_name: 'Changed Name', offer_reference_id: reference });
  rows.set(`workforce_docs/${reference}`, { metadata_snapshot: original });
  const response = await call({ employeeId: 'intern' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).referenceId, reference);
});

test('legacy SB-OFF storage keys accept the canonical corporate reference emitted by their original generator', async () => {
  const reference = 'SB-OFF-2026-8K29DF';
  const original = { full_name: 'Legacy Intern', personal_email: 'original@example.test', issued_at: '2026-06-15T00:00:00.000Z' };
  const { metadataSnapshot } = await generateOfferLetterPdf(original, { referenceId: reference });
  assert.equal(metadataSnapshot.reference_id, 'SKB/2026/HR-OFF/8K29DF');
  const { rows, state, call } = await offerFixture({
    'employees/intern': { full_name: 'Changed Name', offer_reference_id: reference },
    [`workforce_docs/${reference}`]: { employee_id: 'intern', metadata_snapshot: metadataSnapshot },
  });
  const storedDocument = await call({ employeeId: 'intern' });
  assert.equal(storedDocument.status, 200);
  assert.equal((await storedDocument.json()).metadataSnapshot.personal_email, original.personal_email);
  rows.delete(`workforce_docs/${reference}`);
  rows.set('employees/intern', { ...rows.get('employees/intern'), metadata_snapshot: metadataSnapshot });
  assert.equal((await call({ employeeId: 'intern' })).status, 200);
  assert.equal(state.writes, 0);
});

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
