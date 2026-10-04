import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Read-only HTTP checks. No sign-in, provider keys, analytics or user data needed.
const baseUrl = new URL(process.argv[2] || 'http://127.0.0.1:3000');
const canonicalOrigin = new URL(process.argv[3] || 'https://skillbun.tech').origin;
const roadmapSlugs = fs.readdirSync(path.join(process.cwd(), 'public/data/roadmaps'))
  .filter((name) => /^[a-z0-9_]+\.json$/.test(name))
  .map((name) => name.replace(/\.json$/, ''));
let checks = 0;
const failures = [];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function decode(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], decode(match[2])]));
}

function meta(html, name) {
  return [...html.matchAll(/<meta\b[^>]*>/g)]
    .map(([tag]) => attributes(tag)).find((attrs) => attrs.name === name || attrs.property === name)?.content || '';
}

async function get(route, userAgent = 'Bingbot') {
  const response = await fetch(new URL(route, baseUrl), {
    headers: { 'User-Agent': userAgent },
    redirect: 'manual',
    signal: AbortSignal.timeout(60000),
  });
  return { response, html: await response.text() };
}

const { response: sitemapResponse, html: sitemap } = await get('/sitemap.xml');
assert.equal(sitemapResponse.status, 200, 'Sitemap must return HTTP 200');
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => decode(url));
check(locations.length > roadmapSlugs.length, 'Sitemap includes public pages and roadmap catalog');
check(new Set(locations).size === locations.length, 'Sitemap URLs are unique');
for (const url of locations) check(new URL(url).origin === canonicalOrigin, `Canonical origin in sitemap: ${url}`);
for (const route of ['/', '/career-guidance', '/roadmap', '/projects', '/certificate', ...roadmapSlugs.map((slug) => `/roadmap/${slug}`)]) {
  check(locations.some((url) => new URL(url).pathname === route), `Sitemap includes ${route}`);
}
const privatePaths = ['/auth', '/onboarding', '/quiz', '/counsellor', '/dashboard', '/settings', '/alumni', '/coming-soon', '/roadmap/frontend/certify', '/certificate/SKB2345-67-89-ABCD'];
for (const route of privatePaths) check(!locations.some((url) => new URL(url).pathname === route), `Sitemap excludes ${route}`);

const { response: robotsResponse, html: robots } = await get('/robots.txt');
check(robotsResponse.status === 200, 'Robots returns HTTP 200');
check(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`), 'Robots advertises canonical sitemap');
check(!/^Disallow:\s*\/\s*$/m.test(robots), 'Public site is crawlable');
check(!/^Disallow:\s*\/dashboard\/?\s*$/m.test(robots), 'Bots can read dashboard noindex');

const titles = new Set();
const descriptions = new Set();
const queue = locations.map((url) => new URL(url).pathname);
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const route = queue.shift();
    try {
      const { response, html } = await get(route);
      const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
      const title = decode(html.match(/<title>(.*?)<\/title>/s)?.[1] || '');
      const description = meta(html, 'description');
      const canonical = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => attributes(tag)).find((attrs) => attrs.rel === 'canonical')?.href;
      check(response.status === 200, `${route}: HTTP 200`);
      check(Boolean(title) && !titles.has(title), `${route}: unique server-rendered title`);
      check(Boolean(description) && !descriptions.has(description), `${route}: unique description`);
      titles.add(title);
      descriptions.add(description);
      check(Boolean(canonical) && new URL(canonical).href === new URL(route, canonicalOrigin).href, `${route}: self canonical (${canonical})`);
      check(!/noindex/i.test(meta(html, 'robots')), `${route}: indexable`);
      check(!/noindex/i.test(response.headers.get('x-robots-tag') || ''), `${route}: no noindex header`);
      check((markup.match(/<h1\b/g) || []).length === 1, `${route}: one server-rendered H1`);
      check(Boolean(meta(html, 'og:title')) && Boolean(meta(html, 'og:image')), `${route}: social preview`);
      check(meta(html, 'og:url') === canonical, `${route}: social URL matches canonical`);
      const nonce = response.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1];
      const schemas = [...html.matchAll(/<script\b([^>]*type="application\/ld\+json"[^>]*)>([\s\S]*?)<\/script>/g)];
      check(schemas.length > 0, `${route}: server-rendered structured data`);
      for (const [, attrs, value] of schemas) {
        JSON.parse(value);
        check(!nonce || attributes(attrs).nonce === nonce, `${route}: structured data uses request nonce`);
      }
      if (route === '/roadmap') {
        const links = [...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(([, href]) => decode(href));
        for (const slug of roadmapSlugs) check(links.includes(`/roadmap/${slug}`), `Directory links ${slug} without JavaScript`);
        check(links.includes('/career-guidance'), 'Directory links career guidance');
      }
      if (route.startsWith('/roadmap/')) {
        check(schemas.some(([, , value]) => value.includes('"LearningResource"')), `${route}: learning resource schema`);
        check(schemas.some(([, , value]) => value.includes('"BreadcrumbList"')), `${route}: breadcrumb schema`);
      }
    } catch (error) {
      failures.push(`${route}: ${error.message}`);
    }
  }
}));

for (const route of privatePaths) {
  try {
    const { response, html } = await get(route);
    check(response.status === 200, `${route}: app page remains available`);
    check(/noindex/i.test(meta(html, 'robots')), `${route}: private/utility noindex preserved`);
  } catch (error) { failures.push(`${route}: ${error.message}`); }
}
for (const route of ['/roadmap/seo_missing_roadmap', '/seo-missing-page']) {
  const { response } = await get(route);
  check(response.status === 404, `${route}: real HTTP 404`);
}
for (const route of ['/roadmap/frontend?tab=goal', '/roadmap/frontend/boost']) {
  const { html } = await get(route);
  check(html.includes(`rel="canonical" href="${canonicalOrigin}/roadmap/frontend"`), `${route}: canonical collapses tab variant`);
}
for (const agent of ['Mozilla/5.0', 'Googlebot', 'Twitterbot']) {
  const { html } = await get('/career-guidance', agent);
  check(Boolean(meta(html, 'description')), `${agent}: metadata visible without executing JS`);
  check(html.includes('<h1'), `${agent}: guide visible without executing JS`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`${failures.length} failures across ${checks} checks.`);
  process.exitCode = 1;
} else {
  console.log(`SEO checks passed: ${checks} assertions across ${locations.length} public URLs, ${roadmapSlugs.length} roadmap links, private noindex, 404s and canonical variants.`);
}
