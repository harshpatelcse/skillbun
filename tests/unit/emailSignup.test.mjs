import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createEmailSignupService } from '../../utils/server/emailSignup.mjs';

const EMAIL = 'student@skillbun.tech';
const ADDRESS = '192.0.2.10';
const PASSWORD = 'A-fresh-strong-password-93!';
const SECRET = 'test-only-signup-secret-with-at-least-32-characters';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Serial Firestore double: a rejected transaction rolls back all pending writes.
// Optional callback retries discard the first writes, as Firestore contention can.
function database() {
  let records = new Map();
  let queue = Promise.resolve();
  const db = {
    failTransactions: false,
    retryNext: 0,
    commits: 0,
    snapshot: () => structuredClone([...records.entries()]),
    seed: (path, data) => records.set(path, structuredClone(data)),
    collection: name => ({ doc: id => reference(`${name}/${id}`) }),
    runTransaction(callback) {
      const result = queue.then(async () => {
        if (db.failTransactions) throw new Error('Firestore unavailable');
        const retries = db.retryNext;
        db.retryNext = 0;
        for (let attempt = 0; attempt <= retries; attempt++) {
          const pending = structuredClone(records);
          const transaction = {
            get: async ref => snapshot(pending, ref),
            set: (ref, data, options) => {
              pending.set(ref.path, structuredClone(options?.merge ? { ...pending.get(ref.path), ...data } : data));
            },
            update: (ref, data) => {
              assert.ok(pending.has(ref.path), 'update requires an existing document');
              pending.set(ref.path, structuredClone({ ...pending.get(ref.path), ...data }));
            },
            create: (ref, data) => {
              assert.ok(!pending.has(ref.path), 'create cannot overwrite a document');
              pending.set(ref.path, structuredClone(data));
            },
            delete: ref => pending.delete(ref.path),
          };
          const value = await callback(transaction);
          if (attempt === retries) {
            records = pending;
            db.commits++;
            return value;
          }
        }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  function snapshot(source, ref) {
    return { exists: source.has(ref.path), data: () => structuredClone(source.get(ref.path)), ref };
  }
  function reference(path) {
    return {
      path,
      id: path.split('/').at(-1),
      get: async () => snapshot(records, reference(path)),
      set: (data, options) => db.runTransaction(tx => tx.set(reference(path), data, options)),
      update: data => db.runTransaction(tx => tx.update(reference(path), data)),
      delete: () => db.runTransaction(tx => tx.delete(reference(path))),
    };
  }
  return db;
}

function setup({ existing, secret = SECRET } = {}) {
  const db = database();
  const messages = [];
  const rateChecks = [];
  const authCalls = [];
  const users = new Map(existing ? [[existing.uid, structuredClone(existing)]] : []);
  let clock = Date.UTC(2026, 8, 23, 12);
  const controls = { failMail: false, failLimit: false, denyLimit: false, failAuthLookup: false, failRevocation: false, failCreateAfterWrite: false };
  const missingUser = () => Object.assign(new Error('No user exists'), { code: 'auth/user-not-found' });
  const auth = {
    async getUserByEmail(email) {
      authCalls.push({ method: 'getUserByEmail', email });
      if (controls.failAuthLookup) throw new Error('Firebase Auth unavailable');
      const user = [...users.values()].find(record => record.email.toLowerCase() === email.toLowerCase());
      if (!user) throw missingUser();
      return structuredClone(user);
    },
    async getUser(uid) {
      authCalls.push({ method: 'getUser', uid });
      if (!users.has(uid)) throw missingUser();
      return structuredClone(users.get(uid));
    },
    async createUser(data) {
      authCalls.push({ method: 'createUser', data: structuredClone(data), commits: db.commits });
      if ([...users.values()].some(user => user.email === data.email)) {
        throw Object.assign(new Error('Email already exists'), { code: 'auth/email-already-exists' });
      }
      const record = { uid: `new-student-${users.size + 1}`, providerData: [{ providerId: 'password' }], ...data };
      users.set(record.uid, structuredClone(record));
      if (controls.failCreateAfterWrite) throw new Error('Firebase response lost after account creation');
      return structuredClone(record);
    },
    async updateUser(uid, data) {
      authCalls.push({ method: 'updateUser', uid, data: structuredClone(data) });
      if (!users.has(uid)) throw missingUser();
      const record = { ...users.get(uid), ...data };
      users.set(uid, structuredClone(record));
      return structuredClone(record);
    },
    async revokeRefreshTokens(uid) {
      authCalls.push({ method: 'revokeRefreshTokens', uid });
      if (controls.failRevocation) throw new Error('Session revocation unavailable');
      if (controls.onRevoke) controls.onRevoke(uid);
    },
  };
  const service = createEmailSignupService({
    db,
    auth,
    secret,
    now: () => clock,
    wait: async milliseconds => { authCalls.push({ method: 'wait', milliseconds }); },
    sendCode: async message => {
      messages.push(structuredClone(message));
      if (controls.failMail) throw new Error('SMTP unavailable');
    },
    checkRateLimit: async options => {
      rateChecks.push(options);
      if (controls.failLimit) throw new Error('Distributed limiter unavailable');
      return controls.denyLimit ? { allowed: false, retryAfterMs: MINUTE } : { allowed: true };
    },
  });
  const hash = (purpose, value) => createHmac('sha256', secret).update(`skillbun:email-signup:${purpose}:${value}`).digest('hex');
  return {
    db, messages, rateChecks, authCalls, users, controls, service,
    now: () => clock,
    advance: milliseconds => { clock += milliseconds; },
    seedChallenge: (email, data) => db.seed(`emailSignupChallenges/${hash('mailbox', email)}`, data),
    hash,
    request: (overrides = {}) => service.requestCode({ email: EMAIL, address: ADDRESS, ageBand: '18-plus', ...overrides }),
    verify: (challenge, overrides = {}) => service.verifyCode({
      email: EMAIL,
      address: ADDRESS,
      password: PASSWORD,
      challengeId: challenge.challengeId,
      code: messages.at(-1)?.code,
      ...overrides,
    }),
  };
}

const accountWrites = app => app.authCalls.filter(call => ['createUser', 'updateUser', 'revokeRefreshTokens'].includes(call.method));
const wrongCode = code => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
function scalarValues(value) {
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(scalarValues);
  return [value];
}
function assertNoStoredSecrets(app) {
  const values = scalarValues(app.db.snapshot());
  assert.ok(!values.includes(PASSWORD), 'Firestore must never store the signup password');
  for (const message of app.messages) assert.ok(!values.includes(message.code), 'Firestore must never store a plaintext OTP');
}

test('request sends a six-digit code with a ten-minute expiry without creating an account', async () => {
  const app = setup();
  const challenge = await app.request();
  assert.equal(challenge.ok, true);
  assert.equal(typeof challenge.challengeId, 'string');
  assert.ok(challenge.challengeId.length >= 24, 'challenge tokens must have sufficient entropy');
  assert.equal(challenge.expiresAt, app.now() + 10 * MINUTE);
  assert.equal(challenge.retryAfterMs, MINUTE);
  assert.equal(app.messages.length, 1);
  assert.equal(app.messages[0].email, EMAIL);
  assert.match(app.messages[0].code, /^\d{6}$/);
  assert.equal(app.messages[0].expiresInMinutes, 10);
  assert.ok(!scalarValues(challenge).includes(app.messages[0].code));
  assert.deepEqual(accountWrites(app), []);
  assertNoStoredSecrets(app);
});

test('a verified code creates exactly one verified password account after a committed transaction', async () => {
  const app = setup();
  const challenge = await app.request();
  const priorCommits = app.db.commits;
  assert.deepEqual(await app.verify(challenge), { ok: true });
  const creation = accountWrites(app).find(call => call.method === 'createUser');
  assert.ok(creation.commits > priorCommits, 'OTP consumption must commit before Firebase account creation');
  assert.equal(creation.data.email, EMAIL);
  assert.equal(creation.data.password, PASSWORD);
  assert.equal(creation.data.emailVerified, true);
  assert.equal(app.users.size, 1);
  const profile = app.db.snapshot().find(([path]) => path === `users/${creation.data.uid}`)?.[1];
  assert.equal(profile.ageBand, '18-plus');
  assert.equal(profile.email, EMAIL);
  assertNoStoredSecrets(app);
});

test('OTP consumption rejects sequential replay and concurrent verification creates only once', async () => {
  const app = setup();
  const challenge = await app.request();
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => app.verify(challenge)));
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(accountWrites(app).filter(call => call.method === 'createUser').length, 1);
  await assert.rejects(app.verify(challenge));
  assert.equal(app.users.size, 1);
});

test('Firestore callback retries cannot duplicate mail or account creation', async () => {
  const app = setup();
  app.db.retryNext = 1;
  const challenge = await app.request();
  assert.equal(app.messages.length, 1);
  app.db.retryNext = 1;
  await app.verify(challenge);
  assert.equal(accountWrites(app).filter(call => call.method === 'createUser').length, 1);
});

test('a lost Firebase creation response recovers only the challenge-reserved account and still blocks replay', async () => {
  const app = setup();
  const challenge = await app.request();
  app.controls.failCreateAfterWrite = true;
  assert.deepEqual(await app.verify(challenge), { ok: true });
  assert.equal(app.users.size, 1);
  assert.equal(accountWrites(app).filter(call => call.method === 'createUser').length, 1);
  await assert.rejects(app.verify(challenge));
});

test('five wrong codes persist their failed attempts and permanently exhaust the challenge', async () => {
  const app = setup();
  const challenge = await app.request();
  const incorrect = wrongCode(app.messages[0].code);
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(app.verify(challenge, { code: incorrect }));
  await assert.rejects(app.verify(challenge));
  assert.deepEqual(accountWrites(app), []);
  assertNoStoredSecrets(app);
});

test('four wrong attempts still allow the correct fifth attempt', async () => {
  const app = setup();
  const challenge = await app.request();
  for (let attempt = 0; attempt < 4; attempt++) {
    await assert.rejects(app.verify(challenge, { code: wrongCode(app.messages[0].code) }));
  }
  assert.deepEqual(await app.verify(challenge), { ok: true });
});

test('parallel wrong-code submissions cannot lose failed-attempt increments', async () => {
  const app = setup();
  const challenge = await app.request();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => app.verify(challenge, { code: wrongCode(app.messages[0].code) })));
  assert.equal(results.filter(result => result.status === 'rejected').length, 5);
  await assert.rejects(app.verify(challenge));
  assert.deepEqual(accountWrites(app), []);
});

