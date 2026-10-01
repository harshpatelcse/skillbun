import test from 'node:test';
import assert from 'node:assert/strict';
import { startCertificationQuestionTimer } from '../../utils/client/certificationTimer.mjs';
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

test('certification question deadline expires once despite changed answers or delayed browser ticks', () => {
  let clock = 1000;
  let tick;
  let expired = 0;
  let cancellations = 0;
  const countdown = [];
  let latestAnswer = 0;
  const stop = startCertificationQuestionTimer({
    now: () => clock,
    schedule: callback => { tick = callback; return 123; },
    cancel: interval => { assert.equal(interval, 123); cancellations++; },
    onTick: remaining => countdown.push(remaining),
    onExpire: () => { expired++; assert.equal(latestAnswer, 3); },
  });
  clock += 20000;
  tick();
  latestAnswer = 3;
  clock += 10000;
  tick();
  assert.deepEqual(countdown, [25, 15]);
  clock += 30000;
  tick();
  assert.equal(countdown.at(-1), 0);
  assert.equal(expired, 1);
  tick();
  assert.equal(expired, 1);
  assert.equal(cancellations, 1);
  stop();
});

test('leaving a certification question cancels its deadline before it can advance', () => {
  let tick;
  const stop = startCertificationQuestionTimer({
    now: () => 0,
    schedule: callback => { tick = callback; return 1; },
    cancel: () => {},
    onTick: () => assert.fail('Cancelled timer must not update the question'),
    onExpire: () => assert.fail('Cancelled timer must not advance the question'),
  });
  stop();
  tick();
});

test('profile cache migration accepts guests and the same owner, but rejects other accounts', async () => {
  const { isProfileCacheForUser } = await loadClientModule('utils/shared/profileStore.js', ['isProfileCacheForUser']);
  const user = { uid: 'student-a', email: 'student@gmail.com' };
  assert.equal(isProfileCacheForUser({}, user), true);
  assert.equal(isProfileCacheForUser({ uid: 'student-a', email: 'STUDENT@GMAIL.COM' }, user), true);
  assert.equal(isProfileCacheForUser({ email: 'other@gmail.com' }, user), false, 'legacy caches still carry their email owner');
  assert.equal(isProfileCacheForUser({ uid: 'student-b', email: user.email }, user), false, 'a recreated account cannot inherit an older UID cache');
  assert.equal(isProfileCacheForUser({}, null), false);
});

test('cloud profile initialization keeps an existing name and rejects foreign cached profile details', async () => {
  const { isProfileCacheForUser } = await loadClientModule('utils/shared/profileStore.js', ['isProfileCacheForUser']);
  const fullSource = await fs.readFile(new URL('../../app/components/AuthProvider.jsx', import.meta.url), 'utf8');
  const source = fullSource.slice(0, fullSource.indexOf('export function AuthProvider'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '');
  for (const existing of [{ name: 'Cloud Name', degree: 'Cloud Degree' }, null]) {
    const writes = [];
    const dependencies = {
      createContext: () => null,
      isProfileCacheForUser,
      readProfileSnapshot: () => ({ uid: 'other-user', email: 'other@gmail.com', name: 'Other Name', hasName: true, degree: 'Other Degree', year: '4th Year', interest: 'AI' }),
      doc: () => 'users/current-user',
      getDoc: async () => ({ exists: () => Boolean(existing), data: () => existing }),
      serverTimestamp: () => 'server-timestamp',
      setDoc: async (path, data) => writes.push(data),
    };
    const ensureUserProfile = new Function(...Object.keys(dependencies), `${source}; return ensureUserProfile;`)(...Object.values(dependencies));
    await ensureUserProfile({}, { uid: 'current-user', email: 'student@gmail.com', displayName: 'Current Name', providerData: [] });
    assert.equal(writes[0].name, existing ? undefined : 'Current Name');
    assert.equal(writes[0].degree, existing ? undefined : '');
    assert.equal(writes[0].year, existing ? undefined : '');
  }
});

async function settingsPreferences({ publicPage = false, statusResponse, updateResponse } = {}) {
  const fullSource = await fs.readFile(new URL('../../app/settings/page.jsx', import.meta.url), 'utf8');
  const source = fullSource.slice(fullSource.indexOf('function SettingsContent()'), fullSource.indexOf('  // If visitor clicked Unsubscribe link'));
  const { validateEmail } = await loadClientModule('utils/shared/emailValidator.js', ['validateEmail']);
  const values = [];
  const effectSlots = new Map();
  const effects = [];
  const timers = new Map();
  const requests = [];
  let cursor = 0;
  let timerId = 0;
  let userEmail = 'student@gmail.com';
  const localStorage = memoryStorage();
  const dependencies = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = effectSlots.get(index);
      if (previous && deps.every((value, idx) => Object.is(value, previous.deps[idx]))) return;
      effects.push(() => {
        previous?.cleanup?.();
        effectSlots.set(index, { deps, cleanup: callback() });
      });
    },
    useAuth: () => ({ user: { uid: userEmail, email: userEmail }, profile: {}, authLoading: false }),
    useRouter: () => ({ replace() {} }),
    useSearchParams: () => ({ get: key => ({ action: publicPage ? 'unsubscribe' : null, email: publicPage ? 'student@gmail.com' : null })[key] || null }),
    validateEmail,
    localStorage,
    window: {
      setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => timers.delete(id),
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options?.method === 'POST') return updateResponse ? updateResponse.promise : { ok: true, json: async () => ({ success: true, message: 'Preference saved.' }) };
      return statusResponse ? statusResponse.promise : { ok: true, json: async () => ({ unsubscribed: true }) };
    },
  };
  const SettingsContent = new Function(...Object.keys(dependencies), `${source}; return { unsubscribeEmail, hasPreferenceStatus, isUnsubscribed, handleUnsubscribeToggle, setCustomUnsubscribeEmail, unsubStatus }; } return SettingsContent;`)(...Object.values(dependencies));
  function render() {
    cursor = 0;
    const output = SettingsContent();
    while (effects.length) effects.shift()();
    return output;
  }
  const flushTimers = async () => {
    const pending = [...timers.values()].map(callback => callback());
    timers.clear();
    await Promise.all(pending);
    await settle();
  };
  const cleanup = () => { for (const slot of effectSlots.values()) slot.cleanup?.(); };
  return { render, flushTimers, requests, cleanup, localStorage, setUserEmail: email => { userEmail = email; } };
}

