import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { getStudyGuideResources } from '../../utils/shared/studyGuideResources.js';

const videoId = 'dQw4w9WgXcQ';
const playlistId = 'PL_test-123';
const video = (url, title = 'Video lesson') => ({ type: 'video', title, url });

test('video aliases deduplicate by ID while preserving the first title and source URL', () => {
  const firstUrl = `https://youtu.be/${videoId}?si=tracking&t=1`;
  const resources = [
    video(firstUrl, 'First lesson'),
    video(`https://m.youtube.com/shorts/${videoId}?feature=share`),
    video(`https://www.youtube.com/watch?v=${videoId}&t=30`, 'Duplicate lesson'),
    video(`https://youtube.com/embed/${videoId}#t=90`),
  ];
  const { videos, links } = getStudyGuideResources(resources);
  assert.equal(videos.length, 1);
  assert.deepEqual(links, []);
  assert.equal(videos[0].key, `youtube:video:${videoId}`);
  assert.equal(videos[0].url, firstUrl);
  assert.equal(videos[0].title, 'First lesson');
  assert.equal(videos[0].embedUrl, `https://www.youtube.com/embed/${videoId}?playsinline=1`);
  assert.equal(videos[0].watchUrl, `https://www.youtube.com/watch?v=${videoId}`);
});

test('the AWS foundation guide replaces its private video and embeds the public course without an allowlist', async () => {
  const roadmap = JSON.parse(await fs.readFile(new URL('../../public/data/roadmaps/aws_cloud_engineer.json', import.meta.url), 'utf8'));
  const resources = roadmap.tree.find(node => node.id === 'aws_cloud_engineer_foundations').resources;
  assert.ok(resources.every(resource => !resource.url.includes('ulprqHHWlng')));
  const replacement = getStudyGuideResources(resources).videos.find(entry => entry.key === 'youtube:video:7HKot-brXFE');
  assert.ok(replacement);
  assert.equal(replacement.embedUrl, 'https://www.youtube.com/embed/7HKot-brXFE?playsinline=1');
  assert.equal(replacement.watchUrl, 'https://www.youtube.com/watch?v=7HKot-brXFE');
});

test('trusted YouTube courses become playable videos without reclassifying ordinary course links', () => {
  const { videos, links } = getStudyGuideResources([
    { type: 'course', title: 'Git course', url: 'https://www.youtube.com/watch?v=RGOj5yH7evk' },
    { type: 'course', title: 'JavaScript course', url: 'https://www.youtube.com/watch?v=W6NZfCO5sPU' },
    { type: 'course', title: 'Written course', url: 'https://example.com/course' },
  ]);
  assert.equal(videos.length, 2);
  assert.equal(links.length, 1);
  assert.equal(videos[0].embedUrl, 'https://www.youtube.com/embed/RGOj5yH7evk?playsinline=1');
  assert.equal(videos[1].watchUrl, 'https://www.youtube.com/watch?v=W6NZfCO5sPU');
  assert.equal(links[0].title, 'Written course');
});

test('playlists deduplicate separately from videos carrying a playlist parameter', () => {
  const playlist = `https://youtube.com/playlist?list=${playlistId}`;
  const watch = `https://youtube.com/watch?v=${videoId}&list=${playlistId}`;
  const { videos } = getStudyGuideResources([
    video(playlist),
    video(`https://www.youtube.com/embed/videoseries?list=${playlistId}&index=2`),
    video(`https://m.youtube.com/watch?list=${playlistId}`),
    video(watch),
  ]);
  assert.equal(videos.length, 2);
  assert.equal(videos[0].key, `youtube:playlist:${playlistId}`);
  assert.equal(videos[0].embedUrl, `https://www.youtube.com/embed/videoseries?list=${playlistId}&playsinline=1`);
  assert.equal(videos[0].watchUrl, `https://www.youtube.com/playlist?list=${playlistId}`);
  assert.equal(videos[1].key, `youtube:video:${videoId}`);
  assert.equal(videos[1].embedUrl, `https://www.youtube.com/embed/${videoId}?playsinline=1`);
  assert.equal(videos[1].watchUrl, `https://www.youtube.com/watch?v=${videoId}`);
});

