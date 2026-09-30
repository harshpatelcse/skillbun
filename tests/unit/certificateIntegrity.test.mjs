import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CertificateMutationError, changeCertificateRevocation, createIssuedCertificate, normalizeAdminCertificateId, validateCertificateIssue } from '../../utils/server/certificateIntegrity.mjs';

function fakeDb(seed = {}) {
  const rows = new Map(Object.entries(seed));
  let tail = Promise.resolve();
  const db = {
    rows,
    collection(name) {
      return {
        doc: id => ({ path: `${name}/${id}`, id }),
        where: (field, op, value) => ({ limit: () => ({ name, field, value }) }),
      };
    },
    runTransaction(callback) {
      const run = tail.then(async () => {
        const writes = [];
        const result = await callback({
          async get(ref) {
            if (ref.path) return { exists: rows.has(ref.path), data: () => rows.get(ref.path) };
            const docs = [...rows].filter(([key, value]) => key.startsWith(ref.name + '/') && value[ref.field] === ref.value);
            return { empty: docs.length === 0, docs };
          },
          create(ref, data) { writes.push(() => { assert.equal(rows.has(ref.path), false); rows.set(ref.path, data); }); },
          update(ref, patch) { writes.push(() => { assert.ok(rows.has(ref.path)); rows.set(ref.path, { ...rows.get(ref.path), ...patch }); }); },
        });
        writes.forEach(write => write());
        return result;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  return db;
}

const issue = { name: 'Synthetic Student', email: 'student@example.test', roadmapTitle: 'Frontend', cert_type: 'ROADMAP', score: 80 };
const certificate = { ...issue, id: 'TEST-CREDENTIAL', display_id: 'TEST-CREDENTIAL', uid: 'student', template_version: 'v1', is_revoked: false };

test('issuance accepts valid manual credentials without coercing issued score or inventing identity', () => {
  assert.deepEqual(validateCertificateIssue(issue), issue);
  assert.equal(validateCertificateIssue({ ...issue, score: 0 }).score, 0);
  assert.equal(validateCertificateIssue({ name: 'Student', stream_or_track: 'Node.js', email: '' }).email, '');
});

test('issuance rejects protected fields, malformed identities, invalid scores and impossible dates', () => {
  for (const patch of [
    { uid: 'forged' }, { template_version: 'v99' }, { is_revoked: false }, { attemptId: 'att_fake' },
    { cert_type: 'OFFER_LETTER' }, { score: '100' }, { score: 101 }, { score: NaN }, { score: null },
    { name: {} }, { email: 'missing-domain' }, { custom_id: '../victim' },
    { start_date: '2026-02-30' }, { start_date: '2026-10-01', end_date: '2026-09-01' },
    { stream_or_track: 'Different' },
  ]) assert.throws(() => validateCertificateIssue({ ...issue, ...patch }), { status: 400 });
});

test('workforce display IDs normalize while mixed-case legacy keys remain exact', () => {
  assert.equal(normalizeAdminCertificateId('SKB/2026/INT-REC/8K29DF'), 'SKB-2026-INT-REC-8K29DF');
  assert.equal(normalizeAdminCertificateId('aBcDeFgHiJkLmNoPqRst'), 'aBcDeFgHiJkLmNoPqRst');
  for (const id of ['', '../secret', 'a/b', 'a\\b', 'a\0b', 'x'.repeat(129)]) assert.throws(() => normalizeAdminCertificateId(id));
});

test('two simultaneous issuances cannot overwrite the same certificate ID', async () => {
  const db = fakeDb();
  const results = await Promise.allSettled([
    createIssuedCertificate(db, certificate),
    createIssuedCertificate(db, { ...certificate, name: 'Replacement' }),
  ]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected']);
  assert.equal(results[1].reason.code, 'CERTIFICATE_ID_EXISTS');
  assert.equal(db.rows.get('certificates/TEST-CREDENTIAL').name, 'Synthetic Student');
});

test('a custom ID cannot shadow an issued legacy display reference', async () => {
  const db = fakeDb({ 'certificates/legacy-key': { ...certificate, id: 'legacy-key' } });
  await assert.rejects(createIssuedCertificate(db, certificate), { code: 'CERTIFICATE_ID_EXISTS' });
  assert.equal(db.rows.has('certificates/TEST-CREDENTIAL'), false);
});

test('account deletion blocks new owned roadmap issuance without blocking retained workforce credentials', async () => {
  const db = fakeDb({ 'accountDeletions/student': { status: 'pending' } });
  await assert.rejects(createIssuedCertificate(db, certificate), { code: 'auth/account-deleting' });
  await createIssuedCertificate(db, { ...certificate, cert_type: 'INTERNSHIP' });
  assert.equal(db.rows.get('certificates/TEST-CREDENTIAL').cert_type, 'INTERNSHIP');
});

test('issued identity, score, title and template cannot be edited or bundled into a revocation', async () => {
  const db = fakeDb({ 'certificates/TEST-CREDENTIAL': certificate });
  for (const body of [{ name: 'Replacement' }, { score: 100 }, { email: 'other@example.test' },
    { roadmapTitle: 'Other' }, { is_revoked: true, template_version: 'v2' }, { is_revoked: 'true' }, {}, null]) {
    await assert.rejects(changeCertificateRevocation(db, { id: certificate.id, body, adminEmail: 'harsh@skillbun.tech' }), { status: 400 });
  }
  assert.deepEqual(db.rows.get('certificates/TEST-CREDENTIAL'), certificate);
});

test('revocation and reinstatement preserve the original issued snapshot', async () => {
  const db = fakeDb({ 'certificates/TEST-CREDENTIAL': certificate });
  const now = new Date('2026-09-30T00:00:00Z');
  const revoked = await changeCertificateRevocation(db, { id: certificate.id, body: { is_revoked: true }, adminEmail: 'harsh@skillbun.tech', now });
  assert.equal(revoked.revoked_by, 'harsh@skillbun.tech');
  assert.equal(revoked.revoked_at, now);
  assert.deepEqual(db.rows.get('certificates/TEST-CREDENTIAL'), { ...certificate, ...revoked });
  const restored = await changeCertificateRevocation(db, { id: certificate.id, body: { is_revoked: false }, adminEmail: 'harsh@skillbun.tech', now });
  assert.equal(restored.revoked_by, null);
  assert.equal(restored.revoked_at, null);
  assert.equal(db.rows.get('certificates/TEST-CREDENTIAL').score, 80);
  await assert.rejects(changeCertificateRevocation(db, { id: 'missing', body: { is_revoked: true } }), { status: 404 });
});

async function loadIssueRoute({ db = fakeDb(), admin = true, allowed = true } = {}) {
  const source = (await readFile(new URL('../../app/api/admin/certificates/route.js', import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s*['"][^'"]+['"];\s*/g, '').replace(/export /g, '');
  let recipientLookups = 0;
  const dependencies = {
    NextResponse: { json: Response.json },
    getFirebaseAdminAuth: () => ({
      verifyIdToken: async () => ({ uid: 'admin', email: 'harsh@skillbun.tech' }),
      getUserByEmail: async email => { recipientLookups++; return { uid: 'verified-recipient', email, emailVerified: true }; },
    }),
    getFirebaseAdminFirestore: () => db,
    isUserAuthorizedAdmin: async () => admin,
    checkServerRateLimit: async () => ({ allowed, retryAfterMs: 1000 }),
    getClientAddress: () => '127.0.0.1',
    generateCertificateId: () => 'TEST-CREDENTIAL',
    getActiveTemplateVersion: () => 'v1',
    invalidateCacheTag: async () => {},
    CertificateMutationError, createIssuedCertificate, validateCertificateIssue,
  };
  const post = new Function(...Object.keys(dependencies), source + '; return POST;')(...Object.values(dependencies));
  const call = (body, token = 'admin-token') => post(new Request('https://skillbun.tech/api/admin/certificates', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  }));
  return { call, db, get recipientLookups() { return recipientLookups; } };
}

test('HTTP issuance requires administrator authorization and rate-limit permission before lookup', async () => {
  for (const [options, token, status] of [[{}, '', 401], [{ admin: false }, 'token', 403], [{ allowed: false }, 'token', 429]]) {
    const route = await loadIssueRoute(options);
    assert.equal((await route.call(issue, token)).status, status);
    assert.equal(route.recipientLookups, 0);
    assert.equal(route.db.rows.size, 0);
  }
});

test('HTTP issuance binds verified recipient identity on the server and returns a collision as 409', async () => {
  const route = await loadIssueRoute();
  assert.equal((await route.call({ ...issue, uid: 'forged' })).status, 400);
  assert.equal(route.recipientLookups, 0);
  const first = await route.call(issue);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).certificate.uid, 'verified-recipient');
  const second = await route.call({ ...issue, name: 'Changed Holder' });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, 'CERTIFICATE_ID_EXISTS');
  assert.equal(route.db.rows.get('certificates/TEST-CREDENTIAL').name, issue.name);
});
