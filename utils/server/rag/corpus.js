import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const DIRECTORY = path.join(process.cwd(), 'public', 'data', 'roadmaps');
const FILE_PATTERN = /^[a-z][a-z0-9_-]{0,79}\.json$/;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DOCUMENTS = 1200;
const LOAD_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const caches = new WeakMap();
const defaultCache = new Map();

// These are product rules, not generated claims or inferred student activity.
const PLATFORM_FACTS = [
  ['discovery', 'Career discovery and onboarding', '/onboarding?next=/quiz',
    'SkillBun helps students explore careers. Complete profile details through onboarding, then take the adaptive 10-question career discovery quiz. Its relatable student scenarios ask about preferences and interests, not technical right or wrong answers. Recommendations suggest career roadmaps; they do not guarantee employment.'],
  ['learning', 'Roadmaps and study guides', '/roadmap',
    'SkillBun career roadmaps organize learning topics. Visitors can explore roadmap structure, topic names, videos and article links. Reading a study guide requires signing in. Bun-Bot provides career guidance and learning support. A roadmap is a learning plan, not evidence of a student completing its topics.'],
  ['certification', 'Roadmap certification eligibility and retry rules', '/roadmap',
    'Roadmap certification becomes available at 60% roadmap progress. The assessment has 10 questions: 3 easy, 5 moderate and 2 hard, with 45 seconds per question. Passing requires at least 7 correct answers out of 10 (70%). Two consecutive failed attempts cause a 1-hour study cooldown. At most 3 attempts are allowed per 24-hour window per roadmap. Earned certificates have a public verification page at /certificate/[id].'],
  ['contact', 'SkillBun contact and founder', '/',
    'Harsh Patel is the founder of SkillBun. Human replies and support communications go to harsh@skillbun.tech. The noreply@skillbun.tech address is for outgoing system mail and does not receive replies.'],
  ['salary-estimates', 'Roadmap salary estimate scope', '/roadmap',
    'Roadmap Goal tabs publish indicative SkillBun editorial salary ranges. These are exploration aids, not verified salary surveys or promised offers. USD and India INR figures describe separate markets. The retrieval text omits compensation amounts and cannot verify current salaries.'],
];

