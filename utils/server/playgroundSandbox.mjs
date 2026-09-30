export const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

export function buildPlaygroundSandboxPolicy(nonce) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(nonce || '')) throw new Error('Invalid playground nonce');
  return [
    "default-src 'none'", "sandbox allow-scripts", "base-uri 'none'", "object-src 'none'",
    "frame-ancestors 'self'", "form-action 'none'", "script-src-attr 'none'", "worker-src blob:",
    // Dynamic evaluation is confined to an opaque-origin, disposable worker.
    // The application document keeps its existing strict script policy.
    `script-src 'nonce-${nonce}' 'unsafe-eval' ${PYODIDE_BASE_URL}pyodide.js ${PYODIDE_BASE_URL}pyodide.asm.js`,
    `connect-src ${PYODIDE_BASE_URL}pyodide.asm.wasm ${PYODIDE_BASE_URL}python_stdlib.zip ${PYODIDE_BASE_URL}pyodide-lock.json`,
  ].join('; ');
}

// This function is serialized as a blob-worker entry point. Keep it standalone:
// it must not capture server state, application services, or credentials.
export async function playgroundWorkerRuntime(config) {
  const sendMessage = self.postMessage.bind(self);
  const closeWorker = self.close.bind(self);
  let outputCount = 0;
  let outputCharacters = 0;
  let finished = false;
  const send = (type, value = {}) => sendMessage({ type, runId: config.runId, ...value });
  const finish = (type, value = {}) => {
    if (finished) return;
    finished = true;
    send(type, value);
    closeWorker();
  };
  const format = (value, depth = 0, seen = new Set()) => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value !== 'object') return String(value).slice(0, 4096);
    if (seen.has(value)) return '[Circular]';
    if (depth >= 3) return Array.isArray(value) ? '[Array]' : '[Object]';
    seen.add(value);
    try {
      const keys = Object.keys(value).slice(0, 20);
      const entries = keys.map(key => `${Array.isArray(value) ? '' : `${key}: `}${format(value[key], depth + 1, seen)}`);
      return `${Array.isArray(value) ? '[' : '{'}${entries.join(', ')}${Array.isArray(value) ? ']' : '}'}`.slice(0, 4096);
    } catch {
      return '[Unprintable object]';
    }
  };
  const output = (kind, args) => {
    if (finished) return;
    const message = args.map(value => format(value)).join(' ').slice(0, 4096);
    outputCount += 1;
    outputCharacters += message.length;
    if (outputCount > 200 || outputCharacters > 65_536) {
      finish('error', { message: 'Output limit reached. Reduce the amount of console output and run again.' });
      return;
    }
    send('output', { kind, message });
  };
  for (const kind of ['log', 'info', 'warn', 'error']) {
    console[kind] = (...args) => output(kind, args);
  }
  // Prevent a snippet from spawning workers that outlive its execution budget.
  for (const name of ['Worker', 'SharedWorker']) {
    try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch {}
  }
  self.addEventListener('unhandledrejection', event => {
    event.preventDefault();
    finish('error', { message: format(event.reason?.message || event.reason) });
  });

  try {
    let result;
    if (config.language === 'python') {
      importScripts(`${config.pyodideBaseUrl}pyodide.js`);
      const pyodide = await self.loadPyodide({
        indexURL: config.pyodideBaseUrl,
        stdout: text => output('log', [text]),
        stderr: text => output('warn', [text]),
        stdin: () => null,
      });
      send('ready');
      result = await pyodide.runPythonAsync(config.code);
      if (result !== undefined && result !== null) output('result', [String(result)]);
      result?.destroy?.();
    } else {
      send('ready');
      // Indirect eval executes in the worker global, outside this function's
      // closure. No user code is evaluated in the application or bridge frame.
      const evaluate = (0, eval);
      result = await evaluate(config.code);
      if (result !== undefined) output('result', [result]);
    }
    finish('complete');
  } catch (error) {
    finish('error', { message: format(error?.message || error) });
  }
}

// Only trusted bridge code executes in the frame. User code stays in its worker.
export function playgroundSandboxBridge(workerSource, pyodideBaseUrl) {
  let worker = null;
  let workerUrl = '';
  let activeRunId = '';
  let hasRun = false;
  const stop = () => {
    worker?.terminate();
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = '';
  };
  const send = data => parent.postMessage(data, '*');
  addEventListener('pagehide', stop);
  addEventListener('message', event => {
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !/^[A-Za-z0-9_-]{16,80}$/.test(data.runId || '')) return;
    if (data.type === 'cancel' && data.runId === activeRunId) { stop(); return; }
    if (data.type !== 'run' || hasRun || !['javascript', 'python'].includes(data.language)) return;
    if (typeof data.code !== 'string' || data.code.length > 65_536) return;
    hasRun = true;
    activeRunId = data.runId;
    try {
      const config = { runId: activeRunId, code: data.code, language: data.language, pyodideBaseUrl };
      workerUrl = URL.createObjectURL(new Blob([`(${workerSource})(${JSON.stringify(config)});`], { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
      worker.onmessage = message => {
        const payload = message.data;
        if (!payload || payload.runId !== activeRunId || !['ready', 'output', 'complete', 'error'].includes(payload.type)) return;
        if (payload.type === 'output' && (!['log', 'info', 'warn', 'error', 'result'].includes(payload.kind) || typeof payload.message !== 'string' || payload.message.length > 4096)) return;
        send(payload);
        if (payload.type === 'complete' || payload.type === 'error') stop();
      };
      worker.onerror = event => {
        event.preventDefault();
        send({ type: 'error', runId: activeRunId, message: String(event.message || 'The isolated worker could not start.').slice(0, 4096) });
        stop();
      };
    } catch (error) {
      send({ type: 'error', runId: activeRunId, message: String(error?.message || 'The isolated worker could not start.').slice(0, 4096) });
      stop();
    }
  });
}

export function buildPlaygroundSandboxDocument(nonce) {
  const policy = buildPlaygroundSandboxPolicy(nonce);
  const script = `(${playgroundSandboxBridge.toString()})(${JSON.stringify(playgroundWorkerRuntime.toString())},${JSON.stringify(PYODIDE_BASE_URL)});`;
  return {
    policy,
    html: `<!doctype html><html><head><meta charset="utf-8"><title>SkillBun isolated runner</title></head><body><script nonce="${nonce}">${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`,
  };
}
