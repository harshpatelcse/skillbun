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

test('a server-provided question deadline cannot be extended by restarting the browser timer', () => {
  let tick;
  let clock = 30000;
  let remaining;
  let expired = 0;
  startCertificationQuestionTimer({ deadlineAt: 45000, now: () => clock,
    schedule: callback => { tick = callback; return 1; }, cancel: () => {},
    onTick: value => { remaining = value; }, onExpire: () => { expired++; },
  });
  tick();
  assert.equal(remaining, 15);
  clock = 46000;
  tick();
  assert.equal(remaining, 0);
  assert.equal(expired, 1);
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

async function settingsPreferences({ publicPage = false, statusResponse, statusResponses, updateResponse, tokenResponse } = {}) {
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
  let preferenceUser = { uid: userEmail, email: userEmail, getIdToken: async () => tokenResponse ? tokenResponse.promise : 'synthetic-preference-token' };
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
    useAuth: () => ({ user: preferenceUser, profile: {}, authLoading: false }),
    useRouter: () => ({ replace() {} }),
    useSearchParams: () => ({ get: key => ({ action: publicPage ? 'unsubscribe' : null, email: publicPage ? 'student@gmail.com' : null })[key] || null }),
    validateEmail,
    localStorage,
    window: {
      setTimeout: (callback, delay = 0) => { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout: id => timers.delete(id),
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options?.method === 'POST') return updateResponse ? updateResponse.promise : { ok: true, json: async () => ({ success: true, message: 'Preference saved.' }) };
      if (statusResponses) return statusResponses.shift();
      return statusResponse ? statusResponse.promise : { ok: true, json: async () => ({ unsubscribed: true }) };
    },
  };
  const SettingsContent = new Function(...Object.keys(dependencies), `${source}; return { unsubscribeEmail, hasPreferenceStatus, isUnsubscribed, handleUnsubscribeToggle, handlePreferenceAction, preferenceActionLabel, preferenceActionDisabled, preferenceChecking, preferenceLookupFailed, retryPreferenceCheck, setCustomUnsubscribeEmail, unsubStatus }; } return SettingsContent;`)(...Object.values(dependencies));
  function render() {
    cursor = 0;
    const output = SettingsContent();
    while (effects.length) effects.shift()();
    return output;
  }
  const flushTimers = async () => {
    const ready = [...timers.entries()].filter(([, timer]) => timer.delay <= 400);
    ready.forEach(([id]) => timers.delete(id));
    const pending = ready.map(([, timer]) => timer.callback());
    await Promise.all(pending);
    await settle();
  };
  const expireRequestDeadline = async () => {
    const ready = [...timers.entries()].filter(([, timer]) => timer.delay === 10_000);
    assert.equal(ready.length, 1, 'a status lookup has one bounded deadline');
    ready.forEach(([id, timer]) => { timers.delete(id); timer.callback(); });
    await settle();
  };
  const cleanup = () => { for (const slot of effectSlots.values()) slot.cleanup?.(); };
  return { render, flushTimers, expireRequestDeadline, requests, cleanup, localStorage, setUserEmail: email => { userEmail = email; preferenceUser = { uid: email, email, getIdToken: async () => 'synthetic-preference-token' }; } };
}

test('settings ends a failed lookup and retries its status without changing marketing preferences', async () => {
  const failedResponse = deferred();
  const retriedResponse = deferred();
  const runtime = await settingsPreferences({ statusResponses: [
    failedResponse.promise,
    retriedResponse.promise,
  ] });
  try {
    runtime.render();
    const lookup = runtime.flushTimers();
    await settle();
    assert.equal(runtime.render().preferenceChecking, true);
    assert.equal(runtime.render().preferenceActionDisabled, true);
    failedResponse.resolve({ ok: false, status: 403, json: async () => ({ error: { message: 'This preference could not be confirmed.' } }) });
    await lookup;
    const failed = runtime.render();
    assert.equal(failed.hasPreferenceStatus, false);
    assert.equal(failed.preferenceChecking, false);
    assert.equal(failed.preferenceActionDisabled, false);
    assert.equal(failed.preferenceActionLabel, 'Retry preference check');
    assert.equal(failed.unsubStatus, 'This preference could not be confirmed.');
    await failed.handlePreferenceAction();
    runtime.render();
    const retry = runtime.flushTimers();
    await settle();
    assert.equal(runtime.render().preferenceChecking, true);
    retriedResponse.resolve({ ok: true, json: async () => ({ unsubscribed: false }) });
    await retry;
    const confirmed = runtime.render();
    assert.equal(confirmed.hasPreferenceStatus, true);
    assert.equal(confirmed.isUnsubscribed, false);
    assert.equal(confirmed.preferenceActionLabel, 'Unsubscribe');
    assert.equal(confirmed.unsubStatus, '');
    assert.equal(runtime.requests.length, 2);
    assert.equal(runtime.requests.every(request => request.options.method !== 'POST'), true);
    assert.equal(runtime.localStorage.getItem('sb_email_unsubscribed'), null);
  } finally { runtime.cleanup(); }
});

test('a stalled preference lookup times out and a retry can recover without accepting its late result', async () => {
  const oldStatus = deferred();
  const runtime = await settingsPreferences({ statusResponses: [oldStatus.promise, { ok: true, json: async () => ({ unsubscribed: false }) }] });
  try {
    runtime.render();
    const oldLookup = runtime.flushTimers();
    await settle();
    await runtime.expireRequestDeadline();
    const failed = runtime.render();
    assert.equal(failed.preferenceChecking, false);
    assert.equal(failed.preferenceActionDisabled, false);
    assert.match(failed.unsubStatus, /timed out/i);
    assert.equal(runtime.requests[0].options.signal.aborted, true);
    await failed.handlePreferenceAction();
    runtime.render();
    await runtime.flushTimers();
    assert.equal(runtime.render().isUnsubscribed, false);
    oldStatus.resolve({ ok: true, json: async () => ({ unsubscribed: true }) });
    await oldLookup;
    assert.equal(runtime.render().isUnsubscribed, false);
    assert.equal(runtime.render().unsubStatus, '');
  } finally { runtime.cleanup(); }
});

test('a stalled preference token refresh ends checking without issuing a late status request', async () => {
  const tokenResponse = deferred();
  const runtime = await settingsPreferences({ tokenResponse });
  try {
    runtime.render();
    const lookup = runtime.flushTimers();
    await settle();
    await runtime.expireRequestDeadline();
    assert.equal(runtime.render().preferenceActionLabel, 'Retry preference check');
    assert.equal(runtime.render().preferenceActionDisabled, false);
    tokenResponse.resolve('late-session-token');
    await lookup;
    assert.equal(runtime.requests.length, 0);
  } finally { runtime.cleanup(); }
});

test('a late failed preference lookup cannot replace a confirmed update message', async () => {
  const statusResponse = deferred();
  const runtime = await settingsPreferences({ statusResponse });
  try {
    const page = runtime.render();
    const lookup = runtime.flushTimers();
    await settle();
    await page.handleUnsubscribeToggle('resubscribe');
    assert.equal(runtime.render().unsubStatus, 'Preference saved.');
    statusResponse.resolve({ ok: false, status: 403, json: async () => ({ error: 'Old lookup failed.' }) });
    await lookup;
    assert.equal(runtime.render().unsubStatus, 'Preference saved.');
    assert.equal(runtime.render().isUnsubscribed, false);
    assert.equal(runtime.render().preferenceChecking, false);
  } finally { runtime.cleanup(); }
});

test('a late failed preference lookup cannot replace the new account status', async () => {
  const oldStatus = deferred();
  const runtime = await settingsPreferences({ statusResponses: [oldStatus.promise, { ok: true, json: async () => ({ unsubscribed: false }) }] });
  try {
    runtime.render();
    const oldLookup = runtime.flushTimers();
    await settle();
    runtime.setUserEmail('other@gmail.com');
    runtime.render();
    await runtime.flushTimers();
    assert.equal(runtime.render().hasPreferenceStatus, true);
    oldStatus.resolve({ ok: false, status: 403, json: async () => ({ error: 'Old account could not be checked.' }) });
    await oldLookup;
    const current = runtime.render();
    assert.equal(current.unsubscribeEmail, 'other@gmail.com');
    assert.equal(current.unsubStatus, '');
    assert.equal(current.isUnsubscribed, false);
    assert.equal(current.preferenceChecking, false);
  } finally { runtime.cleanup(); }
});

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

async function authSaveActions({ cache } = {}) {
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
    saveStoredProfile: cache?.saveStoredProfile || (data => localWrites.push(data)),
    saveStoredRoadmapProgress: cache?.saveStoredRoadmapProgress || ((slug, ids) => localWrites.push({ slug, ids })),
  };
  const actions = new Function(...Object.keys(dependencies), `${source}; return { saveProfile, saveRoadmapProgress };`)(...Object.values(dependencies));
  return { actions, pending, services, localWrites, cloudWrites };
}

