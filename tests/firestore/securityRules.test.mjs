import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, setLogLevel,
} from 'firebase/firestore';

const projectId = 'demo-skillbun-rules';
const emulator = process.env.FIRESTORE_EMULATOR_HOST || '';
// Fail closed before initializing any SDK; these tests must never contact live data.
assert.match(emulator, /^(127\.0\.0\.1|localhost):\d+$/, 'Run npm run test:rules with a local Firestore emulator.');
assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Rules tests require the isolated demo project.');
const [host, port] = emulator.split(':');
let environment;
const verified = (uid, email = `${uid}@example.test`, claims = {}) => environment.authenticatedContext(uid, {
  email, email_verified: true, ...claims,
}).firestore();
const owner = () => verified('student');
const admin = () => verified('admin', 'admin@example.test', { admin: true });
const guest = () => environment.unauthenticatedContext().firestore();
const ref = (db, value) => doc(db, value);
const profile = uid => ({ uid, name: 'Synthetic Student', email: `${uid}@example.test`, ageBand: '18-plus' });

before(async () => {
  setLogLevel('silent');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port), rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const records = {
      'users/student': { ...profile('student'), marketingConsent: false, sentEmailHistory: ['synthetic'], serverAudit: 'immutable' },
      'users/other': profile('other'),
      'users/student/roadmapProgress/fullstack': { slug: 'fullstack', completedNodeIds: ['html'] },
      'users/student/quizAttempts/fullstack': { attempts: 1 },
      'certificates/synthetic-certificate': { uid: 'student', email: 'student@example.test', status: 'ACTIVE' },
      'examAttempts/synthetic-attempt': { uid: 'student', serverQuestions: [{ correctIndex: 1 }] },
      'employees/synthetic-intern': { personal_email: 'intern@example.test', status: 'ACTIVE', portal_access_revoked: false },
      'milestones/synthetic-task': { employee_id: 'synthetic-intern', employee_email: 'intern@example.test', status: 'TODO', deliverable_url: '' },
      'workforce_docs/synthetic-letter': { metadata_snapshot: { personal_email: 'intern@example.test' } },
      'admins/registry@example.test': { active: true },
      'admins/disabled@example.test': { active: false },
    };
    await Promise.all(Object.entries(records).map(([key, value]) => setDoc(ref(db, key), value)));
  });
});

async function seed(key, value) {
  await environment.withSecurityRulesDisabled(context => setDoc(ref(context.firestore(), key), value, { merge: true }));
}

test('verified owner can read and edit profile while preserving server metadata', async () => {
  await assertSucceeds(getDoc(ref(owner(), 'users/student')));
  await assertSucceeds(updateDoc(ref(owner(), 'users/student'), { name: 'Updated synthetic name', updatedAt: serverTimestamp() }));
  const saved = (await getDoc(ref(owner(), 'users/student'))).data();
  assert.equal(saved.name, 'Updated synthetic name');
  assert.equal(saved.serverAudit, 'immutable');
  assert.equal(saved.marketingConsent, false);
});

test('owner cannot change or remove server-owned profile metadata', async () => {
  for (const patch of [{ marketingConsent: true }, { sentEmailHistory: [] }, { serverAudit: 'forged' }, { admin: true }]) {
    await assertFails(updateDoc(ref(owner(), 'users/student'), patch));
  }
  await assertFails(setDoc(ref(owner(), 'users/student'), profile('student')));
});

test('profile creation enforces owner identity and allowed keys', async () => {
  const db = verified('new-student');
  await assertFails(setDoc(ref(db, 'users/new-student'), { ...profile('new-student'), admin: true }));
  await assertFails(setDoc(ref(db, 'users/new-student'), profile('other')));
  await assertSucceeds(setDoc(ref(db, 'users/new-student'), profile('new-student')));
});

test('profile types, lengths and age declaration are validated', async () => {
  for (const patch of [{ name: 42 }, { name: 'x'.repeat(81) }, { ageBand: 'under-18' }, { providers: 'password' }, { providers: Array(21).fill('google') }, { updatedAt: 'now' }]) {
    await assertFails(updateDoc(ref(owner(), 'users/student'), patch));
  }
});

