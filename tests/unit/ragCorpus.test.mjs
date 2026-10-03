import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { loadRagCorpus } from '../../utils/server/rag/corpus.js';
import { tokenize, createLexicalIndex, searchLexical, reciprocalRankFusion } from '../../utils/server/rag/lexical.js';

const topic = (name = 'Semantic HTML', description = 'Choose an HTML element that describes the meaning of the content.') => ({ name, description });
const roadmap = (title = 'Frontend Developer') => ({ title, description: 'Build accessible interfaces for the web.', stages: [{ topics: [topic(), topic('CSS layout', 'Arrange page elements using CSS flexbox and grid.')] }] });
const onlyRoadmaps = result => result.documents.filter(document => document.kind !== 'platform');

test('corpus reads only valid fixed public basenames and strips unrelated data', async () => {
  const calls = [];
  const result = await loadRagCorpus({ files: ['frontend.json', '../private.json', 'tree/file.json', 'C:\\private.json', 'docs.sbv', '.hidden.json', 'frontend.json'], reader: async (file, options) => {
    calls.push(file);
    assert.equal(options.encoding, 'utf8');
    assert.ok(options.signal instanceof AbortSignal);
    return JSON.stringify({ ...roadmap(), id: 'secret-id', salary: '$100000', boost: { certifications: ['SECRET'] }, guide: 'SECRET GUIDE', email: 'private@example.com', stages: [{ topics: [{ ...topic(), resources: [{ url: 'https://private.example' }], quiz: 'SECRET ANSWER' }] }] });
  } });
  assert.deepEqual(calls, [path.join(process.cwd(), 'public/data/roadmaps/frontend.json')]);
  assert.equal(result.roadmapCount, 1);
  assert.deepEqual(result.roadmapSlugs, ['frontend']);
  assert.equal(result.catalogComplete, false);
  assert.doesNotMatch(JSON.stringify(onlyRoadmaps(result)), /SECRET|private|salary|certification|secret-id/);
  assert.equal(onlyRoadmaps(result)[0].url, '/roadmap/frontend');
  assert.match(result.documents.find(document => document.id === 'platform:catalog').text, /not a confirmed total/);
});

test('tree and legacy topics produce deterministic chunks without grouping labels', async () => {
  const data = { ...roadmap(), format: 'tree', stages: undefined, tree: [{ name: 'Private grouping label', description: 'A container only.', countInProgress: false, children: [topic(), topic(), topic('C# and .NET', 'Build services using C# with .NET and SQL.')] }, ...Array.from({ length: 7 }, (_, index) => topic(`Topic ${index}`, `Learn and practice this public concept ${index}.`))] };
  const reader = async () => JSON.stringify(data);
  const result = await loadRagCorpus({ reader, files: ['frontend.json'] });
  const chunks = result.documents.filter(document => document.kind === 'topics');
  assert.equal(chunks.length, 3);
  assert.equal(chunks.flatMap(document => document.topics).length, 9);
  assert.doesNotMatch(JSON.stringify(chunks), /Private grouping label/);
  assert.ok(chunks.every(document => document.text.length <= 700 && document.topics.length <= 4));
  assert.ok(chunks.flatMap(document => document.topics).some(item => item.name === 'C# and .NET'));
  assert.equal(result.version, (await loadRagCorpus({ reader, files: ['frontend.json'], force: true })).version);
  assert.ok(Object.isFrozen(result.documents) && Object.isFrozen(chunks[0].topics[0]));
});

test('corpus rejects unsafe complete fields before truncation', async () => {
  for (const unsafe of ['<b>text</b>', '**bold**', '_emphasis_', '[label](link)', 'https:example.com', '//example.com', 'person@example.com', 'example.com', 'file:///secret', '{{name}}', 'line\nline', 'hidden\x00value', 'Salary detail', 'Earn $90000', 'Credential details', `${'Clean '.repeat(120)}<script>suffix</script>`]) {
    const data = { ...roadmap(), stages: [{ topics: [topic(unsafe), topic('Unsafe topic', unsafe), topic()] }] };
    const result = await loadRagCorpus({ files: ['frontend.json'], reader: async () => JSON.stringify(data) });
    const chunk = result.documents.find(document => document.kind === 'topics');
    assert.deepEqual(chunk.topics, [topic()], unsafe);
  }
});