test('missing, expired, foreign-email and foreign-token challenges cannot create an account', async () => {
  for (const mutation of [
    () => ({ challengeId: '' }),
    () => ({ challengeId: 'a'.repeat(43) }),
    () => ({ email: 'other-student@skillbun.tech' }),
    app => { app.advance(10 * MINUTE); return {}; },
  ]) {
    const app = setup();
    const challenge = await app.request();
    await assert.rejects(app.verify(challenge, mutation(app)));
    assert.deepEqual(accountWrites(app), []);
  }
});

test('unknown challenge tokens cannot exhaust another browser challenge', async () => {
  const app = setup();
  const challenge = await app.request();
  for (let attempt = 0; attempt < 8; attempt++) {
    await assert.rejects(app.verify(challenge, { challengeId: 'z'.repeat(43), code: wrongCode(app.messages[0].code) }));
  }
  await app.verify(challenge);
  assert.equal(app.users.size, 1);
});

test('malformed codes and weak passwords cannot consume a valid challenge', async () => {
  const app = setup();
  const challenge = await app.request();
  for (const code of ['', '12345', '1234567', 123456, null, 'abcdef']) await assert.rejects(app.verify(challenge, { code }));
  for (const password of ['', 'short', null]) await assert.rejects(app.verify(challenge, { password }));
  assert.deepEqual(accountWrites(app), []);
  await app.verify(challenge);
});

