import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createUnsubscribeToken, verifyUnsubscribeToken, hasMarketingConsent } from '../../utils/server/emailPreferences.mjs';
import { passwordResetOrigin, canonicalPasswordResetLink } from '../../utils/server/passwordResetOrigin.mjs';
import { PrivateResponse } from '../../utils/server/privateResponse.mjs';
import { logSafeError } from '../../utils/server/safeDiagnostics.mjs';
import { applyStrictBrandMasking } from '../../utils/server/brandMasking.mjs';
import { assertAdultStudent, StudentEligibilityError } from '../../utils/server/studentEligibility.mjs';
import { assertWorkforceAction, assertWorkforceCertificate, isActiveWorkforceMember, isWorkforceTransitionAllowed, transitionWorkforceEmployee, WorkforcePolicyError } from '../../utils/server/workforcePolicy.mjs';
import { validateWorkforceAction } from '../../utils/server/workforceActionValidation.mjs';
import { validateEmail, validateSchema, validateFirestoreId } from '../../utils/server/inputValidator.js';
import { loadAiRoute } from '../fixtures/aiRouteHarness.mjs';

const strippedSource = async path => (await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');

function database(seed = {}) {
  const records = new Map(Object.entries(seed));
  let tail = Promise.resolve();
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => ({ exists: records.has(path), data: () => records.get(path) }), set: async data => records.set(path, data) });
  return {
    records, collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction(fn) {
      const run = tail.then(async () => {
        const writes = [];
        const result = await fn({
          get: document => document.get(),
          set: (document, data, options) => writes.push(() => records.set(document.path, options?.merge ? { ...records.get(document.path), ...data } : data)),
          update: (document, data) => writes.push(() => records.set(document.path, { ...records.get(document.path), ...data })),
          create: (document, data) => writes.push(() => { assert.equal(records.has(document.path), false); records.set(document.path, data); }),
          delete: document => writes.push(() => records.delete(document.path)),
        });
        writes.forEach(write => write());
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
}

test('unsubscribe capabilities are email-bound, expire, reject tampering and cannot imply marketing consent', () => {
  const token = createUnsubscribeToken('student@example.org', 1000);
  assert.equal(verifyUnsubscribeToken(token, 'student@example.org', 1001), true);
  assert.equal(verifyUnsubscribeToken(token, 'other@example.org', 1001), false);
  assert.equal(verifyUnsubscribeToken(`${token}x`, 'student@example.org', 1001), false);
  assert.equal(verifyUnsubscribeToken(token, 'student@example.org', 1000 + 90 * 86400000), false);
  assert.equal(hasMarketingConsent({}), false);
  assert.equal(hasMarketingConsent({ marketingConsent: true }, true), false);
  assert.equal(hasMarketingConsent({ marketingConsent: true }), true);
});

test('preference API rejects other-user changes and unsigned requests; signed links only disable marketing', async () => {
  const db = database({ 'users/student': { marketingConsent: true } });
  const source = await strippedSource('app/api/unsubscribe/route.js');
  const handlers = vm.runInNewContext(`${source}; ({ GET, POST });`, {
    URL, Response, Date, process: { env: { NODE_ENV: 'production' } }, NextResponse: PrivateResponse,
    validateEmail, validateSchema, verifyUnsubscribeToken, hasMarketingConsent,
    getFirebaseAdminAuth: () => ({ verifyIdToken: async token => ({ uid: token, email: token === 'student' ? 'student@example.org' : 'other@example.org', email_verified: true }) }),
    getFirebaseAdminFirestore: () => db, getClientAddress: () => '192.0.2.10', logSafeError: () => 'synthetic-request',
    checkServerRateLimit: async options => { assert.equal(options.requireDistributed, true); return { allowed: true }; },
  });
  const post = (body, token = '') => handlers.POST(new Request('https://skillbun.tech/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  const email = 'student@example.org';
  assert.equal((await post({ email, action: 'unsubscribe' })).status, 403);
  assert.equal((await post({ email, action: 'unsubscribe' }, 'other')).status, 403);
  assert.equal(db.records.has(`unsubscribes/${email}`), false);
  const token = createUnsubscribeToken(email);
  assert.equal((await post({ email, action: 'resubscribe', token })).status, 403);
  const disabled = await post({ email, action: 'unsubscribe', token });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(db.records.has(`unsubscribes/${email}`), true);
  assert.equal((await post({ email, action: 'resubscribe' }, 'student')).status, 200);
  assert.equal(db.records.has(`unsubscribes/${email}`), false);
  assert.equal(db.records.get('users/student').marketingConsent, true);
  assert.equal((await handlers.GET(new Request(`https://skillbun.tech/api/unsubscribe?email=${email}`))).status, 403);
  const ownerStatus = await handlers.GET(new Request(`https://skillbun.tech/api/unsubscribe?email=${email}`, { headers: { Authorization: 'Bearer student' } }));
  assert.deepEqual(await ownerStatus.json(), { unsubscribed: false, marketingConsent: true });
});

test('preferences reject unverified or revoked owners without reads or writes; signed links retain unsubscribe-only access', async () => {
  const email = 'student@example.org';
  const db = database({ 'users/student': { marketingConsent: false } });
  let claim = false, authError = null, storageCalls = 0, quotaCalls = 0;
  const source = await strippedSource('app/api/unsubscribe/route.js');
  const handlers = vm.runInNewContext(`${source}; ({ GET, POST });`, {
    URL, Response, Date, process: { env: { NODE_ENV: 'production' } }, NextResponse: PrivateResponse,
    validateEmail, validateSchema, verifyUnsubscribeToken, hasMarketingConsent,
    getFirebaseAdminAuth: () => ({ verifyIdToken: async () => {
      if (authError) throw Object.assign(new Error('Synthetic authentication rejection'), { code: authError });
      return { uid: 'student', email, email_verified: claim };
    } }),
    getFirebaseAdminFirestore: () => { storageCalls++; return db; }, getClientAddress: () => '192.0.2.10', logSafeError: () => 'synthetic-request',
    checkServerRateLimit: async () => { quotaCalls++; return { allowed: true }; },
  });
  const get = token => handlers.GET(new Request(`https://skillbun.tech/api/unsubscribe?email=${email}${token ? `&token=${token}` : ''}`, { headers: { Authorization: 'Bearer synthetic' } }));
  const post = (action, token) => handlers.POST(new Request('https://skillbun.tech/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic' }, body: JSON.stringify({ email, action, ...(token ? { token } : {}) }) }));
  for (const scenario of [{ claim: false }, { claim: undefined }, { claim: 'true' }, { claim: 1 }, { claim: true, error: 'auth/id-token-revoked' }, { claim: true, error: 'auth/user-disabled' }]) {
    claim = scenario.claim;
    authError = scenario.error;
    for (const response of [await get(), await post('unsubscribe'), await post('resubscribe')]) {
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    }
  }
  assert.equal(storageCalls, 0);
  assert.equal(quotaCalls, 0);
  assert.equal(db.records.size, 1);
  assert.equal(db.records.get('users/student').marketingConsent, false);
  const signed = createUnsubscribeToken(email);
  assert.equal((await post('resubscribe', signed)).status, 403);
  assert.equal((await post('unsubscribe', signed)).status, 200);
  assert.equal(db.records.get(`unsubscribes/${email}`).source, 'signed_email_link');
  assert.equal(db.records.get('users/student').marketingConsent, false);
  assert.deepEqual(await (await get(signed)).json(), { unsubscribed: true });
});

test('all milestone authentication denials retain their response shape and prohibit browser and CDN caching', async () => {
  let verifyCalls = 0, employeeReads = 0;
  const source = await strippedSource('utils/server/workforceMilestones.js');
  const authenticate = vm.runInNewContext(`${source}; authenticateMilestoneCaller;`, {
    PrivateResponse, isActiveWorkforceMember,
    getFirebaseAdminAuth: () => ({ verifyIdToken: async token => {
      verifyCalls++;
      if (token !== 'inactive') throw Object.assign(new Error('Synthetic token rejection'), { code: 'auth/id-token-revoked' });
      return { uid: 'student', email: 'student@example.org', email_verified: true };
    } }),
    isUserAuthorizedAdmin: async () => false,
    getFirebaseAdminFirestore: () => ({ collection: () => ({ where: () => ({ get: async () => { employeeReads++; return { docs: [] }; } }) }) }),
  });
  for (const [authorization, status, code] of [[null, 401, 'UNAUTHORIZED'], ['Basic synthetic', 401, 'UNAUTHORIZED'], ['Bearer invalid', 401, 'UNAUTHORIZED'], ['Bearer inactive', 403, 'FORBIDDEN']]) {
    const result = await authenticate(new Request('https://skillbun.tech/api/admin/workforce/milestones', { headers: authorization ? { Authorization: authorization } : {} }));
    assert.equal(result.response.status, status);
    assert.equal(result.response.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(result.response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(result.response.headers.get('vercel-cdn-cache-control'), 'no-store');
    const body = await result.response.json();
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, 'string');
  }
  assert.equal(verifyCalls, 2, 'missing or malformed authorization does not reach Auth');
  assert.equal(employeeReads, 1, 'only a verified account reaches membership lookup');
});

test('production reset destinations use canonical HTTPS and preserve the action code safely', () => {
  for (const requestOrigin of ['http://skillbun.tech', 'http://localhost:3000', 'https://attacker.example', 'https://skillbun.tech:8080']) {
    assert.equal(passwordResetOrigin({ configuredOrigin: 'https://skillbun.tech', requestOrigin, environment: 'production' }), 'https://skillbun.tech');
  }
  for (const configuredOrigin of ['http://skillbun.tech', 'https://user:secret@skillbun.tech', 'https://skillbun.tech:8080', 'https://skillbun.tech/other']) {
    assert.throws(() => passwordResetOrigin({ configuredOrigin, environment: 'production' }));
  }
  assert.equal(passwordResetOrigin({ configuredOrigin: 'https://skillbun.tech', requestOrigin: 'http://127.0.0.1:3000', environment: 'development' }), 'http://127.0.0.1:3000');
  const link = new URL(canonicalPasswordResetLink('https://firebase.example/auth/action?oobCode=synthetic&mode=resetPassword', 'https://skillbun.tech'));
  assert.equal(link.origin, 'https://skillbun.tech');
  assert.equal(link.searchParams.get('oobCode'), 'synthetic');
});

test('private success and error responses prohibit caching and diagnostics never log exception payloads', t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  for (const status of [200, 401, 500]) {
    const response = PrivateResponse.json({ error: status === 200 ? undefined : 'Safe error.' }, { status, headers: { 'Cache-Control': 'public, max-age=86400' } });
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  }
  logSafeError('Synthetic service', new Error('password=synthetic-private; email=student@example.org; oobCode=secret'));
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-private|student@|oobCode=secret/);
  assert.match(JSON.stringify(logs), /requestId/);
});

test('terminated workforce membership and terminal states cannot pass action or certificate policy', () => {
  const employee = { personal_email: 'intern@example.org', status: 'ACTIVE', joining_date: '2026-08-01', contract_end_date: '2026-10-01' };
  assert.equal(isActiveWorkforceMember(employee, 'intern@example.org'), true);
  assert.equal(isActiveWorkforceMember({ ...employee, portal_access_revoked: true }, 'intern@example.org'), false);
  for (const status of ['TERMINATED', 'ARCHIVED', 'COMPLETED']) {
    assert.equal(isActiveWorkforceMember({ ...employee, status }, 'intern@example.org'), false);
    for (const action of ['activate', 'offer', 'extension']) assert.throws(() => assertWorkforceAction({ ...employee, status }, action, '2026-12-01'), WorkforcePolicyError);
  }
  assert.throws(() => assertWorkforceAction(employee, 'extension', '2026-09-30'), WorkforcePolicyError);
  assert.doesNotThrow(() => assertWorkforceAction(employee, 'extension', '2026-12-01'));
  assert.throws(() => assertWorkforceCertificate(employee, 'INTERNSHIP'), WorkforcePolicyError);
  assert.doesNotThrow(() => assertWorkforceCertificate({ ...employee, status: 'COMPLETED' }, 'LOR'));
});

test('fresh transactional status checks reject races and serialize concurrent employee actions', async () => {
  const db = database({ 'employees/intern': { status: 'OFFER_SENT' } });
  const ref = db.collection('employees').doc('intern');
  const results = await Promise.allSettled([1, 2].map(() => transitionWorkforceEmployee(db, ref, { action: 'activate', nextStatus: 'ACTIVE', expectedStatus: 'OFFER_SENT' })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  db.records.set(ref.path, { status: 'TERMINATED' });
  await assert.rejects(transitionWorkforceEmployee(db, ref, { action: 'activate', nextStatus: 'ACTIVE' }), WorkforcePolicyError);
  assert.equal(db.records.get(ref.path).status, 'TERMINATED');
});

test('adult profile eligibility fails closed for legacy, minor and unavailable profiles', async () => {
  const db = database({ 'users/adult': { ageBand: '18-plus' }, 'users/minor': { ageBand: '13-17' } });
  await assertAdultStudent(db, 'adult');
  for (const uid of ['minor', 'missing']) await assert.rejects(assertAdultStudent(db, uid), StudentEligibilityError);
  await assert.rejects(assertAdultStudent(null, 'adult'), { status: 503 });
});

test('AI account quotas persist across IP changes and shared-store outages stop providers', async () => {
  const source = await strippedSource('utils/server/rateLimitStore.js');
  const memoryCheck = vm.runInNewContext(`${source}; checkMemoryRateLimit;`, { crypto, process: { env: { NODE_ENV: 'test' } }, console });
  let address = '192.0.2.1';
  let providerCalls = 0;
  const route = await loadAiRoute('gemini', {
    getGeminiRateLimitPerMinute: () => 1, getClientAddress: () => address,
    checkServerRateLimit: options => memoryCheck(options),
    fetch: async () => { providerCalls++; return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Safe guidance.' } }] }); },
  });
  const request = () => new Request('https://skillbun.tech/api/gemini', { method: 'POST', headers: { Authorization: 'Bearer student', 'x-skillbun-human': 'signed-test-proof' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Help me learn.' }] }] }) });
  assert.equal((await route.POST(request())).status, 200);
  address = '192.0.2.2';
  assert.equal((await route.POST(request())).status, 429);
  assert.equal(providerCalls, 1);
  const unavailable = await loadAiRoute('gemini', { checkServerRateLimit: async () => { throw new Error('Distributed rate limiting is unavailable.'); }, fetch: async () => assert.fail('No provider call during quota outage') });
  assert.equal((await unavailable.POST(request())).status, 503);
});

test('career quiz sanitizer masks known vendor labels without replacing unrelated words', () => {
  assert.equal(applyStrictBrandMasking('Gemini 2.5, ChatGPT and Google AI'), 'BunBot, BunBot and BunBot Engine');
  assert.equal(applyStrictBrandMasking('A llama farm and Claudeville'), 'A BunBot farm and Claudeville');
  assert.equal(applyStrictBrandMasking('Cloud storage and normal career guidance'), 'Cloud storage and normal career guidance');
});

test('workforce certificate ownership resolves the recipient instead of falling back to its issuing administrator', async () => {
  const source = await strippedSource('app/api/certify/mint/route.js');
  const employee = { status: 'COMPLETED', full_name: 'Synthetic Intern', personal_email: 'intern@example.org' };
  const db = database({ 'employees/intern': employee });
  const handler = vm.runInNewContext(`${source}; POST;`, {
    NextResponse: PrivateResponse, Date, console, process: { env: {} },
    ExamError: class extends Error {}, mintExamCertificate: () => assert.fail('This is the workforce branch'),
    assertWorkforceCertificate, WorkforcePolicyError, validateSchema, validateFirestoreId,
    getFirebaseAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'issuer', email: 'admin@example.org' }), getUserByEmail: async () => ({ uid: 'recipient', emailVerified: true, disabled: false }) }),
    getFirebaseAdminFirestore: () => db, isUserAuthorizedAdmin: async () => true,
    getClientAddress: () => '192.0.2.1', checkServerRateLimit: async () => ({ allowed: true }),
    generateWorkforceId: () => 'SKB-2026-INT-REC-SYNTHETIC', formatWorkforceDisplayId: id => id,
    WORKFORCE_PREFIXES: { INTERNSHIP: 'INT' }, getActiveTemplateVersion: () => 'v1',
  });
  const request = overrides => new Request('https://skillbun.tech/api/certify/mint', { method: 'POST', headers: { Authorization: 'Bearer admin' }, body: JSON.stringify({ cert_type: 'INTERNSHIP', employee_id: 'intern', name: 'Synthetic Intern', email: 'intern@example.org', stream_or_track: 'Software development', ...overrides }) });
  assert.equal((await handler(request({ email: 'other@example.org' }))).status, 400);
  assert.equal((await handler(request({}))).status, 200);
  const certificate = db.records.get('certificates/SKB-2026-INT-REC-SYNTHETIC');
  assert.equal(certificate.uid, 'recipient');
  assert.equal(certificate.issued_by_uid, 'issuer');
  assert.equal(certificate.template_version, 'v1');
});

async function offboardingHarness({ smtpError, synchronizeRecipients = false } = {}) {
  const db = database({ 'employees/intern': {
    status: 'COMPLETED', full_name: 'Synthetic Intern', personal_email: 'intern@example.org',
    designation: 'Developer Intern', department: 'Engineering', joining_date: '2026-07-01', contract_end_date: '2026-10-01',
  } });
  const messages = [], logs = [];
  let sequence = 0, recipientLookups = 0, releaseRecipients;
  const recipientsReady = new Promise(resolve => { releaseRecipients = resolve; });
  const source = await strippedSource('app/api/admin/workforce/terminate/route.js');
  const post = vm.runInNewContext(`${source}; POST;`, {
    NextResponse: PrivateResponse, Date, console: { error: (...args) => logs.push(args), log: (...args) => logs.push(args) },
    isWorkforceTransitionAllowed, assertWorkforceCertificate, WorkforcePolicyError, validateWorkforceAction,
    getFirebaseAdminFirestore: () => db,
    getFirebaseAdminAuth: () => ({ getUserByEmail: async () => {
      if (synchronizeRecipients && ++recipientLookups <= 2) {
        if (recipientLookups === 2) releaseRecipients();
        await recipientsReady;
      }
      return { uid: 'recipient', emailVerified: true, disabled: false };
    } }),
    requireWorkforceAdmin: async () => ({ uid: 'admin', email: 'admin@example.org' }), enforceEmployeeRateLimit: async () => null,
    validateEmployeeId: value => validateFirestoreId(value),
    apiError: (message, status, code) => PrivateResponse.json({ error: { message, code } }, { status }),
    generateWorkforceId: prefix => `SKB-2026-${prefix}-SYNTHETIC-${++sequence}`, formatWorkforceDisplayId: id => id,
    WORKFORCE_PREFIXES: { TERMINATION: 'TERM', INTERNSHIP: 'INT', TRAINING: 'TRN', LOR: 'LOR' },
    getActiveTemplateVersion: () => 'v1', DOCUMENT_CATEGORIES: {}, invalidateCacheTag: async () => {},
    buildTerminationDispatchEmail: () => ({ subject: 'Synthetic offboarding', html: '<p>Synthetic notice</p>', text: 'Synthetic notice' }),
    sendMailWithAttachment: async message => { messages.push(message); if (smtpError) throw smtpError; },
  });
  return {
    db, messages, logs,
    submit: () => post(new Request('https://skillbun.tech/api/admin/workforce/terminate', {
      method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: 'intern', grantInternshipCert: true, revokeAccess: false }),
    })),
  };
}

test('completed-staff offboarding serializes duplicate requests before minting or sending mail', async () => {
  const app = await offboardingHarness({ synchronizeRecipients: true });
  const responses = await Promise.all([app.submit(), app.submit()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(app.db.records.get('employees/intern').status, 'COMPLETED');
  assert.ok(app.db.records.get('employees/intern').terminated_at);
  assert.equal([...app.db.records.keys()].filter(path => path.startsWith('certificates/')).length, 1);
  assert.equal(app.messages.length, 1);
  const replay = await app.submit();
  assert.equal(replay.status, 409);
  assert.match((await replay.json()).error.message, /already been offboarded.*existing record/);
  assert.equal(app.messages.length, 1);
});

test('offboarding transport failures return safe guidance and retries cannot duplicate credentials', async () => {
  const app = await offboardingHarness({ smtpError: Object.assign(new Error('password=private-smtp-secret; reset=https://example.test/?oobCode=private-code'), { code: 'ECONNECTION' }) });
  const response = await app.submit();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true, 'the persisted offboarding still completed');
  assert.equal(result.emailDispatched, false);
  assert.match(result.emailError, /delivery could not be confirmed.*existing offboarding record/);
  assert.doesNotMatch(JSON.stringify({ result, logs: app.logs }), /private-smtp-secret|private-code|oobCode/);
  assert.equal((await app.submit()).status, 409);
  assert.equal([...app.db.records.keys()].filter(path => path.startsWith('certificates/')).length, 1);
  assert.equal(app.messages.length, 1);
});