test('deceptive YouTube hosts and nonstandard ports never become embedded players', () => {
  const urls = [
    `https://youtube.com.evil.example/watch?v=${videoId}`,
    `https://evil.example/youtube.com/watch?v=${videoId}`,
    `https://notyoutube.com/watch?v=${videoId}`,
    `https://www.youtu.be/${videoId}`,
    `https://youtube.com:444/watch?v=${videoId}`,
    `https://youtube.com./watch?v=${videoId}`,
  ];
  const { videos } = getStudyGuideResources(urls.map(url => video(url)));
  assert.equal(videos.length, urls.length);
  for (const entry of videos) assert.equal(entry.embedUrl, null);
});

test('unsafe or malformed YouTube IDs remain external without producing iframe URLs', () => {
  const urls = [
    'https://youtube.com/watch?v=short',
    `https://youtube.com/embed/${videoId}/extra`,
    'https://youtube.com/playlist?list=PL%2Finvalid',
    'https://youtu.be/%22onload%3Devil',
    `https://youtube.com/anything?v=${videoId}`,
  ];
  const { videos } = getStudyGuideResources(urls.map(url => video(url)));
  assert.equal(videos.length, urls.length);
  for (const entry of videos) assert.equal(entry.embedUrl, null);
});

test('non-YouTube videos stay accessible as external resources and deduplicate fragments', () => {
  const url = 'https://vimeo.com/123?quality=hd';
  const { videos, links } = getStudyGuideResources([video(`${url}#start`), video(`${url}#end`)]);
  assert.deepEqual(links, []);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].url, url);
  assert.equal(videos[0].key, url);
  assert.equal(videos[0].embedUrl, null);
  assert.equal(videos[0].watchUrl, url);
});

test('articles preserve meaningful paths and queries, remove fragments, and keep their titles', () => {
  const resources = [
    { type: 'article', title: '  Installation guide  ', url: 'https://EXAMPLE.com:443/docs/install?language=en#first' },
    { type: 'article', title: 'Duplicate', url: 'https://example.com/docs/install?language=en#second' },
    { type: 'article', title: 'Spanish version', url: 'https://example.com/docs/install?language=es' },
    { url: 'http://example.com/reference', title: 12 },
  ];
  const { videos, links } = getStudyGuideResources(resources);
  assert.deepEqual(videos, []);
  assert.equal(links.length, 3);
  assert.deepEqual(links[0], {
    url: 'https://example.com/docs/install?language=en',
    title: 'Installation guide',
    host: 'example.com',
    key: 'https://example.com/docs/install?language=en',
  });
  assert.equal(links[1].url, 'https://example.com/docs/install?language=es');
  assert.equal(links[2].title, 'example.com');
});

test('malformed resources and non-HTTP URLs are ignored without throwing', () => {
  const resources = [null, undefined, false, [], 'https://example.com', {},
    { url: 12 }, { url: '' }, { url: '/relative' }, { url: '//example.com/path' },
    { url: 'javascript:alert(1)' }, { url: 'data:text/html,test' }, { url: 'ftp://example.com/file' },
    { url: 'https://' }, { url: 'http:example.com' }, { url: 'https://example.com/a b' },
    { url: 'https://example.com/\npath' }, { url: 'https://example.com\\path' },
    { url: 'https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ' },
  ];
  assert.deepEqual(getStudyGuideResources(resources), { videos: [], links: [] });
  assert.deepEqual(getStudyGuideResources(null), { videos: [], links: [] });
  assert.deepEqual(getStudyGuideResources({}), { videos: [], links: [] });
});

