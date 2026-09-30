import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildContentSecurityPolicy } from '../../utils/server/contentSecurityPolicy.mjs';
import { submitExamAttempt, mintExamCertificate, validateSubmission } from '../../utils/server/certificationState.mjs';

// Serial transaction double: callbacks see committed state; failed writes roll back.
// This exercises business invariants, not the Firestore emulator/rules runtime.
function database(initial) {
  let records = new Map(Object.entries(structuredClone(initial)));
  let queue = Promise.resolve();
  return {
    collection: (name) => ({ doc: (id) => ({ path: `${name}/${id}` }) }),
    read: (path) => records.get(path),
    runTransaction(callback) {
      const task = queue.then(async () => {
        const pending = structuredClone(records);
        const result = await callback({
          get: async (ref) => ({ exists: pending.has(ref.path), data: () => structuredClone(pending.get(ref.path)) }),
          update: (ref, data) => { assert.ok(pending.has(ref.path)); pending.set(ref.path, { ...pending.get(ref.path), ...data }); },
          create: (ref, data) => { assert.ok(!pending.has(ref.path)); pending.set(ref.path, structuredClone(data)); },
        });
        records = pending;
        return result;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
const attemptId = 'att_test_123456';
const attemptPath = `examAttempts/${attemptId}`;
const fixture = () => ({ uid: 'student', roadmapSlug: 'web', roadmapTitle: 'Web Development', certName: 'Student Name', status: 'ACTIVE', expiresAt: new Date(100000), serverQuestions: Array.from({ length: 10 }, () => ({ correctIndex: 2 })) });
const grade = (questions, answers) => {
  const correctCount = questions.filter((q, index) => answers[index] === q.correctIndex).length;
  return { correctCount, score: correctCount * 10, passed: correctCount >= 7 };
};
const submit = (db, args = {}) => submitExamAttempt(db, { uid: 'student', attemptId, answers: Array(10).fill(2), now: 50000, grade, ...args });
const mint = (db, args = {}) => mintExamCertificate(db, { uid: 'student', email: 'student@example.test', attemptId, roadmapSlug: 'web', certId: 'cert-one', ...args });

test('deletion marker transactionally blocks grading and certificate recreation', async () => {
  const db = database({
    'accountDeletions/student': { status: 'pending' },
    [attemptPath]: { ...fixture(), status: 'COMPLETED', passed: true, score: 100 },
  });
  await assert.rejects(mint(db), { code: 'auth/account-deleting' });
  await assert.rejects(submit(db), { code: 'auth/account-deleting' });
  assert.equal(db.read('certificates/cert-one'), undefined);
});

test('Production CSP allows nonced scripts without unsafe inline/eval', () => {
  const policy = buildContentSecurityPolicy({ nonce: 'abc123+/==', production: true });
  const scripts = policy.split('; ').find((directive) => directive.startsWith('script-src '));
  assert.match(scripts, /'nonce-abc123\+\/=='/);
  assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval/);
  assert.match(policy, /object-src blob:/); // Preserve existing locally generated workforce PDF previews.
  assert.throws(() => buildContentSecurityPolicy({ nonce: "x'; default-src *" }));
});
test('Submission rejects malformed IDs, extra answers and coerced values', () => {
  for (const id of ['../other', null, '']) assert.throws(() => validateSubmission(id, {}));
  for (const answers of [null, { 10: 1 }, { 0: '2' }, { 0: 4 }, { score: 100 }]) assert.throws(() => validateSubmission(attemptId, answers));
  validateSubmission(attemptId, { 0: -1 });
});
test('Parallel submissions grade an attempt only once', async () => {
  const db = database({ [attemptPath]: fixture() });
  const results = await Promise.allSettled([submit(db), submit(db)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(db.read(attemptPath).score, 100);
});
test('Ownership and expiry are checked before any submission writes', async () => {
  const db = database({ [attemptPath]: fixture() });
  await assert.rejects(submit(db, { uid: 'intruder' }), { status: 403 });
  await assert.rejects(submit(db, { now: 115001 }), /expired/);
  assert.equal(db.read(attemptPath).status, 'ACTIVE');
});
test('Server grade determines pass/fail, including unanswered questions', async () => {
  const db = database({ [attemptPath]: fixture() });
  const result = await submit(db, { answers: { 0: 2, 1: -1 } });
  assert.equal(result.score, 10);
  assert.equal(result.passed, false);
  await assert.rejects(mint(db), /passing exam/);
});
test('Parallel minting creates only one certificate, bound to attempt identity', async () => {
  const db = database({ [attemptPath]: fixture() });
  await submit(db);
  const results = await Promise.allSettled([mint(db), mint(db, { certId: 'cert-two' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(db.read('certificates/cert-one').name, 'Student Name');
  assert.equal(db.read('certificates/cert-one').roadmapTitle, 'Web Development');
  assert.equal(db.read('certificates/cert-two'), undefined);
});
test('Mint rejects foreign owners, mismatched roadmaps, incomplete exams and invalid grades', async () => {
  for (const patch of [{ status: 'ACTIVE' }, { passed: false }, { score: 101 }, { score: 69 }, { score: '100' }]) {
    const db = database({ [attemptPath]: { ...fixture(), status: 'COMPLETED', passed: true, score: 100, ...patch } });
    await assert.rejects(mint(db));
    assert.equal(db.read('certificates/cert-one'), undefined);
  }
  const db = database({ [attemptPath]: { ...fixture(), status: 'COMPLETED', passed: true, score: 100 } });
  await assert.rejects(mint(db, { uid: 'intruder' }), { status: 403 });
  await assert.rejects(mint(db, { roadmapSlug: 'other' }), /match roadmap/);
});
test('Source guardrails keep answer records private and revocation checks enabled', async () => {
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const section = rules.split('match /examAttempts/')[1]?.split('\n    }')[0];
  assert.match(section, /allow read: if false/);
  const auth = await readFile(new URL('../../utils/server/firebaseAdmin.js', import.meta.url), 'utf8');
  assert.match(auth, /verifyIdToken\(token, true\)/);
});