async function browserCaches({ blocked = false, readOnly = false } = {}) {
  const values = new Map();
  const events = [];
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (readOnly) throw new Error('Storage quota exceeded');
      values.set(key, value);
    },
    removeItem: key => {
      if (readOnly) throw new Error('Storage removal blocked');
      values.delete(key);
    },
  };
  const window = { dispatchEvent: event => events.push(event.type) };
  Object.defineProperty(window, 'localStorage', {
    get() { if (blocked) throw new Error('Storage access blocked'); return storage; },
  });
  const dependencies = { window, BroadcastChannel: undefined };
  const profile = await loadClientModule('utils/shared/profileStore.js', ['saveStoredProfile', 'readProfileSnapshot', 'clearStoredProfile'], dependencies);
  const progress = await loadClientModule('utils/shared/progressStore.js', ['saveStoredRoadmapProgress', 'readStoredRoadmapProgress', 'readAllStoredRoadmapProgress', 'clearStoredRoadmapProgress'], dependencies);
  return { ...profile, ...progress, values, events, setReadOnly: value => { readOnly = value; } };
}

test('cloud profile and progress saves remain usable when browser storage access is blocked', async () => {
  const cache = await browserCaches({ blocked: true });
  const runtime = await authSaveActions({ cache });
  const profileSave = runtime.actions.saveProfile({ name: 'Current Student', degree: 'BCA', year: '1st Year', interest: 'Web', ageBand: '18-plus' });
  const progressSave = runtime.actions.saveRoadmapProgress('frontend', ['intro', 'intro']);
  runtime.pending.resolve();
  await Promise.all([profileSave, progressSave]);
  assert.equal(cache.readProfileSnapshot().name, 'Current Student');
  assert.equal(cache.readProfileSnapshot().uid, 'student-a');
  assert.deepEqual(cache.readStoredRoadmapProgress('frontend'), ['intro']);
  assert.deepEqual(cache.readAllStoredRoadmapProgress(), [{ slug: 'frontend', completedNodeIds: ['intro'] }]);
  assert.ok(cache.events.includes('sb_profile_change'));
  assert.ok(cache.events.includes('sb_progress_change'));
  for (const kind of ['quiz', 'counsellor']) {
    const { getStoredProfile } = await loadClientModule(`utils/client/${kind}/${kind}Dom.js`, ['getStoredProfile'], { readProfileSnapshot: cache.readProfileSnapshot, marked: null });
    assert.equal(getStoredProfile().degree, 'BCA', `${kind} must use the cloud-backed session snapshot`);
    assert.equal(getStoredProfile().year, '1st Year');
  }
});