test('invalid DNS labels are rejected before a signup email or account operation', async () => {
  const app = setup();
  for (const email of ['student@exa mple.com', 'student@exam_ple.com', 'student@ex!ample.com', 'student@-example.com']) {
    await assert.rejects(app.request({ email }), { code: 'INVALID_EMAIL' });
  }
  assert.equal(app.messages.length, 0);
  assert.deepEqual(accountWrites(app), []);
});

test('corrupt resend metadata fails closed instead of resetting mailbox limits', async () => {
  const app = setup();
  app.seedChallenge(EMAIL, {
    status: 'ACTIVE',
    sentAt: null,
    resendAt: app.now() + MINUTE,
    expiresAt: app.now() + 10 * MINUTE,
  });
  await assert.rejects(app.request(), { code: 'SIGNUP_UNAVAILABLE' });
  assert.equal(app.messages.length, 0);
  assert.deepEqual(accountWrites(app), []);
});

test('corrupt active challenge hashes, counters, or expiry cannot authorize verification', async () => {
  const challengeId = 'a'.repeat(43);
  const code = '123456';
  const appFactory = (mutate) => {
    const app = setup();
    const record = {
      status: 'ACTIVE',
      emailHash: app.hash('email', EMAIL),
      challengeHash: app.hash('challenge', challengeId),
      codeHash: app.hash('code', `${EMAIL}:${challengeId}:${code}`),
      attempts: 0,
      expiresAt: app.now() + 10 * MINUTE,
      resendAt: app.now() + MINUTE,
      sentAt: [app.now()],
      deleteAfter: new Date(app.now() + DAY),
    };
    app.seedChallenge(EMAIL, { ...record, ...mutate(record, app) });
    return app;
  };

  const corruptions = [
    record => ({ challengeHash: `${record.challengeHash}not-hex` }),
    record => ({ codeHash: `${record.codeHash}not-hex` }),
    () => ({ attempts: '0' }),
    () => ({ attempts: Number.NaN }),
    () => ({ attempts: -1 }),
    () => ({ attempts: 1.5 }),
    () => ({ expiresAt: Number.NaN }),
  ];

  for (const mutate of corruptions) {
    const app = appFactory(mutate);
    await assert.rejects(app.verify({ challengeId }, { code }), { code: 'INVALID_CODE' });
    assert.deepEqual(accountWrites(app), []);
    assert.equal(app.users.size, 0);
  }
});

