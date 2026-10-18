/** Read untrusted bodies with a byte budget and a deadline, including chunked requests. */
export async function readBoundedText(request, { maxBytes = 100_000, timeoutMs = 10_000 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Invalid request body limits.');
  }
  const failure = (message, status) => Object.assign(new Error(message), { status });
  if (Number(request.headers.get('content-length')) > maxBytes) {
    void request.body?.cancel().catch(() => {});
    throw failure('Request body is too large.', 413);
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  let timer;
  let onAbort;
  const interrupted = new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure('Request body timed out.', 408)), timeoutMs);
    onAbort = () => reject(failure('Request body was interrupted.', 400));
    if (request.signal?.aborted) onAbort();
    else request.signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) return Buffer.concat(chunks, bytes).toString('utf8');
      bytes += value.byteLength;
      if (bytes > maxBytes) throw failure('Request body is too large.', 413);
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onAbort);
    // A hostile/stalled producer may never finish cancellation. Do not await it.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readBoundedJson(request, options) {
  return JSON.parse(await readBoundedText(request, options));
}
