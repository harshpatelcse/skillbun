import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { readBoundedJson, readBoundedText } from '../../utils/server/requestBody.mjs';
import { loadAiRoute } from '../fixtures/aiRouteHarness.mjs';

const request = (body, options = {}) => new Request('https://skillbun.tech/api/test', {
  method: 'POST', body, duplex: 'half', ...options,
});

test('JSON body parsing preserves multibyte text split across stream chunks', async () => {
  const value = { name: 'छात्र', message: 'C# or Java', nested: { choice: 2 } };
  const bytes = Buffer.from(JSON.stringify(value));
  let index = 0;
  const stream = new ReadableStream({ pull(controller) {
    if (index === bytes.length) controller.close();
    else controller.enqueue(bytes.subarray(index, ++index));
  } });
  assert.deepEqual(await readBoundedJson(request(stream), { maxBytes: bytes.length }), value);
});

test('chunked bodies enforce actual bytes despite absent or false content length', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let pulls = 0, cancelled = false;
    const stream = new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(64)); },
      cancel() { cancelled = true; },
    });
    await assert.rejects(readBoundedText(request(stream, { headers }), { maxBytes: 100 }), { status: 413 });
    assert.equal(cancelled, true);
    assert.ok(pulls <= 3, 'reader stops before buffering the remaining body');
  }
});

test('an oversized declared length is rejected without reading the body', async () => {
  let read = false, cancelled = false;
  await assert.rejects(readBoundedText({
    headers: new Headers({ 'content-length': '101' }),
    body: { getReader() { read = true; }, async cancel() { cancelled = true; } },
  }, { maxBytes: 100 }), { status: 413 });
  assert.equal(read, false);
  assert.equal(cancelled, true);
});

test('slow request bodies time out without awaiting a stalled cancellation', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } });
  await assert.rejects(readBoundedText(request(stream), { timeoutMs: 20 }), { status: 408 });
  assert.equal(cancelled, true);
});

test('an aborted request cancels its body and malformed JSON is rejected', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const reading = readBoundedText(request(stream, { signal: controller.signal }));
  controller.abort();
  await assert.rejects(reading, { status: 400 });
  assert.equal(cancelled, true);
  await assert.rejects(readBoundedJson(request('{')), SyntaxError);
});

test('AI routes reject oversized streams before provider calls or quota consumption', async () => {
  for (const route of ['gemini', 'counsellor']) {
    const handlers = await loadAiRoute(route, {
      fetch: async () => assert.fail('No provider call for an oversized request'),
      checkServerRateLimit: async () => assert.fail('No quota consumption for an oversized request'),
    });
    const response = await handlers.POST(request('x'.repeat(400_001), {
      headers: { authorization: 'Bearer test', 'x-skillbun-human': 'signed-test-proof' },
    }));
    assert.equal(response.status, 413);
  }
});

test('API handlers cannot regress to buffering unbounded request bodies', async () => {
  const root = new URL('../../app/api/', import.meta.url);
  const files = await readdir(root, { recursive: true });
  for (const file of files.filter(file => /route\.[jt]s$/.test(file))) {
    const source = await readFile(new URL(file.replaceAll('\\', '/'), root), 'utf8');
    assert.doesNotMatch(source, /\b(?:request|req)\.(?:json|text|arrayBuffer|formData)\s*\(/, file);
  }
});