test('failed cache erasure masks the previous account before the next account saves its data', async () => {
  const cache = await browserCaches();
  cache.saveStoredProfile({ uid: 'student-a', name: 'Old Student', email: 'old@example.com', degree: 'BCA', year: '1st Year' });
  cache.saveStoredRoadmapProgress('frontend', ['old-intro']);
  cache.setReadOnly(true);
  cache.clearStoredProfile();
  cache.clearStoredRoadmapProgress();
  assert.equal(cache.readProfileSnapshot().uid, '');
  assert.equal(cache.readProfileSnapshot().degree, '');
  assert.deepEqual(cache.readStoredRoadmapProgress('frontend'), []);
  assert.deepEqual(cache.readAllStoredRoadmapProgress(), []);
  cache.saveStoredProfile({ uid: 'student-b', name: 'New Student', email: 'new@example.com', degree: 'Bootcamp', year: 'Graduated' });
  cache.saveStoredRoadmapProgress('backend', ['new-intro']);
  assert.equal(cache.readProfileSnapshot().uid, 'student-b');
  assert.deepEqual(cache.readAllStoredRoadmapProgress(), [{ slug: 'backend', completedNodeIds: ['new-intro'] }]);
  assert.equal(cache.values.get('sb_profile_uid'), 'student-a', 'persisted stale data must be masked when its removal is denied');
});