test('settings loads the signed-in email preference and can re-enable an existing unsubscribe', async () => {
  const runtime = await settingsPreferences();
  try {
    runtime.render();
    await runtime.flushTimers();
    const page = runtime.render();
    assert.equal(page.isUnsubscribed, true);
    assert.match(runtime.requests[0].url, /email=student%40gmail\.com/);
    await page.handleUnsubscribeToggle('resubscribe');
    assert.deepEqual(JSON.parse(runtime.requests.at(-1).options.body), { email: 'student@gmail.com', action: 'resubscribe' });
    assert.equal(runtime.render().isUnsubscribed, false);
  } finally { runtime.cleanup(); }
});

test('public email preferences can clear their address without silently updating the original email', async () => {
  const runtime = await settingsPreferences({ publicPage: true });
  try {
    const page = runtime.render();
    page.setCustomUnsubscribeEmail('');
    const cleared = runtime.render();
    assert.equal(cleared.unsubscribeEmail, '');
    await cleared.handleUnsubscribeToggle();
    assert.equal(runtime.requests.length, 0);
    assert.match(runtime.render().unsubStatus, /enter your email/i);
  } finally { runtime.cleanup(); }
});

test('a late preference status lookup cannot overwrite a confirmed preference update', async () => {
  const statusResponse = deferred();
  const runtime = await settingsPreferences({ statusResponse });
  try {
    const page = runtime.render();
    const lookup = runtime.flushTimers();
    await settle();
    await page.handleUnsubscribeToggle('resubscribe');
    statusResponse.resolve({ ok: true, json: async () => ({ unsubscribed: true }) });
    await lookup;
    assert.equal(runtime.render().isUnsubscribed, false);
  } finally { runtime.cleanup(); }
});

for (const change of ['account switch', 'unmount']) {
  test(`a late email preference update cannot restore the old session flag after ${change}`, async () => {
    const updateResponse = deferred();
    const runtime = await settingsPreferences({ updateResponse });
    try {
      const page = runtime.render();
      const update = page.handleUnsubscribeToggle('unsubscribe');
      await settle();
      if (change === 'account switch') {
        runtime.setUserEmail('other@gmail.com');
        runtime.render();
      } else runtime.cleanup();
      runtime.localStorage.setItem('sb_email_unsubscribed', 'new-session-value');
      updateResponse.resolve({ ok: true, json: async () => ({ success: true, message: 'Old account updated.' }) });
      await update;
      assert.equal(runtime.localStorage.getItem('sb_email_unsubscribed'), 'new-session-value');
      assert.notEqual(runtime.render().unsubStatus, 'Old account updated.');
    } finally { runtime.cleanup(); }
  });
}

async function authSaveActions() {
  const fullSource = await fs.readFile(new URL('../../app/components/AuthProvider.jsx', import.meta.url), 'utf8');
  const source = fullSource.slice(fullSource.indexOf('  const saveProfile = useCallback'), fullSource.indexOf('  const signOutUser = useCallback'));
  const pending = deferred();
  const localWrites = [];
  const cloudWrites = [];
  const services = { configured: true, db: {}, auth: { currentUser: { uid: 'student-a', email: 'student@gmail.com', emailVerified: true } } };
  const dependencies = {
    services,
    useCallback: fn => fn,
    assertVerifiedEmail: () => {},
    getProviders: () => ['password'],
    fallbackNameFromUser: () => 'Student',
    serverTimestamp: () => 'server-timestamp',
    doc: (...args) => args.slice(1).join('/'),
    setDoc: async (path, data) => { cloudWrites.push({ path, data }); await pending.promise; },
    saveStoredProfile: data => localWrites.push(data),
    saveStoredRoadmapProgress: (slug, ids) => localWrites.push({ slug, ids }),
  };
  const actions = new Function(...Object.keys(dependencies), `${source}; return { saveProfile, saveRoadmapProgress };`)(...Object.values(dependencies));
  return { actions, pending, services, localWrites, cloudWrites };
}

