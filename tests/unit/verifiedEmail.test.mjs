import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertVerifiedSignup } from '../../firebase-functions/signupPolicy.mjs';
import { assertAccountActive } from '../../utils/server/accountLifecycle.mjs';

// Execute the actual Admin wrapper with explicit SDK doubles. These tests never
// initialize Firebase, create an account, send an email, or contact production.
async function loadAdminWrapper(sdk, { configured = true, deleting = false, marker = {} } = {}) {
  const app = { name: 'skillbun-admin' };
  const deps = {
    cert: () => { throw new Error('Unexpected credential initialization'); },
    getApps: () => configured ? [app] : [],
    initializeApp: () => { throw new Error('Unexpected Firebase initialization'); },
    getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: deleting, data: () => marker }) }) }) }),
    assertAccountActive,
    getFirebaseAdminClientEmail: () => '',
    getFirebaseAdminPrivateKey: () => '',
    getFirebaseAdminProjectId: () => '',
    loadFirebaseAuth: async () => ({ getAuth: () => sdk }),
  };
  const source = (await readFile(new URL('../../utils/server/firebaseAdmin.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll("await import('firebase-admin/auth')", 'await loadFirebaseAuth()')
    .replaceAll('export function ', 'function ');
  return new Function(...Object.keys(deps), `${source}; return getFirebaseAdminAuth();`)(...Object.values(deps));
}

test('API authentication requires authoritative verified-email claim and revocation check', async () => {
  const verified = { uid: 'verified-student', email_verified: true };
  const calls = [];
  const auth = await loadAdminWrapper({
    verifyIdToken: async (...args) => { calls.push(args); return verified; },
  });
  assert.equal(await auth.verifyIdToken('signed-token'), verified);
  assert.deepEqual(calls, [['signed-token', true]]);
});

test('unverified, missing and forged truthy verification claims cannot use authenticated APIs', async () => {
  for (const email_verified of [false, undefined, null, 'true', 1]) {
    const auth = await loadAdminWrapper({ verifyIdToken: async () => ({ uid: 'unverified', email_verified }) });
    await assert.rejects(auth.verifyIdToken('signed-token'), { code: 'auth/email-not-verified' });
  }
});

test('revoked sessions still fail before application verification', async () => {
  const auth = await loadAdminWrapper({ verifyIdToken: async () => {
    const error = new Error('Revoked'); error.code = 'auth/id-token-revoked'; throw error;
  } });
  await assert.rejects(auth.verifyIdToken('revoked-token'), { code: 'auth/id-token-revoked' });
});

test('a deletion marker blocks ordinary API access but allows the authenticated erasure endpoint', async () => {
  const verified = { uid: 'student', email_verified: true };
  const auth = await loadAdminWrapper({ verifyIdToken: async () => verified }, { deleting: true });
  await assert.rejects(auth.verifyIdToken('token'), { code: 'auth/account-deleting' });
  assert.equal(await auth.verifyIdToken('token', { allowDeleting: true }), verified);
});

test('only a missing Auth identity in the final deletion phase can recover a lost completion response', async () => {
  for (const marker of [{ phase: 'auth', status: 'pending' }, { status: 'complete' }]) {
    const calls = [];
    const absent = Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
    const verified = { uid: 'student', email_verified: true };
    const auth = await loadAdminWrapper({
      verifyIdToken: async (token, checkRevoked) => { calls.push(checkRevoked); if (checkRevoked) throw absent; return verified; },
      getUser: async () => { throw absent; },
    }, { deleting: true, marker });
    assert.equal(await auth.verifyIdToken('token', { allowDeleting: true }), verified);
    assert.deepEqual(calls, [true, false]);
    await assert.rejects(auth.verifyIdToken('token'), { code: 'auth/user-not-found' });
  }
});

test('resume authentication never admits a revoked, recreated, or unrelated missing account', async () => {
  for (const state of [
    { code: 'auth/id-token-revoked', deleting: true, marker: { phase: 'auth' } },
    { code: 'auth/user-not-found', deleting: false, marker: {} },
    { code: 'auth/user-not-found', deleting: true, marker: { phase: 'exams' } },
    { code: 'auth/user-not-found', deleting: true, marker: { phase: 'auth' }, exists: true },
  ]) {
    const failure = Object.assign(new Error('denied'), { code: state.code });
    const auth = await loadAdminWrapper({
      verifyIdToken: async (token, checkRevoked) => { if (checkRevoked) throw failure; return { uid: 'student', email_verified: true }; },
      getUser: async () => { if (!state.exists) throw failure; return { uid: 'student' }; },
    }, state);
    await assert.rejects(auth.verifyIdToken('token', { allowDeleting: true }), { code: state.code });
  }
});

test('Admin account creation and updates pass validated engine input to Firebase', async () => {
  const calls = [];
  const auth = await loadAdminWrapper({
    createUser: async (properties) => { calls.push(['create', properties]); return { uid: properties.uid }; },
    updateUser: async (uid, properties) => { calls.push(['update', uid, properties]); return { uid }; },
  });
  const properties = { uid: 'otp-verified-user', email: 'student@example.test', password: 'local-test-password', emailVerified: true };
  assert.deepEqual(await auth.createUser(properties), { uid: properties.uid });
  assert.deepEqual(await auth.updateUser(properties.uid, { emailVerified: true }), { uid: properties.uid });
  assert.deepEqual(calls, [['create', properties], ['update', properties.uid, { emailVerified: true }]]);
});

test('Admin provisioning fails closed without server credentials', async () => {
  const auth = await loadAdminWrapper({}, { configured: false });
  await assert.rejects(auth.createUser({}), /service credentials required/);
  await assert.rejects(auth.updateUser('uid', {}), /service credentials required/);
  await assert.rejects(auth.verifyIdToken('signed-token'), /service credentials required/);
});

test('registration hook blocks unverified email/password creation through public Firebase APIs', () => {
  for (const emailVerified of [false, undefined, null, 'true', 1]) {
    assert.throws(() => assertVerifiedSignup({ email: 'student@example.test', emailVerified }), {
      code: 'auth/email-not-verified',
    });
  }
});

test('registration hook preserves verified Google and server OTP-created accounts', () => {
  assert.doesNotThrow(() => assertVerifiedSignup({ email: 'student@example.test', emailVerified: true, providerData: [{ providerId: 'google.com' }] }));
  assert.doesNotThrow(() => assertVerifiedSignup({ email: 'student@example.test', emailVerified: true, providerData: [{ providerId: 'password' }] }));
});

test('Firestore source guards require verified identities, private raw certificates and server-only exams', async () => {
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /function signedInAs\(uid\)\s*\{\s*return signedIn\(\) && request\.auth\.uid == uid;/);
  assert.match(rules, /function signedIn\(\)\s*\{\s*return request\.auth != null && request\.auth\.token\.get\('email_verified', false\) == true &&/);
  assert.match(rules, /!exists\(\/databases\/\$\(database\)\/documents\/accountDeletions\/\$\(request\.auth\.uid\)\)/);
  assert.match(rules, /allow get: if isAdmin\(\) \|\| signedInAs\(resource\.data\.uid\);/);
  assert.doesNotMatch(rules, /allow get: if true;/);
  const userRules = rules.split('match /users/{uid} {')[1].split('match /roadmapProgress/{slug} {')[0];
  assert.match(userRules, /allow create: if !exists\(\/databases\/\$\(database\)\/documents\/accountDeletions\/\$\(uid\)\) &&\s*\(\(signedInAs\(uid\) && request\.resource\.data\.keys\(\)\.hasOnly\(userProfileKeys\(\)\) && validUserProfile\(uid\)\) \|\| isAdmin\(\)\)/);
  assert.match(userRules, /allow update: if !exists\(\/databases\/\$\(database\)\/documents\/accountDeletions\/\$\(uid\)\) &&\s*\(\(signedInAs\(uid\) && request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(userProfileKeys\(\)\) && validUserProfile\(uid\)\) \|\| isAdmin\(\)\)/);
  assert.equal((rules.match(/allow create, update: if !exists\(\/databases\/\$\(database\)\/documents\/accountDeletions\/\$\(uid\)\)/g) || []).length, 1);
  assert.match(rules, /match \/examAttempts\/\{attemptId\}\s*\{\s*allow read: if false;/);
  assert.match(rules, /match \/emailSignupChallenges\/\{challengeId\}\s*\{\s*allow read, write: if false;/);
});