test('a quota failure uses current values and normal storage resumes on a later successful save', async () => {
  const cache = await browserCaches();
  cache.saveStoredProfile({ uid: 'student-a', name: 'Old Name', degree: 'BCA', year: '1st Year' });
  cache.saveStoredRoadmapProgress('frontend', ['intro']);
  cache.setReadOnly(true);
  cache.saveStoredProfile({ uid: 'student-a', name: 'New Name', degree: 'BCA', year: '2nd Year' });
  cache.saveStoredRoadmapProgress('frontend', ['intro', 'project']);
  assert.equal(cache.readProfileSnapshot().name, 'New Name');
  assert.deepEqual(cache.readStoredRoadmapProgress('frontend'), ['intro', 'project']);
  cache.setReadOnly(false);
  cache.saveStoredProfile({ uid: 'student-a', name: 'Latest Name', degree: 'BCA', year: '3rd Year' });
  cache.saveStoredRoadmapProgress('frontend', ['intro', 'project', 'review']);
  assert.equal(cache.readProfileSnapshot().name, 'Latest Name');
  assert.equal(cache.values.get('sb_name'), 'Latest Name');
  assert.deepEqual(JSON.parse(cache.values.get('skillbun_progress_frontend')), ['intro', 'project', 'review']);
  cache.clearStoredProfile();
  cache.clearStoredRoadmapProgress();
  assert.equal(cache.readProfileSnapshot().degree, '');
  assert.deepEqual(cache.readAllStoredRoadmapProgress(), []);
});

for (const nextUid of [null, 'student-b']) {
  for (const action of ['saveProfile', 'saveRoadmapProgress']) {
    test(`auth: pending ${action} cannot restore cache after ${nextUid ? 'account switch' : 'signout'}`, async () => {
      const runtime = await authSaveActions();
      const save = action === 'saveProfile'
        ? runtime.actions[action]({ name: 'Old Student', degree: 'BCA', year: '1st Year', interest: '', ageBand: '18-plus' })
        : runtime.actions[action]('frontend', ['intro']);
      assert.match(runtime.cloudWrites[0].path, /^users\/student-a/);
      runtime.services.auth.currentUser = nextUid ? { uid: nextUid } : null;
      runtime.pending.resolve();
      await save;
      assert.deepEqual(runtime.localWrites, []);
    });
  }
}