for (const nextUid of [null, 'student-b']) {
  for (const action of ['saveProfile', 'saveRoadmapProgress']) {
    test(`auth: pending ${action} cannot restore cache after ${nextUid ? 'account switch' : 'signout'}`, async () => {
      const runtime = await authSaveActions();
      const save = action === 'saveProfile'
        ? runtime.actions[action]({ name: 'Old Student', degree: 'BCA', year: '1st Year', interest: '' })
        : runtime.actions[action]('frontend', ['intro']);
      assert.match(runtime.cloudWrites[0].path, /^users\/student-a/);
      runtime.services.auth.currentUser = nextUid ? { uid: nextUid } : null;
      runtime.pending.resolve();
      await save;
      assert.deepEqual(runtime.localWrites, []);
    });
  }
}

async function counsellorRuntime({ proof, response } = {}) {
  const elements = new Map();
  const messages = [];
  const makeElement = () => ({
    value: '', disabled: false, style: {}, innerHTML: '', scrollHeight: 52,
    addEventListener(type, handler) { this[type] = handler; },
    dispatchEvent() {}, appendChild() {}, remove() {},
  });
  for (const id of ['chatInput', 'sendBtn', 'chatMessages', 'clearChatBtn']) elements.set(id, makeElement());
  Object.defineProperty(elements.get('chatMessages'), 'innerHTML', { set() { messages.length = 0; } });
  const stateApi = await loadClientModule('utils/client/counsellor/counsellorState.js', ['createState']);
  let state;
  let proofCalls = 0;
  let requestCalls = 0;
  const dependencies = {
    window: { location: { search: '' } },
    document: { createElement: makeElement },
    getEl: id => elements.get(id) || null,
    createState: controller => { state = stateApi.createState(controller); return state; },
    loadProfile: current => { current.userProfile = { name: 'Student', degree: 'BCA', year: '1st Year' }; return true; },
    updateUsageLimitCard() {},
    checkRateLimit: () => ({ allowed: true }),
    incrementRateLimit() {},
    fetchSecurityConfig: async () => {},
    refreshHumanProofSession: async () => true,
    hasFreshHumanProof: () => true,
    toggleSecurityBanner() {}, setCaptchaStatus() {},
    getPersonalizedInitialChips: () => [], renderSuggestionChips() {}, hideSuggestionsSection() {},
    getFollowUpSuggestions: () => [],
    verifyHumanProof: async () => { proofCalls += 1; return proof ? proof.promise : true; },
    fetchCounsellorPayload: async () => {
      requestCalls += 1;
      return response ? response.promise : { candidates: [{ content: { parts: [{ text: 'Use the frontend roadmap.' }] } }] };
    },
    appendMessage: (current, role, text) => messages.push({ role, text }),
    appendStreamingMessage: (current, role, text, callback) => { messages.push({ role, text }); callback(); },
    getFriendlyAiErrorMessage: error => error.message,
    posthog: { capture() {} },
  };
  const { mountCounsellorRuntime } = await loadClientModule('utils/client/counsellorRuntime.js', ['mountCounsellorRuntime'], dependencies);
  const cleanup = mountCounsellorRuntime();
  await settle();
  return { elements, state, messages, cleanup, proofCalls: () => proofCalls, requestCalls: () => requestCalls };
}

test('counsellor blocks duplicate keyboard sends while human verification is pending', async () => {
  const proof = deferred();
  const runtime = await counsellorRuntime({ proof });
  try {
    runtime.elements.get('chatInput').value = 'How do I start frontend?';
    const first = runtime.elements.get('sendBtn').click();
    await runtime.elements.get('sendBtn').click();
    assert.equal(runtime.proofCalls(), 1);
    proof.resolve(true);
    await first;
    assert.equal(runtime.requestCalls(), 1);
    assert.equal(runtime.messages.length, 2);
    assert.equal(runtime.state.isSending, false);
  } finally { runtime.cleanup(); }
});

for (const action of ['clear', 'unmount']) {
  test(`counsellor ignores an old AI response after ${action}`, async () => {
    const response = deferred();
    const runtime = await counsellorRuntime({ response });
    try {
      runtime.elements.get('chatInput').value = 'How do I start frontend?';
      const send = runtime.elements.get('sendBtn').click();
      await settle();
      assert.equal(runtime.requestCalls(), 1);
      if (action === 'clear') runtime.elements.get('clearChatBtn').click();
      else runtime.cleanup();
      const historyLength = runtime.state.conversationHistory.length;
      const visibleLength = runtime.messages.length;
      response.resolve({ candidates: [{ content: { parts: [{ text: 'Late response from the old chat.' }] } }] });
      await send;
      assert.equal(runtime.state.conversationHistory.length, historyLength);
      assert.equal(runtime.messages.length, visibleLength);
    } finally { runtime.cleanup(); }
  });
}