test('missing corrupt oversized and unusable files fail independently', async () => {
  const result = await loadRagCorpus({ files: ['missing.json', 'corrupt.json', 'oversized.json', 'empty.json', 'frontend.json'], reader: async file => {
    if (file.endsWith('missing.json')) throw new Error('ENOENT');
    if (file.endsWith('corrupt.json')) return '{';
    if (file.endsWith('oversized.json')) return ' '.repeat(1024 * 1024 + 1);
    if (file.endsWith('empty.json')) return '{}';
    return JSON.stringify(roadmap());
  } });
  assert.deepEqual(result.roadmapSlugs, ['frontend']);
  assert.equal(result.catalogComplete, false);
  assert.ok(result.documents.some(document => document.id === 'platform:certification'));
  const missing = await loadRagCorpus({ files: ['frontend.json'], reader: async () => { throw new Error('Offline'); } });
  assert.equal(missing.roadmapCount, 0);
  assert.equal(missing.documents.filter(document => document.kind === 'platform').length, 6);
  assert.match(missing.documents.find(document => document.id === 'platform:salary-estimates').text, /indicative.*editorial salary ranges/i);
});

test('filesystem reads reject symlinks, escaped real paths and oversized files before reading', async t => {
  const directory = path.join(process.cwd(), 'public/data/roadmaps');
  let unsafe = 'symlink';
  t.mock.method(fs, 'realpath', async location => location === directory ? directory : unsafe === 'escape' ? path.join(process.cwd(), 'content/docs/blocked.json') : location);
  t.mock.method(fs, 'lstat', async () => ({ isFile: () => true, isSymbolicLink: () => unsafe === 'symlink', size: unsafe === 'oversized' ? 1024 * 1024 + 1 : 200 }));
  t.mock.method(fs, 'readFile', () => assert.fail('Unsafe catalog paths must never be read'));
  for (unsafe of ['symlink', 'escape', 'oversized']) {
    const result = await loadRagCorpus({ files: ['blocked.json'], force: true });
    assert.equal(result.roadmapCount, 0);
    assert.equal(result.catalogComplete, false);
  }
});

test('fresh cache avoids reads, forced refresh changes version, failed refresh retains previous public data', async t => {
  let time = 1000;
  t.mock.method(Date, 'now', () => time);
  let reads = 0;
  let title = 'Original frontend roadmap';
  let fail = false;
  const reader = async () => { reads++; if (fail) throw new Error('Offline'); return JSON.stringify(roadmap(title)); };
  const options = { reader, files: ['frontend.json'] };
  const first = await loadRagCorpus(options);
  title = 'Changed frontend roadmap';
  assert.equal(await loadRagCorpus(options), first);
  assert.equal(reads, 1);
  time += 5 * 60 * 1000 + 1;
  const refreshed = await loadRagCorpus(options);
  assert.notEqual(first.version, refreshed.version);
  fail = true;
  const retained = await loadRagCorpus({ ...options, force: true });
  assert.equal(retained.version, refreshed.version);
  assert.equal(retained.roadmapCount, 1);
});

test('a redirected workspace root remains usable without allowing the catalog to escape it', async t => {
  const canonicalRoot = path.join(path.parse(process.cwd()).root, 'canonical-workspace');
  t.mock.method(fs, 'realpath', async location => path.join(canonicalRoot, path.relative(process.cwd(), location)));
  t.mock.method(fs, 'lstat', async () => ({ isFile: () => true, isSymbolicLink: () => false, size: 200 }));
  t.mock.method(fs, 'readFile', async () => JSON.stringify(roadmap()));
  const result = await loadRagCorpus({ files: ['redirected.json'], force: true });
  assert.deepEqual(result.roadmapSlugs, ['redirected']);
});