test('guest, unverified and other students cannot read or mutate private profile', async () => {
  for (const db of [guest(), verified('student', 'student@example.test', { email_verified: false }), verified('other')]) {
    await assertFails(getDoc(ref(db, 'users/student')));
    await assertFails(updateDoc(ref(db, 'users/student'), { name: 'forged' }));
    await assertFails(deleteDoc(ref(db, 'users/student')));
  }
});

test('owner progress updates work and invalid schema/size/cross-owner writes fail', async () => {
  const progress = { slug: 'fullstack', completedNodeIds: ['html', 'css'], updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(ref(owner(), 'users/student/roadmapProgress/fullstack'), progress));
  for (const patch of [{ slug: 'other' }, { completedNodeIds: 'html' }, { completedNodeIds: Array(801).fill('html') }, { score: 100 }]) {
    await assertFails(setDoc(ref(owner(), 'users/student/roadmapProgress/fullstack'), { ...progress, ...patch }));
  }
  await assertFails(setDoc(ref(verified('other'), 'users/student/roadmapProgress/fullstack'), progress));
});

test('deletion markers deny stale owner sessions and admin recreation', async () => {
  await seed('accountDeletions/student', { status: 'COMPLETED' });
  for (const key of ['users/student', 'users/student/roadmapProgress/fullstack', 'users/student/quizAttempts/fullstack', 'certificates/synthetic-certificate']) {
    await assertFails(getDoc(ref(owner(), key)));
  }
  for (const db of [owner(), admin()]) {
    await assertFails(setDoc(ref(db, 'users/student'), profile('student')));
    await assertFails(setDoc(ref(db, 'users/student/roadmapProgress/fullstack'), { slug: 'fullstack', completedNodeIds: [] }));
  }
});

test('deletion-marked admins lose privileged reads', async () => {
  await seed('accountDeletions/admin', { status: 'PENDING' });
  await assertFails(getDoc(ref(admin(), 'users/other')));
  await assertFails(getDoc(ref(admin(), 'employees/synthetic-intern')));
});

test('raw certificates are owner/admin only and cannot be written by clients', async () => {
  await assertSucceeds(getDoc(ref(owner(), 'certificates/synthetic-certificate')));
  await assertSucceeds(getDoc(ref(admin(), 'certificates/synthetic-certificate')));
  for (const db of [guest(), verified('other')]) await assertFails(getDoc(ref(db, 'certificates/synthetic-certificate')));
  for (const db of [owner(), admin()]) {
    await assertFails(setDoc(ref(db, 'certificates/forged'), { uid: 'student' }));
    await assertFails(updateDoc(ref(db, 'certificates/synthetic-certificate'), { status: 'ACTIVE' }));
    await assertFails(deleteDoc(ref(db, 'certificates/synthetic-certificate')));
  }
});

test('certificate list requires an owner-constrained query', async () => {
  const db = owner();
  await assertSucceeds(getDocs(query(collection(db, 'certificates'), where('uid', '==', 'student'))));
  await assertFails(getDocs(collection(db, 'certificates')));
  await assertFails(getDocs(query(collection(db, 'certificates'), where('uid', '==', 'other'))));
});

test('exam secrets and server-only state remain inaccessible even to client admins', async () => {
  for (const db of [guest(), owner(), admin()]) {
    for (const key of ['examAttempts/synthetic-attempt', 'emailSignupChallenges/synthetic', 'accountDeletions/student', 'emailTemplateLibrary/welcome/variations/synthetic', 'emailDraftLocks/welcome', 'serverRateLimits/synthetic']) {
      await assertFails(getDoc(ref(db, key)));
      await assertFails(setDoc(ref(db, key), { forged: true }));
    }
  }
});

test('attempt history is readable by owner/admin but always server-written', async () => {
  for (const db of [owner(), admin()]) {
    await assertSucceeds(getDoc(ref(db, 'users/student/quizAttempts/fullstack')));
    await assertFails(setDoc(ref(db, 'users/student/quizAttempts/fullstack'), { attempts: 0 }));
    await assertFails(deleteDoc(ref(db, 'users/student/quizAttempts/fullstack')));
  }
  await assertFails(getDoc(ref(verified('other'), 'users/student/quizAttempts/fullstack')));
});

