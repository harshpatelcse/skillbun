import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailSignupHandlers, getSignupClientAddress } from '../../utils/server/emailSignupHttp.mjs';
import { EmailSignupError } from '../../utils/server/emailSignup.mjs';

const EMAIL = 'student@skillbun.tech';
const CHALLENGE = 'a'.repeat(43);
const VERIFY = { email: EMAIL, password: '  SELECT password; keep spaces  ', code: '123456', challengeId: CHALLENGE };

function setup({ production = true, captcha = false, proofValid = true, origins = ['https://skillbun.tech'] } = {}) {
  const calls = [];
  const proofs = [];
  const controls = { error: null, serviceError: null };
  let serviceReads = 0;
  const requestResult = { ok: true, challengeId: CHALLENGE, expiresAt: 1_800_000_000_000, retryAfterMs: 60_000 };
  const handlers = createEmailSignupHandlers({
    production,
    allowedOrigins: () => origins,
    captchaEnabled: () => captcha,
    verifyHumanProof: token => { proofs.push(token); return { valid: proofValid }; },
    getService: () => {
      serviceReads++;
      if (controls.serviceError) throw controls.serviceError;
      return {
        async requestCode(input) {
          calls.push({ action: 'request', input });
          if (controls.error) throw controls.error;
          return requestResult;
        },
        async verifyCode(input) {
          calls.push({ action: 'verify', input });
          if (controls.error) throw controls.error;
          return { ok: true };
        },
      };
    },
  });
  return {
    calls, proofs, controls, requestResult,
    get serviceReads() { return serviceReads; },
    post(action = 'request', options = {}) {
      const headers = new Headers({
        'content-type': 'application/json',
        origin: 'https://skillbun.tech',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': '192.0.2.10',
      });
      for (const [name, value] of Object.entries(options.headers || {})) {
        if (value === null) headers.delete(name);
        else headers.set(name, value);
      }
      const body = Object.hasOwn(options, 'rawBody') ? options.rawBody : JSON.stringify(options.payload ?? (action === 'request' ? { email: EMAIL, ageBand: '18-plus' } : VERIFY));
      const request = new Request(options.url || 'https://skillbun.tech/api/auth/signup/request', {
        method: 'POST', headers, body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
      });
      return (action === 'request' ? handlers.requestCode : handlers.verifyCode)(request);
    },
  };
}

function assertNoServiceAccess(app) {
  assert.equal(app.serviceReads, 0, 'rejected requests must not initialize account or email services');
  assert.deepEqual(app.calls, []);
}

test('signup rejects missing, opaque, foreign and cross-site origins before service access', async () => {
  for (const headers of [
    { origin: null },
    { origin: 'null' },
    { origin: 'https://attacker.invalid' },
    { origin: 'https://skillbun.tech.attacker.invalid' },
    { origin: 'http://skillbun.tech' },
    { origin: 'https://skillbun.tech', 'sec-fetch-site': 'cross-site' },
  ]) {
    for (const action of ['request', 'verify']) {
      const app = setup();
      const response = await app.post(action, { headers });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'INVALID_ORIGIN');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assertNoServiceAccess(app);
    }
  }
});

test('production uses its configured origin allowlist and cannot trust the request host alone', async () => {
  const allowed = setup({ origins: ['https://skillbun.tech', 'https://skillbun.vercel.app'] });
  assert.equal((await allowed.post('request', { headers: { origin: 'https://skillbun.vercel.app', 'sec-fetch-site': 'same-site' } })).status, 200);
  assert.equal(allowed.calls.length, 1);
  for (const url of ['http://localhost:3000/api/auth/signup/request', 'https://attacker.invalid/api/auth/signup/request']) {
    const app = setup();
    assert.equal((await app.post('request', { url, headers: { origin: new URL(url).origin } })).status, 403);
    assertNoServiceAccess(app);
  }
});