test('concurrent corpus loads share work and never read more than eight files at once', async () => {
  let active = 0;
  let peak = 0;
  let reads = 0;
  const reader = async () => { reads++; active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve)); active--; return JSON.stringify(roadmap()); };
  const options = { reader, files: Array.from({ length: 25 }, (_, index) => `roadmap_${index}.json`) };
  const [first, second] = await Promise.all([loadRagCorpus(options), loadRagCorpus(options)]);
  assert.equal(first, second);
  assert.equal(reads, 25);
  assert.equal(peak, 8);
});

test('total retrieval timeout returns partial results even for readers that ignore abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const pending = loadRagCorpus({ files: ['frontend.json', 'slow.json'], reader: (file, options) => {
    signals.push(options.signal);
    return file.endsWith('frontend.json') ? JSON.stringify(roadmap()) : new Promise(() => {});
  } });
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(2000);
  const result = await pending;
  assert.deepEqual(result.roadmapSlugs, ['frontend']);
  assert.equal(result.catalogComplete, false);
  assert.ok(signals.every(signal => signal.aborted));
});

test('large catalogs keep every summary within a 1200-document total budget', async () => {
  const data = { title: 'Public career roadmap', stages: [{ topics: Array.from({ length: 80 }, (_, index) => topic(`Public concept ${index}`, `Public learning details for concept ${index}.`)) }] };
  const result = await loadRagCorpus({ files: Array.from({ length: 100 }, (_, index) => `roadmap_${index}.json`), reader: async () => JSON.stringify(data) });
  assert.equal(result.documents.length, 1200);
  assert.equal(result.roadmapCount, 100);
  assert.ok(result.documents.filter(document => document.kind === 'topics').every(document => document.text.length <= 700));
});

test('technical tokenization retains C++, C#, Node.js and .NET and modest Hinglish stopwords', () => {
  assert.deepEqual(tokenize('Mujhe C++ C# Node.js .NET SQL AI/ML ke baare mein'), ['c++', 'c#', 'node.js', '.net', 'sql', 'ai', 'ml', 'baare']);
  assert.deepEqual(tokenize(null), []);
});

test('BM25 ranks exact technical matches and reports query coverage', () => {
  const documents = [
    { id: 'cpp', title: 'C++ programming', text: 'Use C++ memory management and systems programming.' },
    { id: 'dotnet', title: 'C# and .NET', text: 'Build a web API with C# and SQL.' },
    { id: 'frontend', title: 'Frontend', text: 'Build a web interface with HTML and CSS.' },
  ];
  const index = createLexicalIndex([...documents, documents[0]]);
  assert.equal(index.entries.size, 3);
  assert.equal(searchLexical(index, 'C++')[0].document.id, 'cpp');
  const result = searchLexical(index, 'C# SQL');
  assert.equal(result[0].document.id, 'dotnet');
  assert.equal(result[0].coverage, 1);
  assert.deepEqual(result[0].matchedTerms, ['c#', 'sql']);
  assert.deepEqual(searchLexical(index, 'unmatchedword'), []);
  assert.deepEqual(searchLexical(index, 'the and'), []);
});

test('RRF promotes overlapping results, deduplicates each list and is deterministic', () => {
  const document = id => ({ id, text: id });
  const a = { document: document('a'), score: 80 };
  const b = { document: document('b'), score: 30 };
  const c = { document: document('c'), score: 0.9 };
  const result = reciprocalRankFusion([[a, b], [c, b]]);
  assert.equal(result[0].document.id, 'b');
  assert.ok(result.every(entry => entry.score > 0 && entry.score <= 1));
  assert.deepEqual(reciprocalRankFusion([[a, a, b], [c, b]]), result);
  assert.deepEqual(reciprocalRankFusion([[a, b]], { limit: 1 }).map(entry => entry.document.id), ['a']);
  assert.deepEqual(reciprocalRankFusion([]), []);
});
