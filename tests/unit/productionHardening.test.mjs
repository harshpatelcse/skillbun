import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildContentSecurityPolicy } from '../../utils/server/contentSecurityPolicy.mjs';
import { submitExamAttempt, mintExamCertificate, validateSubmission } from '../../utils/server/certificationState.mjs';

// Serial transaction double: callbacks see committed state; failed writes roll back.
// This exercises business invariants, not the Firestore emulator/rules runtime.
function database(initial) {
  let records = new Map(Object.entries(structuredClone(initial)));
  let queue = Promise.resolve();
  const query = (name, filters = [], cap = Infinity) => ({ name, filters, cap,
    where: (field, operator, value) => { assert.equal(operator, '=='); return query(name, [...filters, [field, value]], cap); },
    limit: value => query(name, filters, value),
  });
  const collection = (name) => ({ ...query(name), doc: (id) => ({ path: `${name}/${id}`, collection: child => collection(`${name}/${id}/${child}`) }) });
  return {
    collection,
    read: (path) => records.get(path),
    runTransaction(callback) {
      const task = queue.then(async () => {
        const pending = structuredClone(records);
        const result = await callback({
          get: async (ref) => {
            if (ref.path) return { exists: pending.has(ref.path), data: () => structuredClone(pending.get(ref.path)) };
            const docs = [...pending].filter(([path, data]) => path.startsWith(ref.name + '/') && ref.filters.every(([field, value]) => data[field] === value))
              .slice(0, ref.cap).map(([path, data]) => ({ id: path.split('/').at(-1), data: () => structuredClone(data) }));
            return { empty: docs.length === 0, docs };
          },
          update: (ref, data) => { assert.ok(pending.has(ref.path)); pending.set(ref.path, { ...pending.get(ref.path), ...data }); },
          create: (ref, data) => { assert.ok(!pending.has(ref.path)); pending.set(ref.path, structuredClone(data)); },
          set: (ref, data, options) => { pending.set(ref.path, options?.merge ? { ...pending.get(ref.path), ...structuredClone(data) } : structuredClone(data)); },
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
test('only failed grades advance the study cooldown while start quota history is preserved', async () => {
  const historyPath = 'users/student/quizAttempts/web';
  const db = database({ [attemptPath]: fixture(), [historyPath]: { attempts: [100, 200], lastAttemptAt: 200 } });
  await submit(db, { answers: {} });
  assert.equal(db.read(historyPath).consecutiveFailures, 1);
  assert.equal(db.read(historyPath).cooldownUntil, null);
  assert.deepEqual(db.read(historyPath).attempts, [100, 200]);
  assert.equal(db.read(historyPath).lastAttemptAt, 200);

  const second = database({ [attemptPath]: fixture(), [historyPath]: db.read(historyPath) });
  await submit(second, { answers: {}, now: 60000 });
  assert.equal(second.read(historyPath).consecutiveFailures, 2);
  assert.equal(second.read(historyPath).cooldownUntil, 60000 + 3600000);
});
test('a passing grade or a served study cooldown resets consecutive failures', async () => {
  const historyPath = 'users/student/quizAttempts/web';
  const passed = database({ [attemptPath]: fixture(), [historyPath]: { consecutiveFailures: 1, cooldownUntil: null } });
  await submit(passed);
  assert.equal(passed.read(historyPath).consecutiveFailures, 0);
  assert.equal(passed.read(historyPath).cooldownUntil, null);

  const cooled = database({ [attemptPath]: fixture(), [historyPath]: { consecutiveFailures: 2, cooldownUntil: 40000 } });
  await submit(cooled, { answers: {} });
  assert.equal(cooled.read(historyPath).consecutiveFailures, 1);
  assert.equal(cooled.read(historyPath).cooldownUntil, null);
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

test('exam eligibility separates start quota from actual failed-grade cooldowns', async () => {
  const source = (await readFile(new URL('../../utils/server/certifyEngine.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
  const now = 10_000_000;
  let history = { attempts: [now - 1000, now - 2000], lastAttemptAt: now - 1000 };
  const snapshot = (path) => path === 'certificates' ? { empty: true, docs: [] }
    : path.endsWith('/roadmapProgress/web') ? { exists: true, data: () => ({ completedNodeIds: ['a', 'b', 'c'] }) }
    : { exists: true, data: () => history };
  const collection = name => ({
    where: () => collection(name), limit: () => collection(name), get: async () => snapshot(name),
    doc: id => ({ path: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`), collection: child => collection(`${name}/${id}/${child}`) }),
  });
  const eligibility = vm.runInNewContext(`${source}; verifyExamEligibility;`, {
    Date: class extends Date { static now() { return now; } },
    process: { env: { NODE_ENV: 'production' } }, getFirebaseAdminFirestore: () => ({ collection }),
  });
  const check = () => eligibility({ uid: 'student', slug: 'web', roadmapData: { format: 'tree', tree: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id })) } });
  assert.equal((await check()).eligible, true); // Two starts alone are not two failures.
  history = { ...history, consecutiveFailures: 1, cooldownUntil: null };
  assert.equal((await check()).eligible, true);
  history = { ...history, consecutiveFailures: 2, cooldownUntil: now + 3600000 };
  assert.equal((await check()).reason, 'COOLDOWN_ACTIVE');
  assert.equal((await check()).cooldownRemaining, 3600);
  history = { ...history, cooldownUntil: now - 1 };
  assert.equal((await check()).eligible, true);
  history = { ...history, attempts: [now - 1000, now - 2000, now - 3000] };
  assert.equal((await check()).reason, 'DAILY_LIMIT_EXCEEDED');
});

test('certification start rejects missing or foreign human proof before reading question banks', async () => {
  const source = (await readFile(new URL('../../app/api/certify/start/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
  let bankReads = 0;
  let databaseReads = 0;
  const start = vm.runInNewContext(`${source}; POST;`, {
    console, NextResponse: { json: Response.json },
    getFirebaseAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'student', email: 'student@example.test' }) }),
    getClientAddress: () => '127.0.0.1',
    verifyHumanProofToken: token => ({ valid: token === 'student-proof', payload: { uid: token === 'student-proof' ? 'student' : 'other' } }),
    isHumanProofBoundTo: (proof, uid) => proof.valid && proof.payload.uid === uid,
    getFirebaseAdminFirestore: () => { databaseReads++; return null; },
    loadRoadmapData: async () => { bankReads++; return null; },
    checkServerRateLimit: async () => ({ allowed: true }),
    validateSchema: () => ({ isValid: true, value: { roadmapSlug: 'web', certName: 'Student Name' } }),
  });
  const call = human => start(new Request('https://skillbun.test/api/certify/start', {
    method: 'POST', headers: { Authorization: 'Bearer student-token', 'Content-Type': 'application/json', 'x-skillbun-human': human },
    body: JSON.stringify({ roadmapSlug: 'web', certName: 'Student Name' }),
  }));
  for (const proof of ['', 'other-proof', 'expired-proof']) assert.equal((await call(proof)).status, 403);
  assert.equal(bankReads, 0);
  assert.equal(databaseReads, 0);
  assert.equal((await call('student-proof')).status, 404);
  assert.equal(bankReads, 1);
});

test('parallel exam starts reserve only one active attempt, while expired attempts remain replaceable', async () => {
  const strip = source => source.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
  const [startSource, engineSource] = await Promise.all([
    readFile(new URL('../../app/api/certify/start/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../../utils/server/certifyEngine.js', import.meta.url), 'utf8'),
  ]);
  const now = 10_000_000;
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  const roadmap = { title: 'Web Development', format: 'tree', tree: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id })) };
  const setup = initial => {
    const db = database({
      'users/student/roadmapProgress/web': { completedNodeIds: ['a', 'b', 'c'] },
      'users/student/quizAttempts/web': { attempts: [], consecutiveFailures: 1, cooldownUntil: null },
      ...initial,
    });
    let sequence = 0;
    const verifyExamEligibility = vm.runInNewContext(`${strip(engineSource)}; verifyExamEligibility;`, {
      Date: FixedDate, process: { env: { NODE_ENV: 'production' } }, getFirebaseAdminFirestore: () => db,
    });
    const start = vm.runInNewContext(`${strip(startSource)}; POST;`, {
      Date: FixedDate, console, NextResponse: { json: Response.json },
      assertAccountActive: async () => {}, getFirebaseAdminFirestore: () => db, verifyExamEligibility,
      getFirebaseAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'student', email: 'student@example.test' }) }),
      getClientAddress: () => '127.0.0.1', verifyHumanProofToken: () => ({ valid: true }), isHumanProofBoundTo: () => true,
      checkServerRateLimit: async () => ({ allowed: true }),
      validateSchema: () => ({ isValid: true, value: { roadmapSlug: 'web', certName: 'Student Name' } }),
      loadRoadmapData: async () => roadmap, loadQuizBank: async () => [],
      selectAndPrepareExamQuestions: () => ({ serverQuestions: fixture().serverQuestions, clientQuestions: Array(10).fill({ question: 'Synthetic question', options: ['a', 'b', 'c', 'd'] }) }),
      generateAttemptId: () => `att_parallel_${++sequence}`,
    });
    const call = () => start(new Request('https://skillbun.test/api/certify/start', {
      method: 'POST', headers: { Authorization: 'Bearer synthetic-token', 'x-skillbun-human': 'synthetic-proof' }, body: '{}',
    }));
    return { db, call };
  };
  const parallel = setup({});
  const results = await Promise.all([parallel.call(), parallel.call(), parallel.call()]);
  assert.equal(results.filter(result => result.status === 200).length, 1);
  for (const result of results.filter(result => result.status === 403)) assert.equal((await result.json()).reason, 'ATTEMPT_IN_PROGRESS');
  assert.equal(parallel.db.read('users/student/quizAttempts/web').attempts.length, 1);
  assert.equal(parallel.db.read('users/student/quizAttempts/web').consecutiveFailures, 1);
  assert.equal(parallel.db.read('examAttempts/att_parallel_2'), undefined);
  assert.equal(parallel.db.read('examAttempts/att_parallel_3'), undefined);

  const expired = setup({ 'examAttempts/legacy': { ...fixture(), expiresAt: new Date(now - 15001) } });
  assert.equal((await expired.call()).status, 200);
  const grace = setup({ 'examAttempts/legacy': { ...fixture(), expiresAt: new Date(now - 10000) } });
  assert.equal((await grace.call()).status, 403);
  assert.equal(grace.db.read('users/student/quizAttempts/web').attempts.length, 0);
});