test('resend waits a full minute and replaces the earlier challenge', async () => {
  const app = setup();
  const first = await app.request();
  const firstCode = app.messages[0].code;
  await assert.rejects(app.request(), { status: 429 });
  app.advance(MINUTE - 1);
  await assert.rejects(app.request(), { status: 429 });
  app.advance(1);
  const second = await app.request();
  assert.notEqual(first.challengeId, second.challengeId);
  await assert.rejects(app.verify(first, { code: firstCode }));
  await app.verify(second);
  assert.equal(app.messages.length, 2);
});

test('simultaneous requests reserve only one challenge and send only one email', async () => {
  const app = setup();
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => app.request()));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(app.messages.length, 1);
  assert.deepEqual(accountWrites(app), []);
});

test('mailbox limits survive address rotation and enforce five messages per rolling hour', async () => {
  const app = setup();
  for (let count = 0; count < 5; count++) {
    await app.request({ address: `192.0.2.${count + 1}` });
    app.advance(MINUTE);
  }
  await assert.rejects(app.request({ address: '198.51.100.20' }), { status: 429 });
  assert.equal(app.messages.length, 5);
  app.advance(HOUR - 5 * MINUTE + 1);
  await app.request();
  assert.equal(app.messages.length, 6);
});

test('daily mailbox limit stops further sends even after the hourly limit resets', async () => {
  const app = setup();
  for (let count = 0; count < 10; count++) {
    await app.request();
    app.advance(13 * MINUTE);
  }
  await assert.rejects(app.request(), { status: 429 });
  assert.equal(app.messages.length, 10);
  app.advance(DAY);
  await app.request();
  assert.equal(app.messages.length, 11);
});

test('email case and whitespace normalization share the same resend limit', async () => {
  const app = setup();
  const challenge = await app.request({ email: '  Student@SkillBun.Tech  ' });
  assert.equal(app.messages[0].email, EMAIL);
  await assert.rejects(app.request(), { status: 429 });
  await app.verify(challenge);
});

test('Gmail dots, plus tags and googlemail aliases cannot bypass mailbox send limits', async () => {
  const app = setup();
  await app.request({ email: 'skill.bun.student+signup@gmail.com' });
  for (const email of ['skillbunstudent@gmail.com', 'skill.bun.student+another@gmail.com', 'skillbunstudent@googlemail.com']) {
    await assert.rejects(app.request({ email, address: '198.51.100.20' }), { status: 429 });
  }
  assert.equal(app.messages.length, 1);
});

test('a Gmail mailbox bucket does not permit changing the exact email bound to an OTP', async () => {
  const app = setup();
  const email = 'skill.bun.student+signup@gmail.com';
  const challenge = await app.request({ email });
  await assert.rejects(app.verify(challenge, { email: 'skillbunstudent@gmail.com' }));
  assert.deepEqual(accountWrites(app), []);
  await app.verify(challenge, { email });
  assert.equal([...app.users.values()][0].email, email);
});

