import assert from 'node:assert/strict';
import { test } from 'node:test';
import { certificateLookupKeys, createPublicCertificateHandler, lookupPublicCertificate, toPublicCertificate } from '../../utils/server/publicCertificate.mjs';
import { CertificateLookupError, fetchPublicCertificate } from '../../utils/client/publicCertificate.mjs';
import { certificateShareUrl, linkedInCertificateUrl } from '../../utils/client/certificateSharing.mjs';

const id = 'SKB8F92-4C-29-9A7E';
const base = { name: 'Example Student', roadmapTitle: 'Frontend', roadmapSlug: 'frontend', score: 80, createdAt: new Date('2026-09-01T00:00:00Z'), template_version: 'v1', cert_type: 'ROADMAP', is_revoked: false };

function database(records = {}, options = {}) {
  const calls = { ids: [], aliases: [], limits: [] };
  const snapshot = key => ({ id: key, exists: key in records, data: () => records[key] });
  const db = { collection(name) {
    assert.equal(name, 'certificates');
    return {
      doc(key) { assert.doesNotMatch(key, /[/.]/); calls.ids.push(key); return { get: async () => { if (options.readError) throw options.readError; return snapshot(key); } }; },
      where(field, op, aliases) {
        assert.ok(['id', 'display_id'].includes(field)); assert.equal(op, 'in'); calls.aliases.push(aliases);
        return { limit(count) { calls.limits.push(count); return { get: async () => {
          if (options.aliasError) throw options.aliasError;
          return { docs: Object.keys(records).filter(key => aliases.includes(records[key][field])).slice(0, count).map(snapshot) };
        } }; } };
      },
    };
  } };
  return { db, calls };
}

function handler(records = {}, options = {}) {
  const { db, calls } = database(records, options);
  let rateCalls = 0;
  const handle = createPublicCertificateHandler({
    getDb: () => options.noDb ? null : db,
    getAddress: () => '192.0.2.1', timeoutMs: options.timeoutMs || 100,
    checkRateLimit: async input => {
      rateCalls++;
      assert.equal(input.requireDistributed, true);
      assert.equal(input.subject, '192.0.2.1');
      if (options.limitPending) return new Promise(() => {});
      if (options.limitError) throw options.limitError;
      return { allowed: !options.limited, retryAfterMs: 1500 };
    },
  });
  return { calls, get rateCalls() { return rateCalls; }, async run(query = `id=${id}`, method = 'GET') {
    const response = await handle(new Request(`https://skillbun.test/api/certificates/verify?${query}`, { method }));
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
    return { response, body: await response.json() };
  } };
}

test('public projection retains every renderer field and removes private and unknown fields', () => {
  const data = {
    ...base, cert_type: 'LOR', display_id: 'SKB/2026/CORP-LOR/ABCD23',
    name: 'Example Student', department: 'Engineering', designation: 'Intern', stream_or_track: 'Web Engineering', role: 'Engineer',
    grade: 'A', mode: 'Remote', venue: 'Online', performance_rating: 'Excellent', start_date: '2026-01-01', end_date: '2026-07-01',
    issue_date: '01-09-2026', recommendation_text: 'Example recommendation.', performance_remarks: 'Example remarks.', issued_by: 'Harsh Patel',
    uid: 'private-uid', email: 'private@example.test', userEmail: 'alternate@example.test', employee_id: 'private-employee',
    attemptId: 'att_private123', issued_by_admin: 'admin@example.test', issued_by_email: 'issuer@example.test', revoked_by: 'admin@example.test',
    privateNote: 'must not leak', metadata_snapshot: { secret: 'private' }, id: 'spoofed-id', createdAtDate: 'spoofed-date',
  };
  const actual = toPublicCertificate(id, data);
  for (const field of ['name', 'department', 'designation', 'stream_or_track', 'role', 'grade', 'mode', 'venue', 'performance_rating', 'start_date', 'end_date', 'issue_date', 'recommendation_text', 'performance_remarks', 'issued_by']) assert.equal(actual[field], data[field], field);
  assert.equal(actual.id, id);
  assert.equal(actual.createdAt, '2026-09-01T00:00:00.000Z');
  for (const field of ['uid', 'email', 'userEmail', 'employee_id', 'attemptId', 'issued_by_admin', 'issued_by_email', 'revoked_by', 'privateNote', 'metadata_snapshot', 'createdAtDate']) assert.equal(Object.hasOwn(actual, field), false, field);
  assert.doesNotMatch(JSON.stringify(actual), /private|@example\.test|spoofed/);
});