test('development allows the local preview origin while rejecting a different origin', async () => {
  for (const host of ['localhost:3000', '127.0.0.1:3100']) {
    const app = setup({ production: false });
    const url = `http://${host}/api/auth/signup/request`;
    assert.equal((await app.post('request', { url, headers: { origin: `http://${host}` } })).status, 200);
  }
  const app = setup({ production: false });
  assert.equal((await app.post('request', { url: 'http://localhost:3000/api/auth/signup/request', headers: { origin: 'https://attacker.invalid' } })).status, 403);
  assertNoServiceAccess(app);
});

test('missing and non-JSON content types are rejected before parsing or service calls', async () => {
  for (const type of [null, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
    const app = setup();
    const response = await app.post('request', { headers: { 'content-type': type } });
    assert.equal(response.status, 415);
    assertNoServiceAccess(app);
  }
});

test('malformed JSON, empty bodies and non-object JSON are rejected without side effects', async () => {
  for (const rawBody of ['', '{', 'null', '[]', '123', '"signup"']) {
    const app = setup();
    const response = await app.post('request', { rawBody });
    assert.equal(response.status, 400);
    assertNoServiceAccess(app);
  }
});

test('an oversized declared content length is rejected even with a small body', async () => {
  const app = setup();
  const response = await app.post('request', { headers: { 'content-length': '20001' } });
  assert.equal(response.status, 413);
  assertNoServiceAccess(app);
});

test('the streamed byte limit stops oversized requests without trusting content length', async () => {
  for (const declaredLength of [null, '1']) {
    const app = setup();
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(' '.repeat(10_000)));
        controller.enqueue(new TextEncoder().encode('é'.repeat(5_001)));
      },
      cancel() { cancelled = true; },
    });
    const response = await app.post('request', { rawBody: stream, headers: { 'content-length': declaredLength } });
    assert.equal(response.status, 413);
    assert.equal(cancelled, true);
    assertNoServiceAccess(app);
  }
});

test('unknown fields and prototype-pollution keys cannot reach signup services', async () => {
  for (const rawBody of [
    `{"email":"${EMAIL}","password":"not-for-request"}`,
    `{"email":"${EMAIL}","__proto__":{"polluted":true}}`,
    `{"email":"${EMAIL}","constructor":{"prototype":{"polluted":true}}}`,
    `{"email":"${EMAIL}","prototype":{}}`,
    JSON.stringify({ ...VERIFY, emailVerified: true }),
    JSON.stringify({ ...VERIFY, uid: 'chosen-victim' }),
  ]) {
    const action = rawBody.includes('challengeId') ? 'verify' : 'request';
    const app = setup();
    assert.equal((await app.post(action, { rawBody })).status, 400);
    assertNoServiceAccess(app);
  }
  assert.equal({}.polluted, undefined);
});

test('invalid email, code, challenge and password shapes are rejected before service access', async () => {
  for (const payload of [
    { ...VERIFY, email: 'not-an-email' },
    { ...VERIFY, code: 123456 },
    { ...VERIFY, code: '12345' },
    { ...VERIFY, code: 'abcdef' },
    { ...VERIFY, challengeId: '../another-record' },
    { ...VERIFY, password: 'short' },
    { ...VERIFY, password: { value: 'attacker' } },
  ]) {
    const app = setup();
    assert.equal((await app.post('verify', { payload })).status, 400);
    assertNoServiceAccess(app);
  }
});

