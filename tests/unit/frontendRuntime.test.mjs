import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function loadClientModule(path, names, dependencies = {}) {
  const source = (await fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '')
    .replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), `${source}; return { ${names.join(', ')} };`)(...Object.values(dependencies));
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

async function proofClient(kind, { signedIn = true, response } = {}) {
  const localStorage = memoryStorage();
  const makeUser = uid => uid ? { uid, getIdToken: async () => 'firebase-session' } : null;
  let currentUser = makeUser(signedIn ? 'student-a' : null);
  const stateApi = await loadClientModule(`utils/client/${kind}/${kind}State.js`, [
    'createState', 'hasFreshHumanProof', 'persistHumanProof', 'clearHumanProof', 'restoreHumanProof',
  ], { localStorage });
  const requests = [];
  const api = await loadClientModule(`utils/client/${kind}/${kind}Api.js`, [
    'verifyHumanProof', 'refreshHumanProofSession',
  ], {
    ...stateApi,
    localStorage,
    window: {},
    getFirebaseServices: () => ({ auth: { currentUser } }),
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return response || { ok: true, json: async () => ({ humanToken: 'bound-proof', expiresAt: Date.now() + 60_000 }) };
    },
  });
  return {
    api, stateApi, state: stateApi.createState(new AbortController()), requests, localStorage,
    setUser: uid => { currentUser = makeUser(uid); },
  };
}

