import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { normalizeInternalPath } from '../../utils/shared/routes.js';

const home = await fs.readFile(new URL('../../app/page.jsx', import.meta.url), 'utf8');

test('homepage quiz navigation still works when browser storage is blocked', () => {
  const handler = home.match(/const openAuthModal = \(destination\) => \{([\s\S]*?)\n  \};/)[1];
  const destinations = [];
  const navigate = new Function('destination', 'localStorage', 'router', 'normalizeInternalPath', handler);
  navigate('/quiz', { setItem() { throw new Error('Storage unavailable'); } }, { push: path => destinations.push(path) }, normalizeInternalPath);
  assert.deepEqual(destinations, ['/auth?next=%2Fquiz']);
});

test('homepage decorative text uses the final words without timers for reduced motion', () => {
  const animation = home.slice(home.indexOf('const shuffleTimeouts'), home.indexOf('// Floating code snippets'));
  const elements = ['Career', 'Success'].map(word => ({ getAttribute: () => word, innerText: '' }));
  const timers = [];
  new Function('window', 'document', 'setInterval', 'clearInterval', animation)(
    { location: { search: '' }, matchMedia: () => ({ matches: true }), setTimeout: callback => timers.push(callback) },
    { querySelectorAll: () => elements }, () => assert.fail('Reduced motion started an interval'), () => {},
  );
  assert.deepEqual(elements.map(element => element.innerText), ['Career', 'Success']);
  assert.equal(timers.length, 0);
});

test('search Connect with us navigates to an existing contact page', async () => {
  const cacheKeys = [];
  let source = await fs.readFile(new URL('../../app/api/search/route.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*\r?\n/gm, '').replace('export async function GET', 'async function GET');
  const GET = new Function('fs', 'path', 'process', 'NextResponse', 'validateString', 'sanitizeCacheKey', 'getOrSetCache', `${source}; return GET;`)(
    { readdirSync: () => [] }, { join: (...parts) => parts.join('/') }, { cwd: () => '/site' },
    { json: (data, options) => ({ data, options }) }, () => ({ isValid: true }), value => value,
    async (key, _ttl, build) => { cacheKeys.push(key); return build(); },
  );
  const response = await GET({ url: 'https://skillbun.tech/api/search?q=connect' });
  assert.equal(response.data.pages[0].href, '/contact');
  assert.deepEqual(cacheKeys, ['sb:search:v2:connect']);
  await fs.access(new URL('../../app/contact/page.jsx', import.meta.url));
});