test('signup verification preserves password whitespace and treats it as an opaque credential', async () => {
  const app = setup();
  const response = await app.post('verify');
  assert.equal(response.status, 200);
  assert.equal(app.calls[0].input.password, VERIFY.password);
  assert.equal(app.calls[0].input.code, VERIFY.code);
  assert.equal(app.calls[0].input.challengeId, VERIFY.challengeId);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('enabled human verification requires a valid proof before any mail service access', async () => {
  for (const payload of [{ email: EMAIL, ageBand: '18-plus' }, { email: EMAIL, ageBand: '18-plus', humanToken: 'invalid-human-proof' }]) {
    const app = setup({ captcha: true, proofValid: false });
    const response = await app.post('request', { payload });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'HUMAN_VERIFICATION_REQUIRED');
    assertNoServiceAccess(app);
  }
  const app = setup({ captcha: true });
  assert.equal((await app.post('request', { payload: { email: EMAIL, ageBand: '18-plus', humanToken: 'valid-human-proof' } })).status, 200);
  assert.deepEqual(app.proofs, ['valid-human-proof']);
  assert.equal(app.calls.length, 1);
});

test('a disabled CAPTCHA and an existing OTP verification do not demand a fresh proof', async () => {
  const app = setup({ captcha: false, proofValid: false });
  assert.equal((await app.post()).status, 200);
  assert.deepEqual(app.proofs, []);
  const verifying = setup({ captcha: true, proofValid: false });
  assert.equal((await verifying.post('verify')).status, 200);
  assert.deepEqual(verifying.proofs, []);
});

test('successful requests expose only public challenge data with resend and no-store headers', async () => {
  const app = setup();
  const response = await app.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), app.requestResult);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rate-limit errors retain a rounded Retry-After and are never cached', async () => {
  const app = setup();
  app.controls.error = new EmailSignupError('RATE_LIMITED', 'Please wait.', 429, 1_501);
  const response = await app.post();
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'Please wait.', code: 'RATE_LIMITED', retryAfterMs: 1_501 });
  assert.equal(response.headers.get('retry-after'), '2');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('unexpected service failures do not expose or log credentials and provider messages', async t => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  for (const field of ['error', 'serviceError']) {
    const app = setup();
    app.controls[field] = new Error(`SMTP failed for ${EMAIL}; password=${VERIFY.password}; code=${VERIFY.code}`);
    const response = await app.post('verify');
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(body, /student@|123456|SELECT password|SMTP failed/);
    assert.equal(JSON.parse(body).code, 'SIGNUP_UNAVAILABLE');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.doesNotMatch(JSON.stringify(logs), /student@|123456|SELECT password|SMTP failed/);
});

test('Vercel client addresses ignore spoofed Cloudflare, forwarded-for and real-IP headers', () => {
  const request = { headers: new Headers({
    'x-vercel-forwarded-for': '192.0.2.30, 192.0.2.31',
    'cf-connecting-ip': '198.51.100.1',
    'x-forwarded-for': '198.51.100.2',
    'x-real-ip': '198.51.100.3',
  }) };
  assert.equal(getSignupClientAddress(request, true), '192.0.2.30');
  request.headers.delete('x-vercel-forwarded-for');
  assert.equal(getSignupClientAddress(request, true), 'unknown');
  request.headers.set('x-vercel-forwarded-for', 'invalid-address');
  assert.equal(getSignupClientAddress(request, true), 'unknown');
  assert.equal(getSignupClientAddress(request, false), '198.51.100.2');
});

test('IPv6 privacy addresses share a normalized /64 bucket and mapped IPv4 uses IPv4 limits', () => {
  for (const address of [
    '2001:0DB8:0001:0002:0000:0000:0000:0001',
    '2001:db8:1:2::2',
    '2001:db8:1:2:abcd:efff:1234:5678',
  ]) {
    assert.equal(getSignupClientAddress({ headers: new Headers({ 'x-vercel-forwarded-for': address }) }, true), '2001:db8:1:2::/64');
  }
  assert.equal(getSignupClientAddress({ headers: new Headers({ 'x-vercel-forwarded-for': '2001:db8:1:3::2' }) }, true), '2001:db8:1:3::/64');
  assert.equal(getSignupClientAddress({ headers: new Headers({ 'x-vercel-forwarded-for': '::FFFF:192.0.2.10' }) }, true), '192.0.2.10');
});
