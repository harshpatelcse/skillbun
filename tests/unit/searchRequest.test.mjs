import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { startSearchRequest, nextSearchIndex } from '../../utils/client/searchRequest.mjs';

const empty = { pages: [], roadmaps: [] };

test('search encodes input, bypasses old release caches and delivers the current result', async () => {
  const result = await new Promise((resolve, reject) => {
    startSearchRequest({ query: 'data & AI', delay: 0, onResult: resolve, onError: reject,
      fetchImpl: async (url, options) => {
        assert.equal(url, '/api/search?q=data%20%26%20AI&v=2');
        assert.ok(options.signal instanceof AbortSignal);
        return { ok: true, json: async () => empty };
      },
    });
  });
  assert.deepEqual(result, empty);
});

test('closing during debounce prevents the request', async () => {
  let calls = 0;
  const cancel = startSearchRequest({ query: '', delay: 10, fetchImpl: () => calls++, onResult: () => calls++, onError: () => calls++ });
  cancel();
  await wait(25);
  assert.equal(calls, 0);
});

test('a stale response cannot replace the newest results even if fetch ignores abort', async () => {
  const seen = [];
  let releaseOld;
  let oldSignal;
  const started = new Promise((resolve) => {
    const cancel = startSearchRequest({ query: 'old', delay: 0,
      fetchImpl: (_url, { signal }) => {
        oldSignal = signal;
        resolve(cancel);
        return new Promise((release) => { releaseOld = release; });
      }, onResult: () => seen.push('old'), onError: () => seen.push('old-error'),
    });
  });
  const cancel = await started;
  cancel();
  assert.equal(oldSignal.aborted, true);
  await new Promise((resolve, reject) => {
    startSearchRequest({ query: 'new', delay: 0,
      fetchImpl: async () => ({ ok: true, json: async () => empty }),
      onResult: () => { seen.push('new'); resolve(); }, onError: reject,
    });
  });
  releaseOld({ ok: true, json: async () => empty });
  await wait(0);
  assert.deepEqual(seen, ['new']);
});

test('cancellation during JSON decoding prevents stale success and failure callbacks', async () => {
  for (const fail of [false, true]) {
    let releaseJson;
    let calls = 0;
    let cancel;
    await new Promise((started) => {
      cancel = startSearchRequest({ query: 'old', delay: 0,
        fetchImpl: async () => ({ ok: true, json: () => {
          started();
          return new Promise((resolve, reject) => { releaseJson = () => fail ? reject(new Error('decode')) : resolve(empty); });
        } }), onResult: () => calls++, onError: () => calls++,
      });
    });
    cancel();
    releaseJson();
    await wait(0);
    assert.equal(calls, 0);
  }
});

test('failed and malformed responses produce a usable error state', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ pages: null }) }]) {
    const error = await new Promise((resolve, reject) => {
      startSearchRequest({ query: 'test', delay: 0, fetchImpl: async () => response,
        onResult: () => reject(new Error('Unexpected results')), onError: resolve });
    });
    assert.ok(error instanceof Error);
  }
});

test('keyboard selection wraps safely and never selects an empty list', () => {
  assert.equal(nextSearchIndex('ArrowDown', -1, 3), 0);
  assert.equal(nextSearchIndex('ArrowUp', -1, 3), 2);
  assert.equal(nextSearchIndex('ArrowDown', 2, 3), 0);
  assert.equal(nextSearchIndex('ArrowUp', 0, 3), 2);
  assert.equal(nextSearchIndex('ArrowDown', -1, 0), -1);
});