test('active assigned intern can read workforce records and submit valid milestone update', async () => {
  const db = verified('intern', 'INTERN@example.test');
  for (const key of ['employees/synthetic-intern', 'milestones/synthetic-task', 'workforce_docs/synthetic-letter']) await assertSucceeds(getDoc(ref(db, key)));
  await assertSucceeds(updateDoc(ref(db, 'milestones/synthetic-task'), { status: 'UNDER_REVIEW', deliverable_url: 'https://example.test/work', updated_at: serverTimestamp() }));
});

test('extended intern retains milestone access', async () => {
  await seed('employees/synthetic-intern', { status: 'EXTENDED' });
  await assertSucceeds(getDoc(ref(verified('intern'), 'milestones/synthetic-task')));
});

test('intern cannot reassign, create, delete or alter protected workforce records', async () => {
  const db = verified('intern');
  await assertFails(updateDoc(ref(db, 'milestones/synthetic-task'), { employee_email: 'other@example.test', updated_at: serverTimestamp() }));
  await assertFails(setDoc(ref(db, 'milestones/new-task'), { employee_id: 'synthetic-intern' }));
  await assertFails(deleteDoc(ref(db, 'milestones/synthetic-task')));
  await assertFails(updateDoc(ref(db, 'employees/synthetic-intern'), { status: 'ACTIVE' }));
  await assertFails(setDoc(ref(db, 'workforce_docs/forged-letter'), { metadata_snapshot: { personal_email: 'intern@example.test' } }));
});

test('milestone invalid status, URL, length and non-server timestamps are rejected', async () => {
  const db = verified('intern');
  for (const patch of [{ status: 'APPROVED' }, { status: 1 }, { deliverable_url: 1 }, { deliverable_url: 'javascript:alert(1)' }, { deliverable_url: 'https://example.test/with space' }, { deliverable_url: `https://example.test/${'x'.repeat(500)}` }, { updated_at: Timestamp.fromMillis(0) }, { updated_at: 'now' }]) {
    await assertFails(updateDoc(ref(db, 'milestones/synthetic-task'), { status: 'IN_PROGRESS', updated_at: serverTimestamp(), ...patch }));
  }
});

test('terminated, completed and revoked interns cannot read or update milestones', async () => {
  const db = verified('intern');
  for (const patch of [{ status: 'TERMINATED', portal_access_revoked: false }, { status: 'COMPLETED' }, { status: 'ACTIVE', portal_access_revoked: true }]) {
    await seed('employees/synthetic-intern', patch);
    await assertFails(getDoc(ref(db, 'milestones/synthetic-task')));
    await assertFails(updateDoc(ref(db, 'milestones/synthetic-task'), { status: 'COMPLETED', updated_at: serverTimestamp() }));
  }
});

test('unassigned and unverified interns cannot access workforce records', async () => {
  for (const db of [verified('other'), verified('intern', 'intern@example.test', { email_verified: false }), guest()]) {
    for (const key of ['employees/synthetic-intern', 'milestones/synthetic-task', 'workforce_docs/synthetic-letter']) await assertFails(getDoc(ref(db, key)));
  }
});

test('milestone employee binding cannot be satisfied by stale assignment email alone', async () => {
  await seed('employees/synthetic-intern', { personal_email: 'other@example.test' });
  await assertFails(getDoc(ref(verified('intern'), 'milestones/synthetic-task')));
});

test('verified founder, custom-claim and active registry admins have intended access', async () => {
  for (const db of [verified('founder', 'HARSH@skillbun.tech'), admin(), verified('registered', 'registry@example.test')]) {
    await assertSucceeds(getDoc(ref(db, 'users/other')));
    await assertSucceeds(setDoc(ref(db, 'employees/admin-created'), { personal_email: 'synthetic@example.test', status: 'ACTIVE' }));
  }
});

test('unverified founder/claim and inactive registry identities are not admins', async () => {
  for (const db of [verified('founder', 'harsh@skillbun.tech', { email_verified: false }), verified('unverified-admin', 'admin@example.test', { admin: true, email_verified: false }), verified('disabled', 'disabled@example.test')]) {
    await assertFails(getDoc(ref(db, 'users/other')));
    await assertFails(setDoc(ref(db, 'employees/forged'), { status: 'ACTIVE' }));
  }
});

test('ordinary users cannot self-promote through the admin registry', async () => {
  await assertFails(setDoc(ref(owner(), 'admins/student@example.test'), { active: true }));
  await assertFails(getDocs(collection(owner(), 'admins')));
});
