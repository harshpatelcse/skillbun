import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Read-only external checks. This never edits teaching content or uses credentials.
const input = process.argv[2] || 'docs/audits/live-resource-audit-2026-10-04.json';
const output = process.argv[3] || '.codex-tmp/resource-follow-up.json';
const audit = JSON.parse(fs.readFileSync(input, 'utf8'));
const scopes = new Map();
const latest = audit.followUp?.remaining?.urls;
const scopeRows = latest ? {
  roadmap: latest.filter(row => row.scopes.includes('roadmap')),
  guide: latest.filter(row => row.scopes.includes('guide')),
} : { roadmap: audit.remaining.roadmapUrls, guide: audit.remaining.guideUrls };
for (const [scope, rows] of Object.entries(scopeRows)) {
  for (const row of rows) {
    const entry = scopes.get(row.url) || { url: row.url, scopes: [] };
    if (!entry.scopes.includes(scope)) entry.scopes.push(scope);
    scopes.set(row.url, entry);
  }
}
const pending = [...scopes.values()];
const results = [];
const activeHosts = new Set();
const nextRequest = new Map();
const rateLimitedHosts = new Set();
const startedAt = new Date().toISOString();

function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) {
    throw new Error('Non-public HTTPS destination');
  }
  return url;
}

async function request(value) {
  let url = publicUrl(value);
  const signal = AbortSignal.timeout(10_000);
  for (let redirects = 0; redirects <= 8; redirects++) {
    const response = await fetch(url, {
      method: 'GET', redirect: 'manual', signal,
      headers: { 'User-Agent': 'SkillBun-Resource-Verification/1.0 (+https://skillbun.tech/contact)', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has('location')) {
      await response.body?.cancel();
      url = publicUrl(new URL(response.headers.get('location'), url).href);
      continue;
    }
    let text = '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (text.length < 65_536) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          text += decoder.decode(chunk, { stream: true });
        }
      } finally { await reader.cancel().catch(() => {}); }
    } else await response.body?.cancel();
    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 240) || null;
    const challenge = /just a moment|attention required|verify (you are|you're) human|access denied|security checkpoint/i.test(title || '');
    const softMissing = /\b404\b|page not found|content not found/i.test(title || '');
    return { status: response.status, finalUrl: url.href, title, challenge, softMissing, contentType };
  }
  throw new Error('Too many redirects');
}

async function check(entry) {
  const checkedAt = new Date().toISOString();
  try {
    const first = await request(entry.url);
    let second = null;
    if ([404, 410].includes(first.status) && !first.challenge) {
      await sleep(1000);
      second = await request(entry.url);
    }
    const latest = second || first;
    const outcome = latest.status >= 200 && latest.status < 300 && !latest.challenge && !latest.softMissing ? 'reachable' :
      second && [404, 410].includes(first.status) && [404, 410].includes(second.status) && !second.challenge ? 'missing-on-two-gets' :
        latest.challenge || [401, 403, 429].includes(latest.status) ? 'host-restricted' : 'inconclusive';
    return { ...entry, checkedAt, outcome, ...latest, ...(second ? { firstStatus: first.status, attempts: 2 } : { attempts: 1 }) };
  } catch (error) {
    return { ...entry, checkedAt, outcome: 'inconclusive', error: error.name, reason: error.cause?.code || error.message };
  }
}

function persist() {
  const counts = {};
  for (const row of results) counts[row.outcome] = (counts[row.outcome] || 0) + 1;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({
    startedAt, updatedAt: new Date().toISOString(), sourceAudit: input, sourceCheckedOn: audit.checkedOn,
    totalUniqueUrls: scopes.size, checked: results.length, pending: scopes.size - results.length, counts,
    limits: ['HTTP reachability does not prove lesson quality, access after login, or regional video playback.',
      'Host restrictions are retained as unresolved; the checker does not bypass them.',
      'Guide URLs may be illustrative code examples; inspect their context before changing content.'],
    results: [...results].sort((a, b) => a.url.localeCompare(b.url)),
  }, null, 2) + '\n');
  return counts;
}

persist();
await Promise.all(Array.from({ length: 6 }, async () => {
  while (pending.length) {
    const index = pending.findIndex(row => {
      const host = new URL(row.url).hostname;
      return !activeHosts.has(host) && Date.now() >= (nextRequest.get(host) || 0);
    });
    if (index < 0) { await sleep(200); continue; }
    const [entry] = pending.splice(index, 1);
    const host = new URL(entry.url).hostname;
    activeHosts.add(host);
    const row = rateLimitedHosts.has(host) ? { ...entry, checkedAt: new Date().toISOString(), outcome: 'deferred-rate-limit' } : await check(entry);
    if (row.status === 429) rateLimitedHosts.add(host);
    results.push(row);
    activeHosts.delete(host);
    nextRequest.set(host, Date.now() + 1000);
    if (results.length % 25 === 0) console.log(JSON.stringify({ checked: results.length, total: scopes.size, counts: persist() }));
  }
}));
console.log(JSON.stringify({ complete: true, checked: results.length, counts: persist(), output }));
