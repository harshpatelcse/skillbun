import DOMPurify from 'dompurify';
import { PLAYGROUND_LIMITS, STATIC_PREVIEW_CSP } from '@/utils/shared/playground.mjs';

export function buildStaticPreviewDocument(code) {
  if (typeof code !== 'string' || code.length > PLAYGROUND_LIMITS.codeCharacters) {
    throw new Error('Keep the preview below 65,536 characters.');
  }
  const sanitized = DOMPurify.sanitize(code, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'frame', 'object', 'embed', 'link', 'base', 'meta', 'form'],
    FORBID_ATTR: ['href', 'xlink:href', 'action', 'formaction', 'target', 'download', 'ping', 'srcdoc', 'srcset'],
  });
  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = STATIC_PREVIEW_CSP;
  document.head.prepend(policy);
  return `<!doctype html>${document.documentElement.outerHTML}`;
}

export function startPlaygroundRun({ language, code, onOutput = () => {}, onReady = () => {} }) {
  let resolveResult;
  let finished = false;
  let frame = null;
  let timer = null;
  let startedAt = null;
  let outputCount = 0;
  let outputCharacters = 0;
  let runId = '';
  const promise = new Promise(resolve => { resolveResult = resolve; });
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener('message', receive);
    if (frame) {
      frame.contentWindow?.postMessage({ type: 'cancel', runId }, '*');
      frame.remove();
      frame = null;
    }
  };
  const finish = (status, message = '') => {
    if (finished) return;
    finished = true;
    cleanup();
    resolveResult({ status, message, durationMs: startedAt === null ? null : Math.round(performance.now() - startedAt) });
  };
  const receive = event => {
    if (finished || event.source !== frame?.contentWindow) return;
    const data = event.data;
    if (!data || data.runId !== runId) return;
    if (data.type === 'ready' && startedAt === null) {
      startedAt = performance.now();
      clearTimeout(timer);
      const limit = language === 'python' ? PLAYGROUND_LIMITS.pythonExecutionMs : PLAYGROUND_LIMITS.javascriptExecutionMs;
      timer = setTimeout(() => finish('timeout', `Execution stopped after ${limit / 1000} seconds. Check for an infinite loop or reduce the work.`), limit);
      onReady();
    } else if (data.type === 'output' && startedAt !== null) {
      if (!['log', 'info', 'warn', 'error', 'result'].includes(data.kind) || typeof data.message !== 'string') return;
      outputCount += 1;
      outputCharacters += data.message.length;
      if (data.message.length > PLAYGROUND_LIMITS.messageCharacters || outputCount > PLAYGROUND_LIMITS.outputMessages || outputCharacters > PLAYGROUND_LIMITS.outputCharacters) {
        finish('error', 'Output limit reached. Reduce the amount of console output and run again.');
        return;
      }
      onOutput(data.kind, data.message);
    } else if (data.type === 'complete' && startedAt !== null) {
      finish('complete');
    } else if (data.type === 'error') {
      finish('error', typeof data.message === 'string' ? data.message.slice(0, PLAYGROUND_LIMITS.messageCharacters) : 'The isolated runtime failed.');
    }
  };

  if (!['javascript', 'python'].includes(language) || typeof code !== 'string' || code.length > PLAYGROUND_LIMITS.codeCharacters) {
    finish('error', 'Choose a supported runtime and keep code below 65,536 characters.');
    return { promise, cancel: () => {} };
  }

  try {
    runId = crypto.randomUUID();
    frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Isolated code execution';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.referrerPolicy = 'no-referrer';
    frame.src = '/api/playground/sandbox';
    frame.onload = () => {
      if (!finished) frame.contentWindow?.postMessage({ type: 'run', runId, language, code }, '*');
    };
    frame.onerror = () => finish('error', 'The isolated runtime could not load. Check your connection and try again.');
    window.addEventListener('message', receive);
    const startupMs = language === 'python' ? PLAYGROUND_LIMITS.pythonStartupMs : PLAYGROUND_LIMITS.javascriptStartupMs;
    timer = setTimeout(() => finish('timeout', language === 'python'
      ? 'Python could not initialize in time. Its pinned WebAssembly download may be unavailable; check your connection and retry.'
      : 'The isolated JavaScript runtime could not initialize in time.'), startupMs);
    document.body.appendChild(frame);
  } catch {
    finish('error', 'This browser could not create the isolated runtime.');
  }
  return { promise, cancel: () => finish('cancelled', 'Execution stopped.') };
}
