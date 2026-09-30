import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const helperSource = (await readFile(new URL('../../utils/client/accountDeletion.js', import.meta.url), 'utf8'))
  .replace(/^export /gm, '');
const providerSource = await readFile(new URL('../../app/components/AuthProvider.jsx', import.meta.url), 'utf8');
const adminSource = await readFile(new URL('../../app/dashboard/console/admin/analytics/page.jsx', import.meta.url), 'utf8');
const settingsSource = await readFile(new URL('../../app/settings/page.jsx', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = (status, data) => ({ status, json: async () => data });
const complete = () => response(200, { success: true, status: 'complete' });
const pending = (retryAfterMs = 1000) => response(202, { success: false, status: 'pending', retryAfterMs });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup(fetchResponse = complete) {
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;
  let tokenRequests = 0;
  const user = { uid: 'student-a', getIdToken: async () => { tokenRequests += 1; return 'signed-token'; } };
  const api = new Function('fetch', 'setTimeout', 'clearTimeout', `${helperSource}; return requestAccountDeletion;`)(
    async (url, options) => {
      requests.push({ url, ...options });
      return fetchResponse(requests.length, options);
    },
    (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    id => timers.delete(id),
  );
  return {
    api, user, requests, timers,
    get tokenRequests() { return tokenRequests; },
    advance(delay) {
      const timer = [...timers].find(([, item]) => item.delay === delay);
      assert.ok(timer, `Expected a ${delay}ms timer`);
      timers.delete(timer[0]);
      timer[1].callback();
    },
  };
}

test('deletion requires login and never sends its token to an arbitrary endpoint', async () => {
  const client = setup();
  await assert.rejects(client.api(), { code: 'auth/login-required' });
  await assert.rejects(client.api({ user: client.user, endpoint: 'https://example.test/delete' }), { code: 'account/invalid-endpoint' });
  assert.equal(client.requests.length, 0);
  assert.equal(client.tokenRequests, 0);
});

test('only an authenticated, explicit complete response confirms deletion', async () => {
  const client = setup();
  assert.deepEqual(await client.api({ user: client.user }), { success: true, status: 'complete' });
  assert.equal(client.requests[0].url, '/api/account');
  assert.equal(client.requests[0].method, 'DELETE');
  assert.equal(client.requests[0].headers.Authorization, 'Bearer signed-token');
  assert.equal(client.requests[0].cache, 'no-store');
  assert.equal(client.requests[0].body, undefined);
  assert.equal(client.timers.size, 0);
});

test('pending deletion keeps polling the same admin target and honors the retry delay', async () => {
  const client = setup(count => count === 1 ? pending(2500) : complete());
  const endpoint = '/api/admin/users/student-a?email=student%2Btest%40example.test';
  const deletion = client.api({ user: client.user, endpoint });
  await settle();
  assert.equal(client.requests.length, 1);
  client.advance(2500);
  assert.equal((await deletion).status, 'complete');
  assert.equal(client.requests.length, 2);
  assert.ok(client.requests.every(request => request.url === endpoint));
  assert.equal(client.tokenRequests, 1);
  assert.equal(client.timers.size, 0);
});

test('thirty pending responses stop with a retryable pending result rather than success', async () => {
  const client = setup(() => pending());
  const rejected = assert.rejects(client.api({ user: client.user }), {
    code: 'account/deletion-pending', retryable: true, status: 202,
  });
  for (let request = 1; request < 30; request += 1) {
    await settle();
    client.advance(1000);
  }
  await rejected;
  assert.equal(client.requests.length, 30);
  assert.equal(client.timers.size, 0);
});

test('server login, identity and retryable errors are surfaced without a fallback request', async () => {
  for (const [status, code, retryable] of [
    [401, 'auth/requires-recent-login', false],
    [409, 'account/identity-mismatch', false],
    [503, 'account/deletion-incomplete', true],
  ]) {
    const client = setup(() => response(status, { success: false, error: 'Server explanation', code, retryable }));
    await assert.rejects(client.api({ user: client.user }), { message: 'Server explanation', status, code, retryable });
    assert.equal(client.requests.length, 1);
  }
});

test('malformed or contradictory success responses never confirm deletion', async () => {
  for (const [status, body] of [
    [200, { success: true }],
    [200, { success: false, status: 'complete' }],
    [202, { success: true, status: 'complete' }],
    [204, { success: true, status: 'complete' }],
    [200, null],
  ]) {
    const client = setup(() => response(status, body));
    await assert.rejects(client.api({ user: client.user }), { code: 'account/deletion-unconfirmed' });
    assert.equal(client.requests.length, 1);
  }
});

test('a lost connection cannot be described as an untouched or successfully deleted account', async () => {
  const client = setup(() => { throw new TypeError('Network failed'); });
  await assert.rejects(client.api({ user: client.user }), error => {
    assert.equal(error.code, 'account/deletion-unconfirmed');
    assert.equal(error.retryable, true);
    assert.match(error.message, /Some data may already be removed/);
    return true;
  });
  assert.equal(client.requests.length, 1);
});

test('the overall timeout aborts a hung request and frees its timer', async () => {
  const client = setup(() => new Promise(() => {}));
  const rejected = assert.rejects(client.api({ user: client.user }), { code: 'account/deletion-timeout', retryable: true });
  await settle();
  client.advance(90_000);
  await rejected;
  assert.equal(client.requests[0].signal.aborted, true);
  assert.equal(client.timers.size, 0);
});

test('timeout while retrieving a token prevents a late request', async () => {
  const client = setup();
  const token = deferred();
  client.user.getIdToken = () => token.promise;
  const rejected = assert.rejects(client.api({ user: client.user }), { code: 'account/deletion-timeout' });
  client.advance(90_000);
  await rejected;
  token.resolve('late-token');
  await settle();
  assert.equal(client.requests.length, 0);
});

test('cancelling during a pending delay stops polling and frees all timers', async () => {
  const client = setup(() => pending());
  const controller = new AbortController();
  const rejected = assert.rejects(client.api({ user: client.user, signal: controller.signal }), { code: 'account/deletion-interrupted' });
  await settle();
  controller.abort();
  await rejected;
  assert.equal(client.requests.length, 1);
  assert.equal(client.timers.size, 0);
});

test('an already-cancelled operation does not retrieve a token or delete anything', async () => {
  const client = setup();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.api({ user: client.user, signal: controller.signal }), { code: 'account/deletion-interrupted' });
  assert.equal(client.tokenRequests, 0);
  assert.equal(client.requests.length, 0);
});

test('switching accounts during polling prevents another deletion request', async () => {
  const client = setup(() => pending());
  let currentUser = client.user;
  const rejected = assert.rejects(client.api({ user: client.user, getCurrentUser: () => currentUser }), { code: 'auth/user-changed' });
  await settle();
  currentUser = { uid: 'student-b' };
  client.advance(1000);
  await rejected;
  assert.equal(client.requests.length, 1);
});

function providerDeletion({ request, signoutFails = false, cacheFails = false } = {}) {
  const events = [];
  const services = { configured: true, auth: { currentUser: { uid: 'student-a' } } };
  const match = providerSource.match(/const deleteAccount = useCallback\((async \(\) => \{[\s\S]*?\n  \}), \[services\]\);/);
  assert.ok(match, 'Load the actual AuthProvider deletion callback');
  const deletion = new Function('services', 'requestAccountDeletion', 'signOut', 'clearSessionCache', 'notifyProfileChanged', 'console', `return (${match[1]});`)(
    services,
    request || (async () => { events.push('server-complete'); return { success: true, status: 'complete' }; }),
    async () => { events.push('signout'); if (signoutFails) throw new Error('Signout failed'); services.auth.currentUser = null; },
    () => { events.push('clear'); if (cacheFails) throw new Error('Storage failed'); },
    () => events.push('notify'),
    { warn() {} },
  );
  return { deletion, events, services };
}

test('AuthProvider preserves the session until server completion', async () => {
  const request = deferred();
  const client = providerDeletion({ request: () => request.promise });
  const deletion = client.deletion();
  await settle();
  assert.deepEqual(client.events, []);
  assert.equal(client.services.auth.currentUser.uid, 'student-a');
  request.resolve({ success: true, status: 'complete' });
  assert.equal((await deletion).success, true);
  assert.deepEqual(client.events, ['signout', 'clear', 'notify']);
});

test('AuthProvider never clears local state when deletion fails', async () => {
  const client = providerDeletion({ request: async () => { throw Object.assign(new Error('Retry deletion'), { code: 'account/deletion-incomplete' }); } });
  await assert.rejects(client.deletion(), { code: 'account/deletion-incomplete' });
  assert.deepEqual(client.events, []);
  assert.equal(client.services.auth.currentUser.uid, 'student-a');
});

test('completed deletion reports a local-cleanup warning without claiming server failure', async () => {
  for (const options of [{ signoutFails: true }, { cacheFails: true }]) {
    const client = providerDeletion(options);
    const result = await client.deletion();
    assert.equal(result.success, true);
    assert.equal(result.status, 'complete');
    assert.match(result.warning, /Your account was deleted/);
    assert.ok(client.events.includes('clear'));
  }
});

test('a late completion cannot sign out or clear a different account', async () => {
  const request = deferred();
  const client = providerDeletion({ request: () => request.promise });
  const deletion = client.deletion();
  client.services.auth.currentUser = { uid: 'student-b' };
  request.resolve({ success: true, status: 'complete' });
  assert.equal((await deletion).success, true);
  assert.deepEqual(client.events, []);
});

test('completed deletion still clears its local cache if Firebase has already signed out', async () => {
  const request = deferred();
  const client = providerDeletion({ request: () => request.promise });
  const deletion = client.deletion();
  client.services.auth.currentUser = null;
  request.resolve({ success: true, status: 'complete' });
  assert.equal((await deletion).success, true);
  assert.deepEqual(client.events, ['clear', 'notify']);
});

function adminDeletion(request) {
  const events = [];
  const target = { uid: 'student-a', email: 'student+test@example.test', name: 'Student' };
  const user = { uid: 'admin-a' };
  let data = { users: [target], stats: { totalStudents: 1 } };
  const start = adminSource.indexOf('  const handleDeleteUser = async (targetUser) => {');
  const end = adminSource.indexOf('  // Reset All Sent Email Counters Handler', start);
  assert.ok(start > 0 && end > start, 'Load the actual admin deletion handler');
  const dependencies = {
    user,
    window: { confirm: () => true },
    setDeletingUid: uid => events.push(['deleting', uid]),
    setStatusMessage: value => events.push(['status', value]),
    requestAccountDeletion: options => { events.push(['request', options]); return request(options); },
    getFirebaseServices: () => ({ auth: { currentUser: user } }),
    setData: update => { data = update(data); },
    expandedUserUid: null,
    setExpandedUserUid: () => {},
    notifyDataMutated: tag => events.push(['notify', tag]),
    console: { error() {} },
  };
  const handler = new Function(...Object.keys(dependencies), `${adminSource.slice(start, end)}; return handleDeleteUser;`)(...Object.values(dependencies));
  return { run: () => handler(target), events, get data() { return data; } };
}

test('admin deletion waits for server success before removing a student or showing success', async () => {
  const request = deferred();
  const client = adminDeletion(() => request.promise);
  const deletion = client.run();
  await settle();
  assert.equal(client.data.users.length, 1);
  const options = client.events.find(([event]) => event === 'request')[1];
  assert.equal(options.endpoint, '/api/admin/users/student-a?email=student%2Btest%40example.test');
  assert.doesNotMatch(options.endpoint, /adminEmail/);
  assert.equal(client.events.some(([event, value]) => event === 'status' && value?.type === 'success'), false);
  request.resolve({ success: true, status: 'complete' });
  await deletion;
  assert.equal(client.data.users.length, 0);
  assert.equal(client.events.some(([event, value]) => event === 'status' && value?.type === 'success'), true);
});

test('admin deletion errors retain the student and do not claim success or refresh other views', async () => {
  const client = adminDeletion(async () => { throw new Error('Deletion remains pending'); });
  await client.run();
  assert.equal(client.data.users.length, 1);
  assert.equal(client.events.some(([event, value]) => event === 'status' && value?.type === 'success'), false);
  assert.equal(client.events.some(([event]) => event === 'notify'), false);
  assert.ok(client.events.some(([event, value]) => event === 'status' && value?.text.includes('Deletion remains pending')));
});

function settingsDeletion(request) {
  const events = [];
  const start = settingsSource.indexOf('  async function handleDeleteAccount() {');
  const end = settingsSource.indexOf('\n  return (', start);
  assert.ok(start > 0 && end > start, 'Load the actual settings deletion handler');
  const dependencies = {
    deletingAccount: false,
    setError: value => events.push(['error', value]),
    setStatus: value => events.push(['status', value]),
    setLoading: value => events.push(['loading', value]),
    setDeletingAccount: value => events.push(['deleting', value]),
    setShowDeleteModal: () => {},
    deleteAccount: request,
    window: { alert: value => events.push(['warning', value]) },
    router: { replace: value => events.push(['navigate', value]) },
  };
  const handler = new Function(...Object.keys(dependencies), `${settingsSource.slice(start, end)}; return handleDeleteAccount;`)(...Object.values(dependencies));
  return { run: handler, events };
}

test('settings keep the auth-redirect guard active through successful deletion navigation', async () => {
  const client = settingsDeletion(async () => ({ success: true, status: 'complete', warning: 'Account deleted; refresh the local session.' }));
  await client.run();
  assert.deepEqual(client.events.filter(([event]) => event === 'deleting'), [['deleting', true]]);
  const warning = client.events.findIndex(([event]) => event === 'warning');
  const navigation = client.events.findIndex(([event]) => event === 'navigate');
  assert.ok(warning >= 0 && navigation > warning);
  assert.deepEqual(client.events[navigation], ['navigate', '/']);
});

test('settings surface deletion failure and unlock retry without navigating away', async () => {
  const client = settingsDeletion(async () => { throw Object.assign(new Error('Pending; retry to finish.'), { code: 'account/deletion-pending' }); });
  await client.run();
  assert.ok(client.events.some(([event, value]) => event === 'error' && value === 'Pending; retry to finish.'));
  assert.deepEqual(client.events.filter(([event]) => event === 'deleting'), [['deleting', true], ['deleting', false]]);
  assert.equal(client.events.some(([event]) => event === 'navigate'), false);
});

test('settings remain reachable after an erased profile is missing, but still require login', () => {
  const start = settingsSource.indexOf('  useEffect(() => {', settingsSource.indexOf('// Standard authentication gate redirect'));
  const end = settingsSource.indexOf('  const handleUnsubscribeToggle', start);
  assert.ok(start > 0 && end > start);
  const redirects = [];
  const run = new Function('useEffect', 'authLoading', 'user', 'deletingAccount', 'isUnsubscribeAction', 'router', settingsSource.slice(start, end));
  const effect = callback => callback();
  const router = { replace: path => redirects.push(path) };
  run(effect, false, { uid: 'student-with-removed-profile' }, false, false, router);
  assert.deepEqual(redirects, []);
  run(effect, false, null, false, false, router);
  assert.deepEqual(redirects, ['/auth?next=/settings']);
});