async function counsellorRuntime({ proof, response, query = '' } = {}) {
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
  const location = { search: query, pathname: '/counsellor' };
  const destinations = [];
  const payloads = [];
  const dependencies = {
    window: { location, history: { replaceState: (_state, _title, path) => { destinations.push(path); location.search = ''; } } },
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
    fetchCounsellorPayload: async (_state, payload) => {
      requestCalls += 1;
      payloads.push(structuredClone(payload));
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
  return { elements, state, messages, cleanup, destinations, payloads, proofCalls: () => proofCalls, requestCalls: () => requestCalls };
}

test('Bun-Bot keeps the roadmap context after consuming an Ask BunBot deep link and clearing chat', async () => {
  const query = `?${new URLSearchParams({ q: 'Explain CSS layouts', context: 'Frontend Developer Roadmap' })}`;
  const runtime = await counsellorRuntime({ query });
  try {
    assert.deepEqual(runtime.destinations, ['/counsellor']);
    assert.equal(runtime.requestCalls(), 1);
    assert.match(runtime.payloads[0].contents[0].parts[0].text, /Frontend Developer Roadmap/);
    assert.equal(runtime.payloads[0].contents.at(-1).parts[0].text, 'Explain CSS layouts');
    runtime.elements.get('clearChatBtn').click();
    runtime.elements.get('chatInput').value = 'What should I practice next?';
    await runtime.elements.get('sendBtn').click();
    assert.match(runtime.payloads[1].contents[0].parts[0].text, /Frontend Developer Roadmap/);
  } finally { runtime.cleanup(); }
});

test('Bun-Bot keeps accurate per-account usage feedback when browser storage writes fail', async () => {
  let uid = 'student-a';
  const api = await loadClientModule('utils/client/counsellor/counsellorApi.js', ['getRateLimitData', 'checkRateLimit', 'incrementRateLimit'], {
    getFirebaseServices: () => ({ auth: { currentUser: { uid } } }),
    localStorage: { getItem: () => null, setItem() { throw new Error('Storage quota exceeded'); } },
  });
  for (let index = 0; index < 100; index += 1) api.incrementRateLimit();
  assert.equal(api.getRateLimitData().count, 100);
  assert.equal(api.checkRateLimit().allowed, false);
  uid = 'student-b';
  assert.equal(api.getRateLimitData().count, 0);
  assert.equal(api.checkRateLimit().allowed, true);
  api.incrementRateLimit();
  assert.equal(api.getRateLimitData().count, 1);
  const { updateUsageLimitCard } = await loadClientModule('utils/client/counsellor/counsellorDom.js', ['updateUsageLimitCard'], {
    marked: null, getRateLimitData: api.getRateLimitData, RATE_LIMIT_MAX: 100, RATE_LIMIT_WINDOW_MS: 3_600_000,
    document: { getElementById: id => controls[id] || null },
  });
  const controls = Object.fromEntries(['limitCount', 'limitBar', 'limitReset', 'mobileLimitCount'].map(id => [id, { style: {}, classList: { remove() {}, add() {} } }]));
  updateUsageLimitCard();
  assert.equal(controls.limitCount.textContent, '99 / 100');
});

for (const theme of ['light', 'dark']) {
  test(`quiz human verification renders in the active ${theme} theme without reading browser storage`, async () => {
    const state = { securityConfig: { captchaEnabled: true, captchaSiteKey: 'synthetic-test-sitekey' }, signal: new AbortController().signal, captchaWidgetId: null };
    let options;
    const control = { style: {}, classList: { remove() {}, add() {} } };
    const { initCaptcha } = await loadClientModule('utils/client/quiz/quizCaptcha.js', ['initCaptcha'], {
      hasFreshHumanProof: () => false,
      document: { getElementById: () => control, documentElement: { getAttribute: () => theme } },
      window: { turnstile: { render: (_selector, configuration) => { options = configuration; return 0; } } },
      localStorage: { getItem() { assert.fail('CAPTCHA must use the applied theme without storage access'); } },
    });
    await initCaptcha(state);
    assert.equal(options.theme, theme);
    assert.equal(options.sitekey, 'synthetic-test-sitekey');
    assert.equal(state.captchaWidgetId, 0);
  });
}

async function captchaLifecycle(kind, { scriptReady = true } = {}) {
  const controller = new AbortController();
  const state = {
    signal: controller.signal, captchaWidgetId: null, captchaToken: 'current-token',
    securityConfig: { captchaEnabled: true, captchaSiteKey: 'synthetic-test-sitekey' },
  };
  const control = { style: {}, textContent: '', classList: { remove() {}, add() {} } };
  const changes = [];
  let options;
  let script;
  const dependencies = {
    state,
    hasFreshHumanProof: () => false,
    setCaptchaStatus: message => changes.push(message),
    toggleSecurityBanner: show => changes.push(show),
    document: {
      getElementById: () => control,
      documentElement: { getAttribute: () => 'dark' },
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: { appendChild: element => { script = element; } },
    },
    window: scriptReady ? { turnstile: { render: (_selector, configuration) => { options = configuration; return 0; } } } : {},
  };
  let init;
  if (kind === 'quiz') {
    const { initCaptcha } = await loadClientModule('utils/client/quiz/quizCaptcha.js', ['initCaptcha'], dependencies);
    init = () => initCaptcha(state);
  } else {
    const source = await fs.readFile(new URL('../../utils/client/counsellorRuntime.js', import.meta.url), 'utf8');
    const captchaSource = source.slice(source.indexOf('  // --- Turnstile Captcha Lazy load ---'), source.indexOf('  // --- Initializer ---'));
    init = new Function(...Object.keys(dependencies), `${captchaSource}; return initCaptcha;`)(...Object.values(dependencies));
  }
  const pending = init();
  if (scriptReady) await pending;
  return { controller, state, control, changes, options, script, pending, init };
}

for (const kind of ['quiz', 'counsellor']) {
  test(`${kind}: disposed CAPTCHA callbacks cannot change the replacement page or token`, async () => {
    const runtime = await captchaLifecycle(kind);
    runtime.controller.abort();
    const priorStatus = runtime.control.textContent;
    const priorChanges = [...runtime.changes];
    runtime.options['expired-callback']();
    runtime.options['error-callback']('110600');
    runtime.options.callback('late-token');
    await runtime.init();
    assert.equal(runtime.state.captchaToken, 'current-token');
    assert.equal(runtime.control.textContent, priorStatus);
    assert.deepEqual(runtime.changes, priorChanges);
  });

  test(`${kind}: a late CAPTCHA script failure is ignored after unmount`, async () => {
    const runtime = await captchaLifecycle(kind, { scriptReady: false });
    runtime.controller.abort();
    const priorStatus = runtime.control.textContent;
    const priorChanges = [...runtime.changes];
    runtime.script.onerror();
    await runtime.pending;
    assert.equal(runtime.control.textContent, priorStatus);
    assert.deepEqual(runtime.changes, priorChanges);
  });
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

async function onboardingRuntime({ next = '/quiz', preferenceResponse, profileSaveError } = {}) {
  const fullSource = await fs.readFile(new URL('../../app/onboarding/page.jsx', import.meta.url), 'utf8');
  const source = fullSource.slice(fullSource.indexOf('function OnboardingForm()'), fullSource.indexOf('  if (authLoading ||'));
  const { normalizeInternalPath } = await loadClientModule('utils/shared/routes.js', ['normalizeInternalPath']);
  const values = [];
  let index = 0;
  let effects = [];
  let complete = false;
  const destinations = [];
  const profiles = [];
  const requests = [];
  const dependencies = {
    normalizeInternalPath,
    useRouter: () => ({ replace: path => destinations.push(path), push: path => destinations.push(path) }),
    useSearchParams: () => new URLSearchParams({ next }),
    useAuth: () => ({
      user: { email: 'student@example.com', getIdToken: async () => 'owner-token' },
      profile: { hydrated: true, ageBand: '18-plus' },
      authLoading: false, profileLoading: false, isProfileComplete: complete,
      saveProfile: async data => { if (profileSaveError) throw profileSaveError; profiles.push(data); complete = true; },
    }),
    useState: initial => {
      const stateIndex = index++;
      if (!(stateIndex in values)) values[stateIndex] = initial;
      return [values[stateIndex], value => { values[stateIndex] = value; }];
    },
    useEffect: fn => { effects.push(fn); },
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key]; } },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (preferenceResponse instanceof Error) throw preferenceResponse;
      return preferenceResponse || { ok: true };
    },
    AbortSignal,
    posthog: { capture() {} },
    console: { error() {} },
  };
  const renderForm = new Function(...Object.keys(dependencies), `${source}; return { handleSubmit, continuePath, saving, error, success, savedDestination }; }; return OnboardingForm;`)(...Object.values(dependencies));
  function render() {
    index = 0;
    effects = [];
    const form = renderForm();
    for (const effect of effects) effect();
    return form;
  }
  return {
    render, destinations, profiles, requests,
    submit: ({ destination, consent = false } = {}) => render().handleSubmit({
      preventDefault() {},
      currentTarget: { name: 'Student', degree: 'BCA', year: '1st Year', interest: 'Web Development', marketingConsent: consent ? 'on' : null },
      nativeEvent: { submitter: destination ? { getAttribute: () => destination } : null },
    }),
  };
}