test('email or UID issuer identities are not public and prose emails are redacted', () => {
  for (const issued_by of ['admin@example.test', 'FirebaseUidABC123', 'FirebaseUidOnlyLetters']) {
    const actual = toPublicCertificate(id, { ...base, issued_by, recommendation_text: 'Contact student@example.test for a copy.' });
    assert.equal(Object.hasOwn(actual, 'issued_by'), false);
    assert.doesNotMatch(JSON.stringify(actual), /@example\.test|FirebaseUid/);
  }
});

test('dates and zero scores remain truthful while unsupported template versions remain explicit', () => {
  const legacy = toPublicCertificate(id, { ...base, score: 0, createdAt: undefined, template_version: null });
  assert.equal(legacy.createdAt, null);
  assert.equal(legacy.issue_date, 'Not recorded');
  assert.equal(legacy.score, 0);
  assert.equal(legacy.template_version, null);
  assert.equal(toPublicCertificate(id, { ...base, template_version: 'v99' }).template_version, 'v99');
  assert.equal(toPublicCertificate(id, { ...base, createdAt: { toDate: () => new Date('2026-09-01T00:00:00Z') } }).createdAt, '2026-09-01T00:00:00.000Z');
  assert.equal(toPublicCertificate(id, { ...base, createdAt: 'not a date' }).createdAt, null);
});

test('canonical workforce, display and legacy IDs resolve without losing internal prefix hyphens', async () => {
  const canonical = 'SKB-2026-INT-REC-EJGHNG';
  const legacy = 'SB-INT-2026-EJGHNG';
  for (const storedId of [canonical, legacy]) {
    const { db, calls } = database({ [storedId]: { ...base, cert_type: 'INT-REC' } });
    const result = await lookupPublicCertificate(db, 'skb/2026/int-rec/ejghng');
    assert.equal(result.id, storedId);
    assert.equal(result.cert_type, 'INTERNSHIP');
    assert.equal(result.display_id, 'SKB/2026/INT-REC/EJGHNG');
    assert.ok(calls.ids.length <= 4);
    assert.deepEqual(calls.limits, [2, 2]);
  }
});

test('case-sensitive legacy IDs and safe manual IDs retain their exact identity', async () => {
  for (const custom of ['aBcDef1234567890XYZ', 'MY-CERT', 'short']) {
    assert.deepEqual(certificateLookupKeys(custom).ids, [custom]);
    assert.equal((await lookupPublicCertificate(database({ [custom]: base }).db, custom)).id, custom);
  }
});

test('an existing alias returns its canonical record ID and duplicate matches fail closed', async () => {
  const one = handler({ LegacyRecord123: { ...base, display_id: id } });
  assert.equal((await one.run()).body.certificate.id, 'LegacyRecord123');
  assert.equal((await handler({ LegacyRecord123: { ...base, id } }).run()).body.certificate.id, 'LegacyRecord123');
  const ambiguous = handler({ [id]: base, OtherRecord456: { ...base, display_id: id } });
  const result = await ambiguous.run();
  assert.equal(result.response.status, 409);
  assert.equal(result.body.code, 'AMBIGUOUS_ID');
  assert.equal(Object.hasOwn(result.body, 'certificate'), false);
  const duplicateAliases = handler({ A: { ...base, display_id: id }, B: { ...base, display_id: id }, C: { ...base, display_id: id } });
  assert.equal((await duplicateAliases.run()).response.status, 409);
});

test('revoked records remain inspectable and can never be mistaken for active records', async () => {
  for (const is_revoked of [true, 'true', 'false']) {
    const app = handler({ [id]: { ...base, is_revoked } });
    const { response, body } = await app.run();
    assert.equal(response.status, 200);
    assert.equal(body.certificate.is_revoked, true);
  }
  assert.equal((await handler({ [id]: base }).run()).body.certificate.is_revoked, false);
});

test('malformed and repeated ID parameters fail before database or rate-limit reads', async () => {
  for (const query of ['', 'id=', 'id=../private', 'id=a%00b', 'id=%252F', 'id=a%5Cb', 'id=x&id=y', 'id=x&uid=private', `id=${'a'.repeat(129)}`]) {
    const app = handler();
    assert.equal((await app.run(query)).response.status, 400, query);
    assert.equal(app.calls.ids.length, 0);
    assert.equal(app.rateCalls, 0);
  }
});

