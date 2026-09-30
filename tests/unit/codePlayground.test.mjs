import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server.js';
import { normalizePlaygroundLanguage, playgroundSupportMessage, PLAYGROUND_LIMITS, STATIC_PREVIEW_CSP } from '../../utils/shared/playground.mjs';
import { buildPlaygroundSandboxDocument, buildPlaygroundSandboxPolicy, playgroundWorkerRuntime, playgroundSandboxBridge, PYODIDE_BASE_URL } from '../../utils/server/playgroundSandbox.mjs';

const clientSource = (await readFile(new URL('../../utils/client/playgroundRunner.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
const componentSource = await readFile(new URL('../../app/components/CodePlayground.jsx', import.meta.url), 'utf8');
const runId = 'playground-test-run-1234';

function clientHarness({ randomUUID = () => runId } = {}) {
  const listeners = new Map(), timers = new Map(), frames = [], sent = [], outputs = [];
  let nextTimer = 0, readyCount = 0;
  const document = {
    createElement: () => {
      const frame = {
        attributes: {}, removed: false, contentWindow: { postMessage: data => sent.push(data) },
        setAttribute(name, value) { this.attributes[name] = value; }, remove() { this.removed = true; },
      };
      frames.push(frame); return frame;
    },
    body: { appendChild() {} },
  };
  const start = new Function('document', 'window', 'crypto', 'performance', 'setTimeout', 'clearTimeout', 'PLAYGROUND_LIMITS', `${clientSource}; return startPlaygroundRun;`)(
    document,
    { addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: type => listeners.delete(type) },
    { randomUUID }, { now: () => 100 },
    (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    id => timers.delete(id), PLAYGROUND_LIMITS,
  );
  return {
    frames, sent, outputs, timers, listeners, get readyCount() { return readyCount; },
    start(options = {}) { return start({ language: 'javascript', code: '1 + 2', onOutput: (kind, text) => outputs.push({ kind, text }), onReady: () => { readyCount += 1; }, ...options }); },
    message(data, source = frames.at(-1)?.contentWindow) { listeners.get('message')?.({ source, data: { runId, ...data } }); },
    tick(delay) {
      const found = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(found, `Expected timer ${delay}`); timers.delete(found[0]); found[1].callback();
    },
  };
}

async function executeWorker(code, { language = 'javascript', loadPyodide } = {}) {
  const messages = [], imports = [];
  let closed = false;
  const self = { postMessage: value => messages.push(value), close: () => { closed = true; }, addEventListener() {}, loadPyodide };
  await vm.runInNewContext(`(${playgroundWorkerRuntime.toString()})(config)`, {
    self, console: {}, config: { code, language, runId, pyodideBaseUrl: PYODIDE_BASE_URL },
    importScripts: url => { imports.push(url); if (!loadPyodide) throw new Error('CDN unavailable'); },
  }, { timeout: 1000 });
  return { messages, imports, closed, self };
}

test('unsupported runtimes preserve their identity instead of executing as JavaScript', () => {
  for (const language of ['ts', 'typescript', 'jsx', 'tsx', 'node', 'nodejs', 'sql', 'go']) {
    assert.equal(normalizePlaygroundLanguage(language), 'unsupported');
    assert.match(playgroundSupportMessage(language), /snippet is preserved/);
  }
  for (const [input, expected] of [[' JS ', 'javascript'], ['python3', 'python'], ['html', 'html'], [null, 'javascript']]) {
    assert.equal(normalizePlaygroundLanguage(input), expected);
  }
});

test('actual JavaScript worker captures logs and awaits the program result', async () => {
  const result = await executeWorker('console.log("hello", { count: 2 }); Promise.resolve(42)');
  assert.deepEqual(result.messages.map(message => message.type), ['ready', 'output', 'output', 'complete']);
  assert.equal(result.messages[1].message, 'hello {count: 2}');
  assert.equal(result.messages[2].kind, 'result'); assert.equal(result.messages[2].message, '42');
  assert.equal(result.closed, true); assert.equal(result.self.Worker, undefined);
});

test('actual worker reports syntax/runtime failures without claiming completion', async () => {
  for (const code of ['function {', 'throw new Error("fixture failure")']) {
    const result = await executeWorker(code);
    assert.equal(result.messages.at(-1).type, 'error');
    assert.equal(result.messages.some(message => message.type === 'complete'), false);
    assert.equal(result.closed, true);
  }
});

test('actual worker formats circular objects and caps noisy programs', async () => {
  const circular = await executeWorker('const item = {}; item.self = item; console.log(item)');
  assert.match(circular.messages.find(message => message.type === 'output').message, /Circular/);
  const noisy = await executeWorker('for (let i = 0; i < 250; i++) console.log(i)');
  assert.equal(noisy.messages.filter(message => message.type === 'output').length, 200);
  assert.equal(noisy.messages.at(-1).type, 'error'); assert.match(noisy.messages.at(-1).message, /Output limit/);
});

test('Python worker loads the pinned runtime, streams output and destroys result proxies', async () => {
  let options, executed = '', destroyed = false;
  const result = await executeWorker('print(7)', { language: 'python', loadPyodide: async value => {
    options = value;
    return { runPythonAsync: async code => {
      executed = code; value.stdout('7');
      return { toString: () => 'result', destroy: () => { destroyed = true; } };
    } };
  } });
  assert.deepEqual(result.imports, [`${PYODIDE_BASE_URL}pyodide.js`]);
  assert.equal(options.indexURL, PYODIDE_BASE_URL); assert.equal(options.stdin(), null);
  assert.equal(executed, 'print(7)'); assert.equal(result.messages.find(message => message.kind === 'log').message, '7');
  assert.equal(destroyed, true); assert.equal(result.messages.at(-1).type, 'complete');
});

test('Python download failure does not claim that the runtime is ready', async () => {
  const result = await executeWorker('print(1)', { language: 'python' });
  assert.equal(result.messages.length, 1); assert.equal(result.messages[0].type, 'error');
  assert.match(result.messages[0].message, /CDN unavailable/);
});

test('client launches a fixed opaque sandbox and keeps snippet text out of its URL', async () => {
  const client = clientHarness(), run = client.start(), frame = client.frames[0];
  assert.equal(frame.src, '/api/playground/sandbox'); assert.equal(frame.attributes.sandbox, 'allow-scripts');
  assert.equal(frame.referrerPolicy, 'no-referrer'); frame.onload();
  assert.deepEqual(client.sent[0], { type: 'run', runId, language: 'javascript', code: '1 + 2' });
  client.message({ type: 'ready' }); client.message({ type: 'output', kind: 'log', message: '3' }); client.message({ type: 'complete' });
  assert.equal((await run.promise).status, 'complete'); assert.equal(frame.removed, true);
  assert.equal(client.timers.size, 0); assert.equal(client.listeners.size, 0);
  assert.deepEqual(client.outputs, [{ kind: 'log', text: '3' }]);
});

test('foreign sources, stale IDs and premature messages cannot unlock a run', async () => {
  const client = clientHarness(), run = client.start();
  client.message({ type: 'ready' }, {}); client.message({ type: 'ready', runId: 'other-run' });
  client.message({ type: 'complete' }); client.message({ type: 'output', kind: 'log', message: 'premature' });
  client.message({ type: 'navigate', message: 'https://example.test' });
  assert.equal(client.readyCount, 0); assert.deepEqual(client.outputs, []); assert.equal(client.frames[0].removed, false);
  run.cancel(); assert.equal((await run.promise).status, 'cancelled');
});

test('JavaScript timeout removes the worker-owning frame and ignores late messages', async () => {
  const client = clientHarness(), run = client.start({ code: 'while (true) {}' });
  client.message({ type: 'ready' }); client.tick(3000);
  assert.equal((await run.promise).status, 'timeout'); assert.equal(client.frames[0].removed, true);
  assert.deepEqual(client.sent.at(-1), { type: 'cancel', runId });
  client.message({ type: 'output', kind: 'log', message: 'late' }); assert.deepEqual(client.outputs, []);
});

test('Python startup and execution have separate bounded deadlines', async () => {
  const cold = clientHarness(), coldRun = cold.start({ language: 'python' });
  cold.tick(60_000); assert.match((await coldRun.promise).message, /initialize/);
  const warm = clientHarness(), warmRun = warm.start({ language: 'python' });
  warm.message({ type: 'ready' });
  assert.equal([...warm.timers.values()].some(timer => timer.delay === 60_000), false);
  warm.tick(5000); assert.match((await warmRun.promise).message, /5 seconds/);
});

test('client rejects oversized input and independently caps worker output', async () => {
  const large = clientHarness();
  assert.equal((await large.start({ code: 'x'.repeat(65_537) }).promise).status, 'error'); assert.equal(large.frames.length, 0);
  const client = clientHarness(), run = client.start();
  client.message({ type: 'ready' }); client.message({ type: 'output', kind: 'log', message: 'x'.repeat(4097) });
  assert.equal((await run.promise).status, 'error'); assert.equal(client.frames[0].removed, true);
});

test('startup cancellation removes frame, listeners and timers once', async () => {
  const client = clientHarness(), run = client.start({ language: 'python' });
  run.cancel(); run.cancel(); assert.equal((await run.promise).status, 'cancelled');
  assert.equal(client.sent.filter(message => message.type === 'cancel').length, 1);
  assert.equal(client.timers.size, 0); assert.equal(client.listeners.size, 0);
});

test('unavailable browser startup APIs resolve a controlled failure', async () => {
  const client = clientHarness({ randomUUID: () => { throw new Error('Secure context required'); } });
  const result = await client.start().promise;
  assert.equal(result.status, 'error'); assert.match(result.message, /could not create/);
  assert.equal(client.frames.length, 0); assert.equal(client.listeners.size, 0); assert.equal(client.timers.size, 0);
});

test('actual bridge validates its parent and creates one disposable worker', () => {
  const listeners = new Map(), workers = [], messages = [], revoked = [];
  const parent = { postMessage: data => messages.push(data) };
  class Worker {
    constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
    terminate() { this.terminated = true; }
  }
  vm.runInNewContext(`(${playgroundSandboxBridge.toString()})('async function worker() {}', '${PYODIDE_BASE_URL}')`, {
    parent, Worker, Blob, URL: { createObjectURL: () => 'blob:isolated-worker', revokeObjectURL: url => revoked.push(url) },
    addEventListener: (type, callback) => listeners.set(type, callback),
  });
  const data = { type: 'run', runId, language: 'javascript', code: '1' };
  listeners.get('message')({ source: {}, data }); assert.equal(workers.length, 0);
  listeners.get('message')({ source: parent, data }); listeners.get('message')({ source: parent, data }); assert.equal(workers.length, 1);
  workers[0].onmessage({ data: { runId: 'other-run', type: 'complete' } }); assert.equal(messages.length, 0);
  workers[0].onmessage({ data: { runId, type: 'complete' } });
  assert.equal(workers[0].terminated, true); assert.deepEqual(revoked, ['blob:isolated-worker']);
});

test('runner policy isolates execution and allowlists only pinned Python assets', () => {
  const { html, policy } = buildPlaygroundSandboxDocument('testNonce123');
  assert.match(policy, /sandbox allow-scripts/); assert.doesNotMatch(policy, /allow-same-origin/); assert.match(policy, /worker-src blob:/);
  const connect = policy.split('; ').find(value => value.startsWith('connect-src '));
  assert.equal(connect, `connect-src ${PYODIDE_BASE_URL}pyodide.asm.wasm ${PYODIDE_BASE_URL}python_stdlib.zip ${PYODIDE_BASE_URL}pyodide-lock.json`);
  assert.match(html, /<script nonce="testNonce123">/); assert.throws(() => buildPlaygroundSandboxPolicy("bad'; script-src *"));
  assert.match(STATIC_PREVIEW_CSP, /script-src 'none'/); assert.match(STATIC_PREVIEW_CSP, /connect-src 'none'/);
  assert.match(componentSource, /sandbox=""/);
  assert.doesNotMatch(componentSource, /window\.loadPyodide|runPythonAsync|eval\(|allow-same-origin/);
  assert.match(componentSource, /executionRef\.current\?\.cancel\(\)/);
});

test('fixed route emits no-store HTML and a fresh nonce', async () => {
  const source = (await readFile(new URL('../../app/api/playground/sandbox/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
  let nonce = 0;
  const get = new Function('randomBytes', 'buildPlaygroundSandboxDocument', `${source}; return GET;`)(
    () => ({ toString: () => `nonce${++nonce}` }), buildPlaygroundSandboxDocument,
  );
  const first = get(), second = get();
  assert.equal(first.headers.get('cache-control'), 'no-store'); assert.match(first.headers.get('content-type'), /text\/html/);
  assert.match(first.headers.get('content-security-policy'), /sandbox allow-scripts/);
  assert.notEqual(first.headers.get('content-security-policy'), second.headers.get('content-security-policy'));
});

test('only the exact runner path is exempt from Next application CSP headers', async () => {
  const { default: nextConfig } = await import('../../next.config.mjs?playground-test');
  for (const path of ['/api/playground/sandbox', '/api/playground/sandbox?ignored=1']) {
    const result = await unstable_getResponseFromNextConfig({ url: `https://skillbun.tech${path}`, nextConfig });
    assert.equal(result.headers.get('content-security-policy'), null);
  }
  for (const path of ['/', '/api/playground', '/api/playground/sandbox-other', '/api/playground/sandbox/other']) {
    const result = await unstable_getResponseFromNextConfig({ url: `https://skillbun.tech${path}`, nextConfig });
    const policy = result.headers.get('content-security-policy');
    assert.ok(policy, `Missing app CSP on ${path}`); assert.doesNotMatch(policy, /cdn\.jsdelivr\.net/);
  }
});
