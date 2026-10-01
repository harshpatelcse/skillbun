// Read-only release checks. Never prints response bodies, credentials or personal data.
import { readdir } from 'node:fs/promises';
const base = new URL(process.argv.slice(2).find(value => !value.startsWith('--')) || 'http://localhost:3000');
if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Expected an HTTP(S) origin');
const checks = [
  ['/', [200]], ['/privacy', [200]], ['/robots.txt', [200]], ['/sitemap.xml', [200]],
  ...['/about', '/contact', '/terms', '/projects', '/roadmap', '/certificate', '/alumni', '/coming-soon',
    '/auth', '/onboarding?next=/quiz', '/quiz', '/counsellor', '/dashboard', '/dashboard/certifications',
    '/settings', '/dashboard/console/portal', '/dashboard/console/admin', '/dashboard/console/admin/analytics',
    '/dashboard/console/admin/workforce', '/dashboard/console/admin/certificates', '/dashboard/console/admin/documents',
    '/dashboard/console/admin/emails', '/roadmap/fullstack/goal', '/roadmap/fullstack/learn', '/roadmap/fullstack/boost',
    '/roadmap/fullstack/certify'].map(path => [path, [200]]),
  ['/manifest.json', [200]], ['/favicon.ico', [200]],
  ['/api/admin/certificates', [401, 403]],
  ['/api/admin/certificates?adminEmail=harsh%40skillbun.tech', [401, 403]],
  ['/api/alumni/documents?query=audit%40example.test', [401, 403]],
  ['/api/alumni/documents?query=sb%2Faudit%40example.test', [401, 403]],
  ['/api/quiz/questions', [401]], ['/api/docs/frontend_developer/test', [401]],
  ['/api/portal/credentials', [401, 403]], ['/api/admin/workforce/employees', [401, 403]],
  ['/api/admin/workforce/milestones', [401, 403]], ['/api/admin/emails/drafts', [401, 403]],
  ['/api/config', [200]], ['/api/search?q=full', [200]],
  ['/data/quizzes/fullstack.json', [404]], ['/data/%71uizzes/fullstack.json', [404]], ['/data/docs/test.md', [404]],
];
if (process.argv.includes('--all-roadmaps')) {
  for (const file of await readdir(new URL('../public/data/roadmaps/', import.meta.url))) {
    if (file.endsWith('.json')) checks.push([`/roadmap/${encodeURIComponent(file.slice(0, -5))}`, [200]]);
  }
}
let failed = 0;
for (const [path, statuses] of checks) {
  try {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), redirect: 'manual' });
    let okay = statuses.includes(response.status);
    if (path === '/') {
      const csp = response.headers.get('content-security-policy') || '';
      const scripts = csp.split(';').find((item) => item.trim().startsWith('script-src ')) || '';
      okay &&= scripts.includes("'nonce-") && !/unsafe-inline|unsafe-eval/.test(scripts);
      okay &&= /no-store/.test(response.headers.get('cache-control') || '');
    }
    await response.body?.cancel();
    console.log(`${okay ? 'PASS' : 'FAIL'} ${path} HTTP ${response.status}`);
    if (!okay) failed++;
  } catch (error) { failed++; console.log(`FAIL ${path} ${error.name}`); }
}
console.log(`${checks.length - failed}/${checks.length} read-only checks passed`);
process.exitCode = failed ? 1 : 0;