test('missing records differ from backend failures and never leak service error details', async () => {
  assert.equal((await handler().run()).response.status, 404);
  for (const options of [{ noDb: true }, { readError: new Error('private service credential') }, { aliasError: new Error('private index URL') }, { limitError: new Error('private redis URL') }]) {
    const { response, body } = await handler({ [id]: base }, options).run();
    assert.equal(response.status, 503);
    assert.equal(body.code, 'VERIFICATION_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(body), /private|redis|credential|index URL/);
  }
});

test('rate limits return Retry-After and timeouts fail closed without database access', async () => {
  const limited = handler({ [id]: base }, { limited: true });
  const { response } = await limited.run();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '2');
  assert.equal(limited.calls.ids.length, 0);
  const timed = handler({}, { limitPending: true, timeoutMs: 5 });
  assert.equal((await timed.run()).response.status, 503);
  assert.equal(timed.calls.ids.length, 0);
});

test('browser adapter uses the public no-store endpoint and preserves revocation/date state', async () => {
  const cert = await fetchPublicCertificate('SKB/2026/INT-REC/EJGHNG', { fetchImpl: async (url, options) => {
    assert.equal(url, '/api/certificates/verify?id=SKB%2F2026%2FINT-REC%2FEJGHNG');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ success: true, certificate: { ...toPublicCertificate(id, base), is_revoked: true } });
  } });
  assert.equal(cert.is_revoked, true);
  assert.equal(cert.createdAtDate.toISOString(), '2026-09-01T00:00:00.000Z');
  const unknownDate = await fetchPublicCertificate(id, { fetchImpl: async () => Response.json({ success: true, certificate: toPublicCertificate(id, { ...base, createdAt: null }) }) });
  assert.equal(unknownDate.createdAtDate, null);
});

test('browser adapter uses controlled errors and does not reflect server details', async () => {
  for (const code of ['NOT_FOUND', 'AMBIGUOUS_ID', 'RATE_LIMITED', 'VERIFICATION_UNAVAILABLE', 'unexpected']) {
    await assert.rejects(fetchPublicCertificate(id, { fetchImpl: async () => Response.json({ code, error: 'private Firebase error' }, { status: 503 }) }), error => {
      assert.ok(error instanceof CertificateLookupError);
      assert.doesNotMatch(error.message, /private|Firebase/);
      return true;
    });
  }
  await assert.rejects(fetchPublicCertificate('../private'), { code: 'INVALID_ID' });
  await assert.rejects(fetchPublicCertificate(id, { fetchImpl: async () => Response.json({ success: true, certificate: { id: '../private' } }) }), { code: 'VERIFICATION_UNAVAILABLE' });
});

test('certificate sharing uses the canonical site and a truthful issuer and issue date', () => {
  assert.equal(certificateShareUrl(id), `https://skillbun.tech/certificate/${id}`);
  assert.equal(certificateShareUrl('SKB/2026/INT-REC/EJGHNG', 'https://example.test/'), 'https://example.test/certificate/SKB-2026-INT-REC-EJGHNG');
  const unknownDate = new URL(linkedInCertificateUrl({ id, roadmapTitle: 'Frontend', createdAtDate: null }));
  assert.equal(unknownDate.searchParams.get('certUrl'), `https://skillbun.tech/certificate/${id}`);
  assert.equal(unknownDate.searchParams.get('organizationName'), 'SkillBun');
  assert.equal(unknownDate.searchParams.has('organizationId'), false);
  assert.equal(unknownDate.searchParams.has('issueYear'), false);
  assert.equal(unknownDate.searchParams.has('issueMonth'), false);
  const issued = new URL(linkedInCertificateUrl({ id, cert_type: 'TRAINING', stream_or_track: 'Web Engineering', createdAtDate: new Date(2025, 7, 15) }, { organizationId: '123456', siteUrl: 'https://example.test' }));
  assert.equal(issued.searchParams.get('name'), 'Training Certificate - Web Engineering');
  assert.equal(issued.searchParams.get('organizationId'), '123456');
  assert.equal(issued.searchParams.has('organizationName'), false);
  assert.equal(issued.searchParams.get('issueYear'), '2025');
  assert.equal(issued.searchParams.get('issueMonth'), '8');
});