test('request and verification rate checks require distributed enforcement', async () => {
  const app = setup();
  const challenge = await app.request();
  const requestChecks = app.rateChecks.length;
  assert.ok(requestChecks > 0);
  await app.verify(challenge);
  assert.ok(app.rateChecks.length > requestChecks);
  for (const check of app.rateChecks) assert.equal(check.requireDistributed, true);
});

test('rate denial and limiter outages fail closed before mail or account creation', async () => {
  for (const setting of ['denyLimit', 'failLimit']) {
    const app = setup();
    app.controls[setting] = true;
    await assert.rejects(app.request());
    assert.equal(app.messages.length, 0);
    assert.deepEqual(accountWrites(app), []);
    app.controls[setting] = false;
    const challenge = await app.request();
    app.controls[setting] = true;
    await assert.rejects(app.verify(challenge));
    assert.deepEqual(accountWrites(app), []);
    app.controls[setting] = false;
    await app.verify(challenge);
  }
});

test('Firestore outages fail closed for both challenge reservation and consumption', async () => {
  const app = setup();
  app.db.failTransactions = true;
  await assert.rejects(app.request());
  assert.equal(app.messages.length, 0);
  app.db.failTransactions = false;
  const challenge = await app.request();
  app.db.failTransactions = true;
  await assert.rejects(app.verify(challenge));
  assert.deepEqual(accountWrites(app), []);
});

test('failed email dispatch cannot complete registration and a later resend can recover', async () => {
  const app = setup();
  app.controls.failMail = true;
  await assert.rejects(app.request());
  assert.deepEqual(accountWrites(app), []);
  const failedReservation = app.db.snapshot()[0][1];
  assert.equal(failedReservation.status, 'DELIVERY_FAILED');
  assert.equal(failedReservation.codeHash, null);
  app.controls.failMail = false;
  app.advance(MINUTE);
  const challenge = await app.request();
  await app.verify(challenge);
  assert.equal(app.users.size, 1);
  assertNoStoredSecrets(app);
});

test('missing or short OTP secrets fail closed without sending email', async () => {
  for (const secret of ['', 'short']) {
    await assert.rejects(async () => {
      const app = setup({ secret });
      await app.request();
    });
  }
});

test('verified, Google-linked and disabled accounts are never overwritten by signup verification', async () => {
  for (const existing of [
    { uid: 'verified-password', email: EMAIL, emailVerified: true, providerData: [{ providerId: 'password' }] },
    { uid: 'google-only', email: EMAIL, emailVerified: true, providerData: [{ providerId: 'google.com' }] },
    { uid: 'mixed-provider', email: EMAIL, emailVerified: false, providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] },
    { uid: 'disabled-password', email: EMAIL, emailVerified: false, disabled: true, providerData: [{ providerId: 'password' }] },
  ]) {
    const app = setup({ existing });
    const [request] = await Promise.allSettled([app.request()]);
    if (request.status === 'fulfilled') await assert.rejects(app.verify(request.value));
    assert.deepEqual(accountWrites(app), []);
    assert.deepEqual(app.users.get(existing.uid), existing);
  }
});

test('an account verified through another flow while the OTP is pending cannot be overwritten', async () => {
  const app = setup();
  const challenge = await app.request();
  const existing = { uid: 'google-signin', email: EMAIL, emailVerified: true, providerData: [{ providerId: 'google.com' }] };
  app.users.set(existing.uid, structuredClone(existing));
  await assert.rejects(app.verify(challenge));
  assert.deepEqual(accountWrites(app), []);
  assert.deepEqual(app.users.get(existing.uid), existing);
});

test('an unverified password-only account is recovered only after a valid OTP', async () => {
  const existing = { uid: 'old-unverified', email: EMAIL, emailVerified: false, providerData: [{ providerId: 'password' }] };
  const app = setup({ existing });
  const challenge = await app.request();
  await assert.rejects(app.verify(challenge, { code: wrongCode(app.messages[0].code) }));
  assert.deepEqual(accountWrites(app), []);
  await app.verify(challenge);
  assert.equal(app.users.size, 1);
  assert.equal(app.users.get(existing.uid).emailVerified, true);
  assert.equal(app.users.get(existing.uid).password, PASSWORD);
  assert.ok(accountWrites(app).some(call => call.method === 'revokeRefreshTokens' && call.uid === existing.uid));
  assert.equal(accountWrites(app).filter(call => call.method === 'createUser').length, 0);
  assertNoStoredSecrets(app);
});

