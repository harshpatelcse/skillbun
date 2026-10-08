import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountDeletionHandler } from '../../utils/server/accountDeletionHttp.mjs';

const timestamp = 2_000_000_000_000;
const origin = 'https://skillbun.test';
function setup(overrides = {}) {
  const calls = { verify: [], erase: [], roles: 0, limits: 0 };
  const auth = { verifyIdToken: async (...args) => {
    calls.verify.push(args);
    if (overrides.authError) throw overrides.authError;
    return { uid: 'student', email_verified: true, auth_time: timestamp / 1000, ...overrides.claims };
  } };
  const handle = createAccountDeletionHandler({
    getAuth: () => auth, getDb: () => overrides.noDb ? null : {},
    isAdmin: async () => { calls.roles++; return overrides.admin === true; },
    checkRateLimit: async input => { calls.limits++; assert.equal(input.requireDistributed, true); return { allowed: !overrides.limited, retryAfterMs: 1200 }; },
    deleteAccount: async input => {
      calls.erase.push(input);
      if (overrides.eraseError) throw overrides.eraseError;
      return overrides.result ?? { success: true, status: 'complete', firestoreDeleted: true, authDeleted: true };
    },
    allowedOrigins: () => [origin], production: true, now: () => timestamp,
  });
  const run = async ({ headers = {}, path = '/api/account', method = 'DELETE', target, body } = {}) => {
    const response = await handle(new Request(`${origin}${path}`, {
      method, headers: { authorization: 'Bearer token', origin, ...headers }, body,
      ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
    }), target);
    return { response, data: await response.json() };
  };
  return { calls, run };
}

test('self erasure derives identity from token and opts into deletion-only authentication', async () => {
  const app = setup();
  const { response, data } = await app.run();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'complete');
  assert.deepEqual(app.calls.verify[0], ['token', { allowDeleting: true }]);
  assert.equal(app.calls.erase[0].uid, 'student');
  assert.equal(app.calls.erase[0].expectedEmail, '');
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('bodyless DELETE accepts empty HTTP adapter streams and explicit zero-length bodies', async () => {
  for (const body of ['', new ReadableStream({ start(controller) { controller.close(); } }), new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array()); controller.close(); } })]) {
    const app = setup();
    const { response, data } = await app.run({ body });
    assert.equal(response.status, 200);
    assert.equal(data.status, 'complete');
    assert.equal(app.calls.erase.length, 1);
  }
});

test('a nonempty streamed DELETE is rejected and cancelled without consuming the rest', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled = true; },
  });
  const app = setup();
  const { response, data } = await app.run({ body });
  assert.equal(response.status, 400);
  assert.equal(data.code, 'INVALID_PAYLOAD');
  assert.equal(app.calls.erase.length, 0);
  assert.equal(cancelled, true);
});

test('a failing DELETE body stream never authorizes erasure', async () => {
  const app = setup();
  const body = new ReadableStream({ start(controller) { controller.error(new Error('Synthetic transport failure')); } });
  const { response } = await app.run({ body });
  assert.equal(response.status, 503);
  assert.equal(app.calls.erase.length, 0);
});

test('a stalled DELETE body times out without starting erasure', { timeout: 10_000 }, async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const app = setup();
  const { response, data } = await app.run({ body });
  assert.equal(response.status, 503);
  assert.equal(data.code, 'DELETION_FAILED');
  assert.equal(app.calls.erase.length, 0);
  assert.equal(cancelled, true);
});

test('missing, malformed and revoked tokens cannot erase any account', async () => {
  for (const authorization of ['', 'Basic token', 'Bearer token trailing']) {
    const app = setup();
    assert.equal((await app.run({ headers: { authorization } })).response.status, 401);
    assert.equal(app.calls.erase.length, 0);
  }
  const app = setup({ authError: new Error('revoked') });
  assert.equal((await app.run()).response.status, 401);
  assert.equal(app.calls.erase.length, 0);
});

test('server auth_time gates self erasure, not token refresh time or client metadata', async () => {
  for (const auth_time of [undefined, '2000000000', timestamp / 1000 - 301, timestamp / 1000 + 61]) {
    const app = setup({ claims: { auth_time, iat: timestamp / 1000 } });
    const { response, data } = await app.run();
    assert.equal(response.status, 403);
    assert.equal(data.code, 'auth/requires-recent-login');
    assert.equal(app.calls.erase.length, 0);
  }
});

test('admin erasure requires role and keeps the target separate from the requester', async () => {
  const denied = setup();
  assert.equal((await denied.run({ target: { uid: 'victim' } })).response.status, 403);
  assert.equal(denied.calls.erase.length, 0);
  const app = setup({ admin: true, claims: { auth_time: 1 } });
  const { response } = await app.run({ target: { uid: 'victim' }, path: '/api/admin/users/victim?email=Victim%40example.test&adminEmail=ignored%40example.test' });
  assert.equal(response.status, 200);
  assert.deepEqual(app.calls.verify[0], ['token', { allowDeleting: false }]);
  assert.equal(app.calls.erase[0].uid, 'victim');
  assert.equal(app.calls.erase[0].expectedEmail, 'victim@example.test');
});

test('admins deleting themselves must still authenticate recently', async () => {
  const app = setup({ admin: true, claims: { auth_time: 1 } });
  assert.equal((await app.run({ target: { uid: 'student' } })).response.status, 403);
  assert.equal(app.calls.erase.length, 0);
});

test('foreign origins and cross-site requests fail before account lookup', async () => {
  for (const headers of [{ origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    const app = setup();
    assert.equal((await app.run({ headers })).response.status, 403);
    assert.equal(app.calls.verify.length, 0);
  }
});

test('payloads cannot redirect self deletion or inject extra target properties', async () => {
  for (const args of [
    { path: '/api/account?uid=victim' },
    { body: JSON.stringify({ uid: 'victim' }) },
    { path: '/api/admin/users/victim?email=a%40example.test&email=b%40example.test', target: { uid: 'victim' } },
    { path: '/api/admin/users/victim?email=bad', target: { uid: 'victim' } },
    { target: { uid: '../victim' } },
  ]) {
    const app = setup({ admin: true });
    assert.equal((await app.run(args)).response.status, 400);
    assert.equal(app.calls.erase.length, 0);
  }
});

test('distributed limits stop deletion before data access', async () => {
  const app = setup({ limited: true });
  const { response } = await app.run();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '2');
  assert.equal(app.calls.erase.length, 0);
});

test('pending cleanup is explicitly incomplete and retryable', async () => {
  const app = setup({ result: { success: false, status: 'pending', retryAfterMs: 1000 } });
  const { response, data } = await app.run();
  assert.equal(response.status, 202);
  assert.equal(data.success, false);
  assert.equal(response.headers.get('retry-after'), '1');
});

test('identity mismatch and partial failure never become success responses', async () => {
  const error = Object.assign(new Error('The account email changed.'), { status: 409, code: 'IDENTITY_MISMATCH', retryable: false });
  const app = setup({ eraseError: error });
  const { response, data } = await app.run();
  assert.equal(response.status, 409);
  assert.equal(data.success, false);
  assert.equal(data.code, 'IDENTITY_MISMATCH');
  const malformed = setup({ result: { success: true } });
  assert.equal((await malformed.run()).response.status, 503);
  const missing = setup({ noDb: true });
  assert.equal((await missing.run()).response.status, 503);
  assert.equal(missing.calls.erase.length, 0);
});
