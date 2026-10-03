import { passwordResetOrigin, canonicalPasswordResetLink } from '../../utils/server/passwordResetOrigin.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateSchema } from '../../utils/server/inputValidator.js';

const source = (await readFile(new URL('../../app/api/auth/password-reset/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');

function setup({ missingUser = false, mailFailure = false } = {}) {
  let allowanceUsed = 0;
  let authLookups = 0;
  let mails = 0;
  const incrementFlags = [];
  const handler = vm.runInNewContext(`${source}; POST;`, {
    passwordResetOrigin, canonicalPasswordResetLink, URL, console: { error() {} }, process: { env: { NODE_ENV: 'production' } },
    NextResponse: { json: Response.json }, validateSchema,
    getAppOrigin: () => 'https://skillbun.tech', getAllowedAppOrigins: () => ['https://skillbun.tech'],
    getClientAddress: () => '127.0.0.1', hashRateLimitSubject: () => 'email-hash',
    checkServerRateLimit: async ({ increment }) => {
      incrementFlags.push(increment);
      if (allowanceUsed >= 1) return { allowed: false, retryAfterMs: 60000 };
      if (increment) allowanceUsed++;
      return { allowed: true };
    },
    getFirebaseAdminAuth: () => ({
      async getUserByEmail() {
        authLookups++;
        if (missingUser) throw Object.assign(new Error('Missing user'), { code: 'auth/user-not-found' });
        return { uid: 'student' };
      },
      generatePasswordResetLink: async () => 'https://skillbun-75d10.firebaseapp.com/auth/action?mode=resetPassword&oobCode=synthetic',
    }),
    sendSkillBunPasswordResetEmail: async () => { mails++; if (mailFailure) throw new Error('Synthetic SMTP failure'); },
  });
  const call = (body = { email: 'synthetic-student@example.org' }) => handler(new Request('https://skillbun.tech/api/auth/password-reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://skillbun.tech' }, body: JSON.stringify(body),
  }));
  return { call, incrementFlags, get allowanceUsed() { return allowanceUsed; }, get authLookups() { return authLookups; }, get mails() { return mails; } };
}

test('parallel password reset requests reserve one allowance before dispatching mail', async () => {
  const app = setup();
  const responses = await Promise.all(Array.from({ length: 8 }, () => app.call()));
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 429).length, 7);
  assert.equal(app.mails, 1);
  assert.equal(app.authLookups, 1);
  assert.equal(app.allowanceUsed, 1);
  assert.equal(app.incrementFlags.every(Boolean), true);
  const limited = responses.find(response => response.status === 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
});
test('unknown accounts keep the generic response and consume the same reset allowance', async () => {
  const app = setup({ missingUser: true });
  const first = await app.call();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true });
  assert.equal((await app.call()).status, 429);
  assert.equal(app.authLookups, 1);
  assert.equal(app.mails, 0);
});
test('an SMTP failure cannot turn a reset endpoint into an unlimited retry loop', async () => {
  const app = setup({ mailFailure: true });
  assert.equal((await app.call()).status, 503);
  assert.equal((await app.call()).status, 429);
  assert.equal(app.mails, 1);
});
test('invalid reset payloads are rejected before consuming allowance or looking up accounts', async () => {
  const app = setup();
  for (const payload of [null, [], { email: 'invalid' }, { email: 'student@example.test', redirect: 'https://other.test' }]) {
    assert.equal((await app.call(payload)).status, 400);
  }
  assert.equal(app.allowanceUsed, 0);
  assert.equal(app.authLookups, 0);
  assert.equal(app.mails, 0);
});