test('password-account recovery resets the password and revokes old sessions before verification', async () => {
  const existing = { uid: 'old-unverified', email: EMAIL, emailVerified: false, providerData: [{ providerId: 'password' }] };
  const app = setup({ existing });
  const challenge = await app.request();
  await app.verify(challenge);
  const writes = app.authCalls;
  const resetIndex = writes.findIndex(call => call.method === 'updateUser' && call.data.password === PASSWORD);
  const waitIndex = writes.findIndex(call => call.method === 'wait');
  const revocationIndex = writes.findIndex(call => call.method === 'revokeRefreshTokens');
  const verificationIndex = writes.findIndex(call => call.method === 'updateUser' && call.data.emailVerified === true);
  assert.ok(resetIndex >= 0 && resetIndex < waitIndex);
  assert.ok(waitIndex < revocationIndex);
  assert.ok(writes[waitIndex].milliseconds >= 1100, 'recovery must cross a Firebase token timestamp second before revoking');
  assert.equal(writes[resetIndex].data.email, EMAIL);
  assert.equal(writes[resetIndex].data.emailVerified, false);
  assert.ok(revocationIndex < verificationIndex);
  assert.deepEqual(writes[verificationIndex].data, { email: EMAIL, password: PASSWORD, emailVerified: true });
  const finalLookup = writes.findLastIndex(call => call.method === 'getUser' && call.uid === existing.uid);
  assert.ok(finalLookup > revocationIndex && finalLookup < verificationIndex);
});

test('recovery rejects concurrent email, provider, disabled or verified changes during session revocation', async () => {
  for (const mutation of [
    { email: 'other-student@skillbun.tech' },
    { providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] },
    { providerData: [] },
    { disabled: true },
    { emailVerified: true },
  ]) {
    const existing = { uid: 'old-unverified', email: EMAIL, emailVerified: false, providerData: [{ providerId: 'password' }] };
    const app = setup({ existing });
    const challenge = await app.request();
    app.controls.onRevoke = uid => app.users.set(uid, { ...app.users.get(uid), ...mutation });
    await assert.rejects(app.verify(challenge));
    assert.ok(!accountWrites(app).some(call => call.method === 'updateUser' && call.data.emailVerified === true));
    await assert.rejects(app.verify(challenge));
  }
});

test('the final recovery update restores the OTP-bound password after a concurrent password change', async () => {
  const existing = { uid: 'old-unverified', email: EMAIL, emailVerified: false, providerData: [{ providerId: 'password' }] };
  const app = setup({ existing });
  const challenge = await app.request();
  app.controls.onRevoke = uid => app.users.set(uid, { ...app.users.get(uid), password: 'attacker-changed-password' });
  await app.verify(challenge);
  assert.equal(app.users.get(existing.uid).email, EMAIL);
  assert.equal(app.users.get(existing.uid).password, PASSWORD);
  assert.equal(app.users.get(existing.uid).emailVerified, true);
});

test('failed session revocation leaves recovery unverified and its OTP consumed', async () => {
  const existing = { uid: 'old-unverified', email: EMAIL, emailVerified: false, providerData: [{ providerId: 'password' }] };
  const app = setup({ existing });
  const challenge = await app.request();
  app.controls.failRevocation = true;
  await assert.rejects(app.verify(challenge));
  assert.equal(app.users.get(existing.uid).emailVerified, false);
  assert.ok(!accountWrites(app).some(call => call.method === 'updateUser' && call.data.emailVerified === true));
  app.controls.failRevocation = false;
  await assert.rejects(app.verify(challenge));
  app.advance(MINUTE);
  const replacement = await app.request();
  await app.verify(replacement);
  assert.equal(app.users.get(existing.uid).emailVerified, true);
});

test('unavailable account lookup cannot be mistaken for a nonexistent account', async () => {
  const app = setup();
  const challenge = await app.request();
  app.controls.failAuthLookup = true;
  await assert.rejects(app.verify(challenge));
  assert.deepEqual(accountWrites(app), []);
});


test('adult declaration is required before any signup mail or account creation', async () => {
  for (const ageBand of [undefined, 'under-13', '13-17', true]) {
    const app = setup();
    await assert.rejects(app.request({ ageBand }), { code: 'AGE_DECLARATION_REQUIRED' });
    assert.equal(app.messages.length, 0);
    assert.equal(app.authCalls.length, 0);
  }
});