for (const kind of ['quiz', 'counsellor']) {
  test(`${kind}: proof mint and renewal authenticate the current student`, async () => {
    const { api, stateApi, state, requests } = await proofClient(kind);
    assert.equal(await api.verifyHumanProof(state), true);
    assert.equal(requests[0].headers.Authorization, 'Bearer firebase-session');
    stateApi.persistHumanProof(state, 'stored-proof', Date.now() + 60_000);
    assert.equal(await api.refreshHumanProofSession(state), true);
    assert.equal(requests[1].headers.Authorization, 'Bearer firebase-session');
    assert.equal(requests[1].headers['x-skillbun-human'], 'stored-proof');
    assert.equal(await api.verifyHumanProof(state), true);
    assert.equal(requests.length, 2, 'only a server-validated current-session proof may use the local fast path');
  });

  test(`${kind}: a rejected cached proof prompts fresh CAPTCHA instead of unlocking the session`, async () => {
    const { api, stateApi, state, requests } = await proofClient(kind, { response: { ok: false, status: 403 } });
    stateApi.persistHumanProof(state, 'anonymous-or-other-account-proof', Date.now() + 60_000);
    state.securityConfig.captchaEnabled = true;
    let rendered = 0;
    assert.equal(await api.verifyHumanProof(state, async () => { rendered += 1; }), false);
    assert.equal(state.humanProofToken, '');
    assert.equal(rendered, 1);
    assert.equal(requests.length, 1, 'a rejected cached token must not be silently promoted');
  });

  test(`${kind}: missing login never mints an anonymous proof for an authenticated flow`, async () => {
    const { api, state, requests } = await proofClient(kind, { signedIn: false });
    assert.equal(await api.verifyHumanProof(state), false);
    assert.equal(requests.length, 0);
  });

  for (const method of ['verifyHumanProof', 'refreshHumanProofSession']) {
    for (const nextUid of [null, 'student-b']) {
      test(`${kind}: pending ${method} cannot restore a proof after ${nextUid ? 'account change' : 'signout'}`, async () => {
        const pending = deferred();
        const client = await proofClient(kind, { response: pending.promise });
        if (method === 'refreshHumanProofSession') {
          client.stateApi.persistHumanProof(client.state, 'old-proof', Date.now() + 60_000);
        }
        const verification = client.api[method](client.state);
        await settle();
        client.setUser(nextUid);
        client.localStorage.removeItem('sb_human_proof');
        if (nextUid) client.localStorage.setItem('sb_human_proof', 'new-owner-proof');
        pending.resolve({ ok: true, json: async () => ({ humanToken: 'late-old-proof', expiresAt: Date.now() + 60_000 }) });
        assert.equal(await verification, false);
        assert.equal(client.localStorage.getItem('sb_human_proof'), nextUid ? 'new-owner-proof' : null);
      });
    }
  }
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

async function quizRuntime({ captchaEnabled = false, questionLoader, synchronousCaptcha = false } = {}) {
  const elements = new Map();
  const makeElement = () => ({
    disabled: false, style: {}, dataset: {}, textContent: '',
    addEventListener(type, handler) { this[type] = handler; },
  });
  for (const id of ['startQuizBtn', 'quizRetryBtn', 'quizLoadError', 'quizLoadErrorMessage']) {
    elements.set(id, makeElement());
  }
  const stateApi = await loadClientModule('utils/client/quiz/quizState.js', ['createState'], {});
  const events = [];
  let state;
  let completeCaptcha;
  const { mountQuizRuntime } = await loadClientModule('utils/client/quizRuntime.js', ['mountQuizRuntime'], {
    document: { getElementById: id => elements.get(id) || null },
    createState(controller) { state = stateApi.createState(controller); return state; },
    loadProfile: () => true,
    fetchSecurityConfig: async (current) => { current.securityConfig.captchaEnabled = captchaEnabled; },
    refreshHumanProofSession: async () => false,
    verifyHumanProof: async (current, render) => {
      events.push('verify');
      if (captchaEnabled && !current.captchaToken) { await render(); return false; }
      current.humanProofToken = 'bound-proof';
      return true;
    },
    initCaptcha: async (current, callback) => {
      completeCaptcha = async () => { current.captchaToken = 'challenge'; await callback(); };
      if (synchronousCaptcha) await completeCaptcha();
    },
    fetchQuizQuestions: async current => {
      events.push('questions');
      assert.equal(current.humanProofToken, 'bound-proof');
      return questionLoader ? questionLoader() : { phase1: [{ id: 1 }] };
    },
    setCaptchaStatus: () => {},
    console: { error: () => {} },
  });
  const cleanup = mountQuizRuntime();
  await settle();
  return { elements, events, state, cleanup, completeCaptcha: () => completeCaptcha() };
}

test('quiz waits for CAPTCHA and a loaded question bank before enabling Start', async () => {
  const runtime = await quizRuntime({ captchaEnabled: true });
  assert.equal(runtime.elements.get('startQuizBtn').disabled, true);
  assert.deepEqual(runtime.events, ['verify']);
  await runtime.completeCaptcha();
  assert.deepEqual(runtime.events, ['verify', 'verify', 'questions']);
  assert.equal(runtime.elements.get('startQuizBtn').disabled, false);
  assert.ok(runtime.state.quizQuestions);
  await runtime.completeCaptcha();
  assert.equal(runtime.events.length, 3, 'automatic widget resets must not keep reloading the bank');
  runtime.cleanup();
});

test('quiz retries verification before retrying a failed protected question request', async () => {
  let attempts = 0;
  const runtime = await quizRuntime({ questionLoader: async () => {
    if (++attempts === 1) throw Object.assign(new Error('Proof expired'), { status: 403 });
    return { phase1: [{ id: 1 }] };
  } });
  assert.equal(runtime.elements.get('startQuizBtn').disabled, true);
  assert.equal(runtime.elements.get('quizLoadError').style.display, 'flex');
  await runtime.elements.get('quizRetryBtn').click();
  assert.deepEqual(runtime.events, ['verify', 'questions', 'verify', 'questions']);
  assert.equal(runtime.elements.get('startQuizBtn').disabled, false);
  assert.equal(runtime.elements.get('quizLoadError').style.display, 'none');
  runtime.cleanup();
});

test('quiz handles CAPTCHA completion before the rendering promise has settled', async () => {
  const runtime = await quizRuntime({ captchaEnabled: true, synchronousCaptcha: true });
  assert.equal(runtime.elements.get('startQuizBtn').disabled, false);
  assert.equal(runtime.events.filter(event => event === 'questions').length, 1);
  runtime.cleanup();
});

test('an unmounted quiz cannot enable Start when its old question request resolves', async () => {
  const pending = deferred();
  const runtime = await quizRuntime({ questionLoader: () => pending.promise });
  assert.equal(runtime.elements.get('startQuizBtn').disabled, true);
  runtime.cleanup();
  pending.resolve({ phase1: [{ id: 1 }] });
  await settle();
  assert.equal(runtime.state.quizQuestions, null);
  assert.equal(runtime.elements.get('startQuizBtn').disabled, true);
});

test('dashboard counts only current roadmap nodes and uses their actual XP weights', async () => {
  const { buildDashboardProjects } = await loadClientModule('utils/client/dashboardProgress.js', ['buildDashboardProjects']);
  const catalog = { frontend: { title: 'Frontend', nodes: [{ id: 'intro', exp: 20 }, { id: 'project', exp: 180 }] } };
  assert.deepEqual(buildDashboardProjects([], catalog), [], 'new students must not receive fake active paths');
  const projects = buildDashboardProjects([
    { slug: 'frontend', completedNodeIds: ['intro', 'intro', 'removed-node'] },
    { slug: 'unknown', completedNodeIds: ['intro'] },
  ], catalog);
  assert.deepEqual(projects, [{ slug: 'frontend', label: 'Frontend', done: 1, total: 2, earnedXp: 20 }]);
  assert.equal(buildDashboardProjects([{ slug: 'frontend', completedNodeIds: ['removed-node'] }], catalog).length, 0);
});
