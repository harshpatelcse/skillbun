import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { validateSchema } from '../../utils/server/inputValidator.js';

const stripImports = source => source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replace(/export /g, '');
const proofSource = stripImports(await readFile(new URL('../../utils/server/humanProof.js', import.meta.url), 'utf8'));
const proof = new Function('crypto', 'getHumanProofSecret', 'getHumanProofTtlMs',
  `${proofSource}; return { issueHumanProofToken, verifyHumanProofToken, isHumanProofBoundTo };`
)(crypto, () => 'isolated-route-test-secret', () => 60000);
const routeSource = stripImports(await readFile(new URL('../../app/api/human/verify/route.js', import.meta.url), 'utf8'));

function setup(overrides = {}) {
  const calls = { captcha: [], auth: [], limits: [] };
  const deps = {
    NextResponse: { json: Response.json }, isIP, ...proof, validateSchema,
    process: { env: { NODE_ENV: 'production' } },
    console: { warn() {} },
    getTurnstileSecretKey: () => 'test-captcha-secret',
    isCaptchaEnabled: () => true,
    getFirebaseAdminAuth: () => ({ verifyIdToken: async token => {
      calls.auth.push(token);
      if (token === 'revoked') throw new Error('revoked');
      return { uid: token };
    } }),
    checkServerRateLimit: async input => { calls.limits.push(input); return { allowed: true }; },
    getClientAddress: () => '192.0.2.10',
    fetch: async (url, options) => {
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      calls.captcha.push(new URLSearchParams(options.body));
      return Response.json({ success: true });
    },
    ...overrides,
  };
  const post = new Function(...Object.keys(deps), `${routeSource}; return POST;`)(...Object.values(deps));
  return {
    calls,
    async request({ body = {}, headers = {}, rawBody } = {}) {
      const response = await post(new Request('https://skillbun.tech/api/human/verify', {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers },
        body: rawBody ?? JSON.stringify(body),
      }));
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return response;
    },
  };
}

test('human verification binds fresh challenges to the verified identity and preserves anonymous signup', async () => {
  for (const uid of ['', 'student-a']) {
    const app = setup();
    const response = await app.request({ body: { token: 'turnstile-token' }, headers: uid ? { authorization: `Bearer ${uid}` } : {} });
    assert.equal(response.status, 200);
    const verified = proof.verifyHumanProofToken((await response.json()).humanToken);
    assert.equal(verified.valid, true);
    assert.equal(verified.payload.uid, uid);
    assert.equal(app.calls.captcha.length, 1);
  }
});

test('only the same identity can reuse a cached human proof without a new challenge', async () => {
  const token = proof.issueHumanProofToken({ uid: 'student-a' }).token;
  const app = setup();
  const owner = await app.request({ headers: { authorization: 'Bearer student-a', 'x-skillbun-human': token } });
  assert.equal(owner.status, 200);
  assert.equal((await owner.json()).humanToken, token);
  for (const authorization of ['', 'Bearer student-b']) {
    const response = await app.request({ headers: { ...(authorization ? { authorization } : {}), 'x-skillbun-human': token } });
    assert.equal(response.status, 400, 'foreign proof requires a fresh CAPTCHA token');
  }
  assert.equal(app.calls.captcha.length, 0);
});

test('an anonymous proof cannot be promoted to a signed-in proof without a fresh challenge', async () => {
  const app = setup();
  const token = proof.issueHumanProofToken({ uid: '' }).token;
  const response = await app.request({ headers: { authorization: 'Bearer student-a', 'x-skillbun-human': token } });
  assert.equal(response.status, 400);
  assert.equal(app.calls.captcha.length, 0);
});

test('invalid or revoked supplied sessions cannot fall back to anonymous verification', async () => {
  for (const authorization of ['Basic invalid', 'Bearer revoked']) {
    const app = setup({ isCaptchaEnabled: () => false });
    const response = await app.request({ headers: { authorization } });
    assert.equal(response.status, 401);
    assert.equal(app.calls.captcha.length, 0);
  }
  const app = setup({ getFirebaseAdminAuth: () => null });
  assert.equal((await app.request({ headers: { authorization: 'Bearer student-a' } })).status, 503);
});

test('production rejects dev bypasses even when CAPTCHA is disabled or an existing proof is valid', async () => {
  const humanToken = proof.issueHumanProofToken({ uid: '' }).token;
  for (const captchaEnabled of [true, false]) {
    for (const bypass of [{ body: { token: 'bypass-captcha-dev' } }, { headers: { 'x-skillbun-bypass': 'bypass-captcha-dev' } }]) {
      for (const cached of [false, true]) {
        const app = setup({ isCaptchaEnabled: () => captchaEnabled });
        const response = await app.request({ ...bypass, headers: { ...bypass.headers, ...(cached ? { 'x-skillbun-human': humanToken } : {}) } });
        assert.equal(response.status, 403);
        assert.equal(app.calls.captcha.length, 0);
      }
    }
  }
});

test('explicit development bypass remains server-only and identity-bound', async () => {
  const app = setup({ process: { env: { NODE_ENV: 'development' } } });
  const response = await app.request({ body: { token: 'bypass-captcha-dev' }, headers: { authorization: 'Bearer student-a' } });
  assert.equal(response.status, 200);
  assert.equal(proof.verifyHumanProofToken((await response.json()).humanToken).payload.uid, 'student-a');
  assert.equal(app.calls.captcha.length, 0);
});

test('Cloudflare receives only a trusted address, never a spoofed header or an IPv6 rate-limit bucket', async () => {
  for (const address of ['192.0.2.10', '2001:db8:1:2::/64', 'unknown']) {
    const app = setup({ getClientAddress: () => address });
    const response = await app.request({ body: { token: 'turnstile-token' }, headers: { 'x-forwarded-for': '203.0.113.99' } });
    assert.equal(response.status, 200);
    assert.equal(app.calls.captcha[0].get('remoteip'), isIP(address) ? address : null);
    assert.equal(app.calls.limits[0].subject, address);
  }
});

test('rate limits and malformed CAPTCHA requests stop verification before provider access', async () => {
  const limited = setup({ checkServerRateLimit: async () => ({ allowed: false, retryAfterMs: 1500 }) });
  const response = await limited.request();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '2');
  assert.equal(limited.calls.captcha.length, 0);
  const app = setup();
  for (const input of [{ rawBody: '{' }, { body: { token: 'x', extra: true } }, { body: { token: 'x'.repeat(2049) } }]) {
    assert.equal((await app.request(input)).status, 400);
  }
  assert.equal(app.calls.captcha.length, 0);
});