for (const next of ['/quiz', '/counsellor?q=Compare%20frontend%20%26%20backend&context=roadmap', 'https://untrusted.example/']) {
  test(`onboarding continues to the safe requested destination after profile save: ${next}`, async () => {
    const runtime = await onboardingRuntime({ next });
    const expected = next.startsWith('https:') ? '/quiz' : next;
    assert.equal(runtime.render().continuePath, expected);
    await runtime.submit();
    assert.deepEqual(runtime.destinations, [expected]);
    assert.equal(runtime.profiles[0].ageBand, '18-plus');
    assert.equal(runtime.requests.length, 0, 'optional email consent must never be assumed');
  });
}

test('onboarding still honors the explicit Explore Roadmaps alternative', async () => {
  const runtime = await onboardingRuntime({ next: '/counsellor?q=Frontend' });
  await runtime.submit({ destination: '/roadmap' });
  assert.deepEqual(runtime.destinations, ['/roadmap']);
});

for (const response of [{ ok: false }, new Error('Network unavailable')]) {
  test(`an optional email preference ${response instanceof Error ? 'network failure' : 'rejection'} keeps the saved profile and visible continuation`, async () => {
    const next = '/counsellor?q=Keep%20this%20topic';
    const runtime = await onboardingRuntime({ next, preferenceResponse: response });
    await runtime.submit({ consent: true });
    const form = runtime.render();
    assert.equal(runtime.profiles.length, 1);
    assert.equal(form.savedDestination, next);
    assert.match(form.success, /Profile saved.*could not confirm your email preference/);
    assert.equal(form.error, '');
    assert.equal(form.saving, false);
    assert.deepEqual(runtime.destinations, [], 'automatic completed-profile redirect must not hide the preference warning');
    assert.equal(runtime.requests[0].headers.Authorization, 'Bearer owner-token');
  });
}

test('onboarding confirms an explicitly selected email opt-in before continuing', async () => {
  const runtime = await onboardingRuntime();
  await runtime.submit({ consent: true });
  assert.deepEqual(JSON.parse(runtime.requests[0].body), { email: 'student@example.com', action: 'resubscribe' });
  assert.deepEqual(runtime.destinations, ['/quiz']);
});

test('a failed profile save does not submit optional email consent or continue', async () => {
  const runtime = await onboardingRuntime({ profileSaveError: new Error('Profile unavailable') });
  await runtime.submit({ consent: true });
  assert.match(runtime.render().error, /Could not save your profile/);
  assert.deepEqual(runtime.destinations, []);
  assert.equal(runtime.requests.length, 0);
});
