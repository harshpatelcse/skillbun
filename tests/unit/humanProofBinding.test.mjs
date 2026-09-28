import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

// These tests pin the Tier 2 rule: a human-proof token minted for one student must not be
// usable by another, while legacy/unbound tokens (the pre-auth signup OTP flow) stay valid.
//
// utils/server/humanProof.js imports the '@/' Next alias, which bare node --test cannot
// resolve, so the module is loaded the same way tests/fixtures/aiRouteHarness.mjs loads
// routes: read the source, strip imports, and inject the dependencies explicitly.
async function loadHumanProof() {
  let source = await fs.readFile(new URL('../../utils/server/humanProof.js', import.meta.url), 'utf8');
  source = source
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replace(/export /g, '');
  return new Function(
    'crypto', 'getHumanProofSecret', 'getHumanProofTtlMs',
    `${source}; return { issueHumanProofToken, verifyHumanProofToken, isHumanProofBoundTo };`
  )(crypto, () => 'test-human-proof-secret', () => 30 * 60 * 1000);
}

const { issueHumanProofToken, verifyHumanProofToken, isHumanProofBoundTo } = await loadHumanProof();

test('a token minted for one student is rejected for a different student', () => {
  const issued = issueHumanProofToken({ v: 1, uid: 'student-a' });
  assert.ok(issued, 'token should be issued when a secret is available');

  const verification = verifyHumanProofToken(issued.token);
  assert.equal(verification.valid, true);

  assert.equal(isHumanProofBoundTo(verification, 'student-a'), true, 'owner may use their own token');
  assert.equal(isHumanProofBoundTo(verification, 'student-b'), false, 'a copied token must not transfer');
});

test('an unbound token stays valid for the pre-auth signup OTP flow', () => {
  const issued = issueHumanProofToken({ v: 1, uid: '' });
  assert.ok(issued);

  const verification = verifyHumanProofToken(issued.token);
  assert.equal(verification.valid, true);
  assert.equal(isHumanProofBoundTo(verification, ''), true, 'no account yet — still valid');
  assert.equal(isHumanProofBoundTo(verification, 'student-a'), true, 'unbound tokens carry no binding to enforce');
});

test('an invalid or expired verification never passes the binding check', () => {
  assert.equal(isHumanProofBoundTo(undefined, 'student-a'), false);
  assert.equal(isHumanProofBoundTo({ valid: false }, 'student-a'), false);
  assert.equal(isHumanProofBoundTo(verifyHumanProofToken('not-a-real-token'), 'student-a'), false);
});

test('a tampered payload cannot forge a uid binding', () => {
  const issued = issueHumanProofToken({ v: 1, uid: 'student-a' });
  const [payloadSegment, signatureSegment] = issued.token.split('.');

  const forgedPayload = Buffer.from(
    JSON.stringify({ v: 1, uid: 'student-b', exp: Date.now() + 60_000 })
  ).toString('base64url');
  const forged = `${forgedPayload}.${signatureSegment}`;

  assert.notEqual(forgedPayload, payloadSegment);
  assert.equal(verifyHumanProofToken(forged).valid, false, 'the signature must reject a rewritten payload');
});
