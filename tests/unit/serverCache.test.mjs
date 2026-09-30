import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const source = (await readFile(new URL('../../utils/server/redisCache.js', import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');

function harness({ configured = true } = {}) {
  const records = new Map();
  let now = 1000;
  let fail = false;
  const commands = [];
  const read = key => {
    const record = records.get(key);
    return record && (!record.expiresAt || record.expiresAt > now) ? record.value : null;
  };
  function worker() {
    return new Function('crypto', 'NextResponse', 'sanitizeCacheKey', 'getUpstashRedisRestToken', 'getUpstashRedisRestUrl', 'isRedisConfigured', 'fetch', 'Date', 'console',
      `${source}; return { getOrSetCache, setCache, getCache, deleteCache, invalidateCacheTag, invalidateCachePattern, createCachedJsonResponse, inspect: () => ({ memory: memoryL1Cache.size, tags: tagRegistry.size, sources: cacheSourceKeys.size }) };`
    )(crypto, { json: (data, options) => Response.json(data, options) }, value => String(value).replace(/[\r\n\t\0]/g, '').trim().slice(0, 256),
      () => 'test-token', () => 'https://redis.invalid', () => configured,
      async (_url, options) => {
        if (fail) throw new Error('Synthetic Redis outage');
        const [command, ...args] = JSON.parse(options.body);
        commands.push([command, ...args]);
        let result;
        if (command === 'MGET') result = args.map(read);
        else if (command === 'GET') result = read(args[0]);
        else if (command === 'INCR') {
          result = Number(read(args[0]) || 0) + 1;
          records.set(args[0], { value: String(result) });
        } else if (command === 'SETEX') {
          records.set(args[0], { value: args[2], expiresAt: now + Number(args[1]) * 1000 });
          result = 'OK';
        } else if (command === 'DEL') { result = args.reduce((count, key) => count + Number(records.delete(key)), 0); }
        else throw new Error(`Unexpected command ${command}`);
        return { ok: true, json: async () => ({ result }) };
      }, class extends Date { static now() { return now; } }, { warn() {} });
  }
  return { worker, commands, advance: ms => { now += ms; }, outage: value => { fail = value; } };
}

test('a mutation on a fresh worker invalidates another worker memory and shared Redis generations', async () => {
  const app = harness();
  const first = app.worker();
  const mutation = app.worker();
  const options = { tags: ['admin:certs'] };
  assert.deepEqual(await first.getOrSetCache('certificates', 60, async () => ({ revoked: false }), options), { revoked: false });
  await mutation.invalidateCacheTag('admin:certs');
  assert.deepEqual(await first.getOrSetCache('certificates', 60, async () => ({ revoked: true }), options), { revoked: true });
  assert.deepEqual(await app.worker().getOrSetCache('certificates', 60, async () => { throw new Error('Expected shared fresh cache'); }, options), { revoked: true });
  assert.equal(app.commands.filter(([command]) => command === 'INCR').length, 1);
});

test('an old in-flight fetch cannot repopulate the current tag generation after invalidation', async () => {
  const app = harness();
  const reader = app.worker();
  let release;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const options = { tags: ['admin:workforce'] };
  const previous = reader.getOrSetCache('employees', 60, () => { started(); return new Promise(resolve => { release = resolve; }); }, options);
  await startedPromise;
  await app.worker().invalidateCacheTag('admin:workforce');
  release(['deleted-employee']);
  await previous;
  assert.deepEqual(await reader.getOrSetCache('employees', 60, async () => [], options), []);
});

test('Redis revision outages read the source instead of returning stale local data', async () => {
  const app = harness();
  const reader = app.worker();
  const options = { tags: ['admin:analytics'] };
  await reader.getOrSetCache('analytics', 60, async () => 'old', options);
  app.outage(true);
  assert.equal(await reader.getOrSetCache('analytics', 60, async () => 'current', options), 'current');
});

test('swr:false refuses stale memory when Redis is not configured', async () => {
  const app = harness({ configured: false });
  const reader = app.worker();
  await reader.getOrSetCache('strict', 1, async () => 'old', { swr: false });
  app.advance(1100);
  assert.equal(await reader.getOrSetCache('strict', 1, async () => 'fresh', { swr: false }), 'fresh');
});

test('a Redis hit cannot extend source freshness past its original expiry', async () => {
  const app = harness();
  const writer = app.worker();
  const reader = app.worker();
  await writer.getOrSetCache('short-lived', 1, async () => 'old', { swr: false });
  app.advance(900);
  assert.equal(await reader.getOrSetCache('short-lived', 1, async () => 'unused', { swr: false }), 'old');
  app.advance(200);
  assert.equal(await reader.getOrSetCache('short-lived', 1, async () => 'fresh', { swr: false }), 'fresh');
});

test('cache identities remain distinct beyond the legacy sanitizer length cap', async () => {
  const reader = harness({ configured: false }).worker();
  const prefix = 'query:'.padEnd(256, 'x');
  assert.equal(await reader.getOrSetCache(`${prefix}A`, 60, async () => 'first'), 'first');
  assert.equal(await reader.getOrSetCache(`${prefix}B`, 60, async () => 'second'), 'second');
});

test('deleting an original read-through key invalidates it across workers', async () => {
  const app = harness();
  const reader = app.worker();
  await reader.getOrSetCache('specific-key', 60, async () => 'old');
  await app.worker().deleteCache('specific-key');
  assert.equal(await reader.getOrSetCache('specific-key', 60, async () => 'new'), 'new');
});

test('failed invalidation preserves mutation success and replays before reading cache after Redis recovery', async () => {
  const app = harness();
  const reader = app.worker();
  const mutation = app.worker();
  const options = { tags: ['admin:certs'] };
  await reader.getOrSetCache('records', 60, async () => 'old', options);
  app.outage(true);
  assert.equal(await mutation.invalidateCacheTag('admin:certs'), false);
  assert.equal(await mutation.getOrSetCache('records', 60, async () => 'current', options), 'current');
  app.outage(false);
  assert.equal(await mutation.getOrSetCache('records', 60, async () => 'current', options), 'current');
  assert.equal(await reader.getOrSetCache('records', 60, async () => 'unused', options), 'current');
});

test('prefix invalidation still addresses the original read-through key', async () => {
  const reader = harness({ configured: false }).worker();
  await reader.getOrSetCache('search:one', 60, async () => 'old');
  await reader.getOrSetCache('other:one', 60, async () => 'keep');
  await reader.invalidateCachePattern('search:');
  assert.equal(await reader.getOrSetCache('search:one', 60, async () => 'new'), 'new');
  assert.equal(await reader.getOrSetCache('other:one', 60, async () => 'wrong'), 'keep');
});

test('evicting public query entries also removes their tag and source metadata', async () => {
  const reader = harness({ configured: false }).worker();
  for (let index = 0; index < 1100; index++) await reader.getOrSetCache(`search:${index}`, 60, async () => index);
  const sizes = reader.inspect();
  assert.ok(sizes.memory <= 1000);
  assert.ok(sizes.tags <= 1000);
  assert.ok(sizes.sources <= 1000);
});

test('direct cache entries retain tag invalidation after L2 hydration', async () => {
  const app = harness();
  await app.worker().setCache('direct', 'old', 60, ['direct-tag']);
  const reader = app.worker();
  assert.equal(await reader.getCache('direct'), 'old');
  await reader.invalidateCacheTag('direct-tag');
  assert.equal(await app.worker().getCache('direct'), null);
});
