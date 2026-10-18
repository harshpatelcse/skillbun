import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the production limiter with isolated infrastructure adapters. Nothing
// imports Firebase credentials, opens a socket or contacts an external service.
const source = (await readFile(new URL('../../utils/server/rateLimitStore.js', import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '')
  .replace(/^export /gm, '');

function setup({ redis = false, firestore = false, firestoreFailure = false, environment = 'production' } = {}) {
  const controls = { redis, firestore, firestoreFailure };
  const records = new Map();
  const requests = [];
  let databaseReads = 0;
  let queue = Promise.resolve();
  let redisCount = 0;
  const db = {
    collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }),
    runTransaction(callback) {
      const run = queue.then(async () => {
        if (controls.firestoreFailure) throw new Error('Firestore unavailable');
        const pending = new Map(records);
        const result = await callback({
          get: async ref => ({ exists: pending.has(ref.path), data: () => pending.get(ref.path) }),
          set: (ref, data) => pending.set(ref.path, data),
        });
        records.clear();
        for (const [path, record] of pending) records.set(path, record);
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  const check = vm.runInNewContext(`${source}\ncheckServerRateLimit;`, {
    crypto, AbortController, setTimeout, clearTimeout,
    process: { env: { NODE_ENV: environment } },
    console: { warn() {}, error() {} },
    isRedisConfigured: () => Boolean(controls.redis),
    getUpstashRedisRestUrl: () => 'https://limiter.invalid',
    getUpstashRedisRestToken: () => 'test-only-token',
    getFirebaseAdminFirestore: () => { databaseReads++; return controls.firestore ? db : null; },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (controls.redis === 'down') throw new Error('Redis unavailable');
      if (controls.redis === 'malformed') return { ok: true, json: async () => [{ error: 'Counter failed' }] };
      if (controls.redis === 'http-failure') return { ok: false, status: 503 };
      assert.equal(controls.redis, 'ok', 'an unconfigured test must never issue a Redis request');
      redisCount++;
      const operations = JSON.parse(options.body);
      return { ok: true, json: async () => operations.map(operation => ({ result: [redisCount, Number(operation[4])] })) };
    },
  });
  return {
    controls, requests, records,
    get databaseReads() { return databaseReads; },
    check: overrides => check({
      namespace: 'signup-regression',
      subject: '192.0.2.10',
      limits: [{ name: 'minute', maxRequests: 1, windowMs: 60_000 }],
      now: 1_000_000,
      ...overrides,
    }),
  };
}

test('requiring shared rate limits rejects an absent Firestore and Redis backend', async () => {
  const app = setup();
  await assert.rejects(app.check({ requireDistributed: true }), /Distributed rate limiting is unavailable/);
  assert.equal(app.requests.length, 0);
  assert.equal(app.records.size, 0);
});

test('requiring shared rate limits rejects transaction failure instead of granting a memory allowance', async () => {
  const app = setup({ firestore: true, firestoreFailure: true });
  await assert.rejects(app.check({ requireDistributed: true }), /Distributed rate limiting is unavailable/);
  await assert.rejects(app.check({ requireDistributed: true }), /Distributed rate limiting is unavailable/);
  assert.equal(app.records.size, 0);
});

test('offline development retains the bounded memory fallback', async () => {
  for (const options of [{}, { firestore: true, firestoreFailure: true }]) {
    const app = setup({ ...options, environment: 'development' });
    assert.equal((await app.check()).allowed, true);
    const denied = await app.check();
    assert.equal(denied.allowed, false);
    assert.equal(denied.retryAfterMs, 60_000);
  }
});

test('production callers default to shared enforcement during a backend outage', async () => {
  for (const options of [{}, { redis: 'down', firestore: true, firestoreFailure: true }]) {
    const app = setup(options);
    await assert.rejects(app.check(), /Distributed rate limiting is unavailable/);
    assert.equal(app.records.size, 0);
  }
});

test('a healthy Redis decision enforces the limit without touching Firestore', async () => {
  const app = setup({ redis: 'ok', firestore: true });
  assert.equal((await app.check({ requireDistributed: true })).allowed, true);
  const denied = await app.check({ requireDistributed: true });
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterMs, 60_000);
  assert.equal(app.databaseReads, 0);
  assert.equal(app.requests.length, 2);
  const operations = JSON.parse(app.requests[0].options.body);
  assert.equal(operations.length, 1);
  assert.equal(operations[0][0], 'EVAL', 'counter increment and expiry must be one Redis operation');
  assert.match(operations[0][1], /INCR/);
  assert.match(operations[0][1], /PEXPIRE/);
  assert.ok(!operations[0][3].includes('192.0.2.10'), 'Redis keys must hash rate-limit subjects');
});

test('Redis network, malformed and HTTP failures fall back to shared Firestore counters', async () => {
  for (const redis of ['down', 'malformed', 'http-failure']) {
    const app = setup({ redis, firestore: true });
    assert.equal((await app.check({ requireDistributed: true })).allowed, true);
    assert.equal((await app.check({ requireDistributed: true })).allowed, false);
    assert.equal(app.databaseReads, 2);
    assert.equal(app.records.size, 1);
    assert.equal([...app.records.values()][0].count, 1);
  }
});

test('shared-store outages remain closed after Redis fallback fails', async () => {
  for (const options of [
    { redis: 'down' },
    { redis: 'malformed', firestore: true, firestoreFailure: true },
  ]) {
    const app = setup(options);
    await assert.rejects(app.check({ requireDistributed: true }), /Distributed rate limiting is unavailable/);
    assert.equal(app.records.size, 0);
  }
});

test('parallel shared Firestore requests cannot oversubscribe a one-request allowance', async () => {
  const app = setup({ firestore: true });
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => app.check({ requireDistributed: true })));
  assert.equal(outcomes.filter(result => result.allowed).length, 1);
  assert.equal(outcomes.filter(result => !result.allowed).length, 7);
  assert.equal([...app.records.values()][0].count, 1);
});

test('Retry-After covers the longest exhausted window for Redis, Firestore and memory limits', async () => {
  const limits = [
    { name: 'minute', maxRequests: 1, windowMs: 60_000 },
    { name: 'hour', maxRequests: 1, windowMs: 3_600_000 },
    { name: 'day', maxRequests: 1, windowMs: 86_400_000 },
  ];
  for (const options of [{ redis: 'ok' }, { firestore: true }, {}]) {
    for (const orderedLimits of [limits, limits.toReversed()]) {
      const app = setup(options);
      const input = { limits: orderedLimits, requireDistributed: Boolean(options.redis || options.firestore) };
      assert.equal((await app.check(input)).allowed, true);
      const denied = await app.check(input);
      assert.equal(denied.allowed, false);
      assert.equal(denied.retryAfterMs, 86_400_000);
      assert.equal(denied.limitName, 'day');
    }
  }
});