test('normalizing resources does not mutate caller data or reorder unrelated items', () => {
  const url = `https://youtube.com/watch?v=${videoId}`;
  const resources = Object.freeze([
    Object.freeze(video(`https://youtu.be/${videoId}`)),
    Object.freeze(video('https://vimeo.com/456', 'External video')),
    Object.freeze(video(url, 'Duplicate video')),
  ]);
  const { videos } = getStudyGuideResources(resources);
  assert.equal(videos[0].title, 'Video lesson');
  assert.equal(videos[1].title, 'External video');
  assert.equal(resources[0].url, `https://youtu.be/${videoId}`);
});

test('every catalog YouTube resource exposes embedded and external YouTube playback targets', async context => {
  const directory = new URL('../../public/data/roadmaps/', import.meta.url);
  const files = (await fs.readdir(directory)).filter(file => file.endsWith('.json'));
  let checked = 0;
  const walk = (value, file) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(item => walk(item, file)); return; }
    for (const resource of Array.isArray(value.resources) ? value.resources : []) {
      if (typeof resource?.url !== 'string') continue;
      let source;
      try { source = new URL(resource.url); } catch { continue; }
      if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(source.host)) continue;
      const label = `${file}: ${resource.url}`;
      const { videos, links } = getStudyGuideResources([resource]);
      assert.equal(videos.length, 1, label);
      assert.equal(links.length, 0, label);
      const embedded = new URL(videos[0].embedUrl);
      const external = new URL(videos[0].watchUrl);
      assert.equal(embedded.origin, 'https://www.youtube.com', label);
      assert.equal(embedded.searchParams.get('playsinline'), '1', label);
      assert.equal(external.origin, 'https://www.youtube.com', label);
      if (source.pathname === '/playlist') {
        assert.equal(embedded.pathname, '/embed/videoseries', label);
        assert.equal(embedded.searchParams.get('list'), source.searchParams.get('list'), label);
        assert.equal(external.pathname, '/playlist', label);
        assert.equal(external.searchParams.get('list'), source.searchParams.get('list'), label);
      } else {
        assert.match(embedded.pathname, /^\/embed\/[A-Za-z0-9_-]{11}$/, label);
        assert.equal(external.pathname, '/watch', label);
        assert.equal(external.searchParams.get('v'), embedded.pathname.split('/').at(-1), label);
        if (source.pathname === '/watch') assert.equal(external.searchParams.get('v'), source.searchParams.get('v'), label);
      }
      checked += 1;
    }
    for (const [key, child] of Object.entries(value)) if (key !== 'resources') walk(child, file);
  };
  for (const file of files) walk(JSON.parse(await fs.readFile(new URL(file, directory), 'utf8')), file);
  assert.ok(checked > 0, 'The catalog audit must exercise YouTube resources.');
  context.diagnostic(`Validated ${checked} YouTube resources across ${files.length} roadmaps.`);
});

test('every catalog study guide resolves to an existing SBV1 encrypted file', async context => {
  const directory = new URL('../../public/data/roadmaps/', import.meta.url);
  const files = (await fs.readdir(directory)).filter(file => file.endsWith('.json'));
  const references = new Set();
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'doc') {
      assert.match(value.url, /^\/data\/docs\/[a-z0-9_]+\/[A-Za-z0-9_-]+\.md$/);
      references.add(value.url);
    }
    Object.values(value).forEach(child => { if (child && typeof child === 'object') walk(child); });
  };
  for (const file of files) walk(JSON.parse(await fs.readFile(new URL(file, directory), 'utf8')));
  for (const reference of references) {
    const identity = reference.replace('/data/docs/', '').replace(/\.md$/, '');
    const hash = createHash('sha256').update(`sbv1:${identity}`).digest('hex').slice(0, 24);
    const encrypted = await fs.readFile(new URL(`../../content/docs/${hash.slice(0, 2)}/${hash}.sbv`, import.meta.url));
    assert.ok(encrypted.length > 81, `${reference}: vault payload must not be empty`);
    assert.equal(encrypted.subarray(0, 4).toString(), 'SBV1', `${reference}: vault header`);
    assert.equal(encrypted[4], 1, `${reference}: vault version`);
  }
  assert.ok(references.size > 0);
  context.diagnostic(`Validated ${references.size} distinct study guides across ${files.length} roadmaps.`);
});