function plain(value, maxLength) {
  if (typeof value !== 'string' || value.length > 5000) return '';
  // Validate the complete value before truncation. Data stays data in downstream prompts.
  if (/[<>`*_{}\x00-\x1f\x7f-\x9f]|(?:^|\s)#|\b[a-z][a-z0-9+.-]*:\/\/|\b(?:https?|ftp|file|data|javascript|mailto):|\/\/|www\.|@|\[[^\]]*\]|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|tech|edu|co)(?:\b|\/)|[$₹€£]|\b(?:salary|salaries|compensation|lpa|certifications?|credentials?)\b/i.test(value)) return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
}

function collectTopics(roadmap) {
  const topics = [];
  const seen = new Set();
  let inspected = 0;
  function visit(nodes, depth = 0) {
    if (!Array.isArray(nodes) || depth > 20) return;
    for (const node of nodes) {
      if (++inspected > 2000 || topics.length >= 80) return;
      if (!node || typeof node !== 'object') continue;
      const name = plain(node.name, 70);
      const description = plain(node.description, 120);
      if (node.countInProgress !== false && name && description && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        topics.push({ name, description });
      }
      visit(node.children, depth + 1);
    }
  }
  visit(roadmap.tree);
  if (Array.isArray(roadmap.stages)) for (const stage of roadmap.stages.slice(0, 80)) visit(stage?.topics);
  return topics;
}

function roadmapDocuments(raw, slug) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_FILE_BYTES) return [];
  const roadmap = JSON.parse(raw);
  if (!roadmap || Array.isArray(roadmap) || typeof roadmap !== 'object') return [];
  const title = plain(roadmap.title, 80);
  if (!title) return [];
  const topics = collectTopics(roadmap);
  const description = plain(roadmap.description, 260);
  const summary = plain(roadmap.learn?.summary, 260);
  const objective = plain(roadmap.goal?.objective, 200);
  const terms = [roadmap.goal?.target_roles, roadmap.goal?.career_pillars, roadmap.learn?.key_competencies]
    .flatMap(list => Array.isArray(list) ? list.slice(0, 10).map(value => plain(value, 70)).filter(Boolean) : []);
  if (!topics.length && !description && !summary && !objective) return [];
  const shared = { source: `public/data/roadmaps/${slug}.json`, url: `/roadmap/${slug}`, roadmapSlug: slug, roadmapTitle: title, emailSafe: topics.length > 0 };
  const documents = [{
    ...shared, id: `roadmap:${slug}`, kind: 'roadmap', title, topics: topics.slice(0, 2),
    text: [title, slug.replace(/[_-]/g, ' '), description, summary, objective, terms.join('; ')].filter(Boolean).join('. ').slice(0, 1000),
  }];
  for (let offset = 0; offset < topics.length; offset += 4) {
    const group = topics.slice(offset, offset + 4);
    documents.push({ ...shared, id: `topics:${slug}:${offset / 4}`, kind: 'topics', title: `${title}: ${group.map(topic => topic.name).join(', ')}`.slice(0, 160), topics: group,
      text: `${title} learning topics. ${group.map(topic => `${topic.name}: ${topic.description}`).join(' ')}`.slice(0, 700) });
  }
  return documents;
}

function createCorpus(roadmaps, catalogComplete) {
  const documents = PLATFORM_FACTS.map(([id, title, url, text]) => ({ id: `platform:${id}`, kind: 'platform', source: `skillbun:product:${id}`, url, title, text, emailSafe: false }));
  const catalog = { id: 'platform:catalog', kind: 'platform', source: 'skillbun:product:catalog', url: '/roadmap', title: 'SkillBun career roadmap catalog', text: '', emailSafe: false };
  documents.push(catalog);
  const groups = [...roadmaps.entries()].sort(([a], [b]) => a.localeCompare(b));
  // Include every summary before deeper chunks so the document cap cannot hide a whole career.
  for (const [, group] of groups) if (documents.length < MAX_DOCUMENTS) documents.push(group[0]);
  for (let depth = 1; documents.length < MAX_DOCUMENTS; depth++) {
    let added = false;
    for (const [, group] of groups) if (group[depth] && documents.length < MAX_DOCUMENTS) { documents.push(group[depth]); added = true; }
    if (!added) break;
  }
  documents.sort((a, b) => a.id.localeCompare(b.id));
  const roadmapSlugs = documents.filter(document => document.kind === 'roadmap').map(document => document.roadmapSlug);
  catalogComplete = catalogComplete && roadmapSlugs.length === roadmaps.size;
  catalog.text = catalogComplete
    ? `The public SkillBun catalog currently contains ${roadmapSlugs.length} career roadmaps.`
    : `The available catalog currently includes ${roadmapSlugs.length} loaded career roadmaps. Some catalog files may be unavailable or outside this selection, so this is not a confirmed total.`;
  const version = createHash('sha256').update(JSON.stringify(documents)).digest('hex');
  for (const document of documents) {
    if (document.topics) { document.topics.forEach(Object.freeze); Object.freeze(document.topics); }
    Object.freeze(document);
  }
  return Object.freeze({ documents: Object.freeze(documents), version, roadmapCount: roadmapSlugs.length, roadmapSlugs: Object.freeze(roadmapSlugs), catalogComplete });
}

async function readPublicFile(filename, options) {
  const location = path.join(DIRECTORY, filename);
  const [workspace, directory, resolved, stat] = await Promise.all([fs.realpath(process.cwd()), fs.realpath(DIRECTORY), fs.realpath(location), fs.lstat(location)]);
  // Windows may redirect the workspace itself (for example OneDrive Desktop).
  // Resolve that root first; catalog files must still stay under its public directory.
  if (directory !== path.join(workspace, 'public', 'data', 'roadmaps') || path.dirname(resolved) !== directory || stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Invalid public catalog file');
  return fs.readFile(location, options);
}

/** Central public-only corpus. Injected readers/files are server-side test seams, never request paths. */
export async function loadRagCorpus({ reader, files, force = false } = {}) {
  let cache = defaultCache;
  if (reader) { if (!caches.has(reader)) caches.set(reader, new Map()); cache = caches.get(reader); }
  const selected = files === undefined ? null : [...new Set((Array.isArray(files) ? files : []).filter(file => typeof file === 'string' && FILE_PATTERN.test(file)))].sort();
  const key = selected === null ? '*' : selected.join('|');
  const previous = cache.get(key);
  if (!force && previous && Date.now() < previous.expires) return previous.corpus;
  if (previous?.pending) return previous.pending;
  const entry = previous || {};
  const controller = new AbortController();
  const roadmaps = new Map();
  let timer;
  let failed = false;
  let catalogComplete = false;
  const pending = (async () => {
    try {
      const work = (async () => {
        let names = selected;
        if (names === null) {
          const entries = (await fs.readdir(DIRECTORY, { withFileTypes: true })).filter(file => FILE_PATTERN.test(file.name));
          if (entries.some(file => !file.isFile() || file.isSymbolicLink())) failed = true;
          names = entries.filter(file => file.isFile() && !file.isSymbolicLink()).map(file => file.name).sort();
        }
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(8, names.length) }, async () => {
          while (!controller.signal.aborted && cursor < names.length) {
            const filename = names[cursor++];
            const slug = filename.slice(0, -5);
            try {
              const options = { encoding: 'utf8', signal: controller.signal };
              const raw = await (reader ? reader(path.join(DIRECTORY, filename), options) : readPublicFile(filename, options));
              if (controller.signal.aborted) return;
              const documents = roadmapDocuments(raw, slug);
              if (documents.length) roadmaps.set(slug, documents);
              else failed = true;
            } catch { failed = true; }
          }
        }));
        return names;
      })();
      const names = await Promise.race([work, new Promise(resolve => { timer = setTimeout(() => { failed = true; controller.abort(); resolve(null); }, LOAD_TIMEOUT_MS); })]);
      catalogComplete = !failed && selected === null && names?.length > 0;
      if (failed && entry.roadmaps) {
        const available = names ? new Set(names.map(file => file.slice(0, -5))) : null;
        for (const [slug, documents] of entry.roadmaps) if (!roadmaps.has(slug) && (!available || available.has(slug))) roadmaps.set(slug, documents);
      }
    } catch {
      failed = true;
      if (entry.roadmaps) for (const [slug, documents] of entry.roadmaps) roadmaps.set(slug, documents);
    } finally { clearTimeout(timer); controller.abort(); }
    const corpus = createCorpus(roadmaps, catalogComplete);
    Object.assign(entry, { corpus, roadmaps, expires: Date.now() + (failed ? 20000 : CACHE_TTL_MS), pending: null });
    return corpus;
  })();
  entry.pending = pending;
  cache.set(key, entry);
  return pending;
}
