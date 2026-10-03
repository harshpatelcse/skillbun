import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { catalogCareer, groundDiscoveryResults, rankDiscoveryCareers, scoreDiscoveryChoice } from '../../utils/client/quiz/careerDiscovery.mjs';
import { careerCatalog } from '../../utils/shared/careerCatalog.js';
import { generateOfflineCounsellorResponse } from '../../utils/server/counsellor/offlineEngine.js';

const require = createRequire(import.meta.url);
const bank = JSON.parse(await fs.readFile(new URL('../../content/quiz/source_quizQuestions.json', import.meta.url), 'utf8'));
const questions = [...bank.phase1, ...Object.values(bank.phase2).flat(), ...Object.values(bank.phase3Fallback).flat(), ...bank.phase4];
const initial = () => ({ tagScores: {}, pillarScores: Object.fromEntries(bank.pillars.map(pillar => [pillar.id, 0])) });

test('the discovery bank keeps 2,531 distinct questions and 25 coherent scenarios for every career', () => {
  assert.equal(questions.length, 2531);
  assert.ok(Buffer.byteLength(JSON.stringify(bank)) < 4_400_000, 'The authenticated response must stay below the hosting response limit');
  assert.equal(new Set(questions.map(question => question.id)).size, 2531);
  const derived = questions.filter(question => question.sourceSlug);
  assert.equal(derived.length, 2500);
  for (const slug of Object.keys(careerCatalog)) {
    const careerQuestions = derived.filter(question => question.sourceSlug === slug);
    assert.equal(careerQuestions.length, 25, slug);
    assert.equal(new Set(careerQuestions.map(question => question.q)).size, 25, slug);
    assert.ok(careerQuestions.every(question => question.q.includes(question.topic) && question.q.endsWith('?')));
  }
  for (const question of questions) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map(option => option.t)).size, 4);
    assert.equal(new Set(question.options.map(option => option.tags.join('|'))).size, 4, question.q);
    assert.ok(question.options.every(option => option.tags.every(tag => Object.hasOwn(careerCatalog, tag))));
    assert.doesNotMatch(question.q + question.options.map(option => option.t).join(' '), /all-India|Indian startup|Swiggy|Zomato|F1-score|SLA|SAST|DAST|VPC|HCL|K8s|fine-tun|sharding/i);
  }
});

test('each answer awards its own career, including design/security alternatives in a Go scenario', () => {
  const question = bank.phase2.systems.find(question => question.sourceSlug === 'go_developer');
  for (const option of question.options) {
    const state = initial();
    scoreDiscoveryChoice(state, option, careerCatalog);
    assert.deepEqual(Object.keys(state.tagScores), option.tags);
    assert.equal(state.tagScores[option.tags[0]], 1);
    if (!option.tags.includes('go_developer')) assert.equal(state.tagScores.go_developer, undefined);
    assert.equal(rankDiscoveryCareers(state, careerCatalog)[0], option.tags[0]);
  }
});

test('each of the 100 careers can lead a local recommendation from its actual answer signal', () => {
  for (const slug of Object.keys(careerCatalog)) {
    const question = questions.find(question => question.sourceSlug === slug);
    const choice = question.options.find(option => option.tags.includes(slug));
    const state = initial();
    scoreDiscoveryChoice(state, choice, careerCatalog);
    assert.equal(groundDiscoveryResults({}, state, careerCatalog).careers[0].roadmapUrl, slug);
  }
});

test('tag lists cannot manufacture extra influence or override their canonical pillar', () => {
  const state = initial();
  scoreDiscoveryChoice(state, { pillar: 'security', tags: ['frontend', 'backend', 'frontend', 'fabricated', '__proto__'] }, careerCatalog);
  assert.deepEqual(state.tagScores, { frontend: 0.5, backend: 0.5 });
  assert.equal(state.pillarScores.systems, 1);
  assert.equal(state.pillarScores.security, 0);
});

test('every career uses its own public catalog skills/pay and never generic high-demand defaults', async () => {
  for (const [slug, metadata] of Object.entries(careerCatalog)) {
    const roadmap = JSON.parse(await fs.readFile(new URL(`../../public/data/roadmaps/${slug}.json`, import.meta.url), 'utf8'));
    const career = catalogCareer(slug, careerCatalog, { related: true });
    assert.equal(career.title, roadmap.title);
    assert.equal(career.salaryRange, roadmap.goal.salary);
    assert.deepEqual(career.skills, roadmap.learn.key_competencies.slice(0, 5));
    assert.match(career.salaryNote, /editorial estimates, not a verified salary survey/);
    assert.equal(career.recommendationLabel, 'Related path to explore');
    assert.equal(career.matchPercent, undefined);
    assert.equal(career.demand, undefined);
    assert.ok(metadata.pillar);
  }
  assert.equal(catalogCareer('fabricated', careerCatalog), null);
});

test('AI results cannot introduce compensation, skills, demand or percentage claims', () => {
  const results = groundDiscoveryResults({ careers: [
    { roadmapUrl: 'frontend', description: 'You preferred building readable screens.', salaryRange: '$1,000,000', skills: ['Fake skill'], demand: 'Guaranteed', matchPercent: 100 },
    { roadmapUrl: 'frontend' }, { roadmapUrl: 'fabricated' },
  ] }, initial(), careerCatalog);
  assert.equal(results.careers.length, 3);
  assert.equal(new Set(results.careers.map(career => career.roadmapUrl)).size, 3);
  assert.equal(results.careers[0].salaryRange, careerCatalog.frontend.salary);
  assert.deepEqual(results.careers[0].skills, careerCatalog.frontend.skills);
  assert.doesNotMatch(JSON.stringify(results), /1,000,000|Fake skill|Guaranteed|matchPercent|demand/);
});

async function clientDom() {
  const source = (await fs.readFile(new URL('../../utils/client/quiz/quizDom.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/^export /gm, '');
  const document = { createElement: () => ({ set textContent(value) { this.innerHTML = String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'); } }) };
  return new Function('document', 'window', `${source};return { normalizeQuizResponse, normalizeCareerEntry, renderCareerCard };`)(document, { location: { origin: 'https://skillbun.tech' } });
}

test('AI question normalization preserves scoring metadata and rejects missing or identical signals', async () => {
  const dom = await clientDom();
  const options = ['frontend', 'backend', 'go_developer', 'android'].map((tag, index) => ({ label: 'ABCD'[index], text: `Activity ${index}`, pillar: 'systems', tags: [tag] }));
  const question = dom.normalizeQuizResponse({ questionCount: 7 }, { question: 'Which activity would you enjoy?', options });
  assert.deepEqual(question.options.map(option => option.tags), options.map(option => option.tags));
  assert.ok(question.options.every(option => option.pillar === 'systems'));
  assert.throws(() => dom.normalizeQuizResponse({}, { question: 'Choose?', options: options.map(option => ({ ...option, tags: ['frontend'] })) }), /distinct career preference choices/);
  assert.throws(() => dom.normalizeQuizResponse({}, { question: 'Choose?', options: options.map(({ tags: _tags, ...option }) => option) }), /distinct career preference choices/);
});

test('result normalization and rendered cards omit invented match/demand assertions', async () => {
  const dom = await clientDom();
  const career = dom.normalizeCareerEntry({ ...catalogCareer('frontend', careerCatalog), matchPercent: 99, demand: 'High' }, 0);
  assert.equal(career.matchPercent, undefined);
  assert.equal(career.demand, undefined);
  const card = dom.renderCareerCard(career, 1);
  assert.match(card, /Suggested path/);
  assert.match(card, /Indicative pay/);
  assert.match(card, /editorial estimates/);
  assert.doesNotMatch(card, /% Match|High Demand|undefined|🥇|💰|📈/);
});

test('grounded result links retain their catalog identity despite comparisons in the explanation', async () => {
  const dom = await clientDom();
  for (const slug of Object.keys(careerCatalog)) {
    const career = dom.normalizeCareerEntry(catalogCareer(slug, careerCatalog, { description: 'Compare backend APIs, backend systems, backend databases, backend engineering, Angular, Vue and other possible careers before deciding.' }), 0);
    assert.equal(career.roadmapUrl, slug);
    assert.match(dom.renderCareerCard(career, 1), new RegExp(`href="/roadmap/${slug}"`));
  }
});

test('offline BunBot acknowledges Goal estimates without inventing salary benchmarks', () => {
  const contents = [{ role: 'user', parts: [{ text: 'What is the frontend starting salary?' }] }];
  const answer = generateOfflineCounsellorResponse(contents);
  assert.match(answer, /indicative editorial salary estimates/);
  assert.match(answer, /\/roadmap\/frontend\/goal/);
  assert.match(answer, /cannot verify current compensation/);
  assert.doesNotMatch(answer, /\$\d|₹\d|compensation benchmarks|does not publish/);
});

test('bank regeneration uses the complete career inventory and rejects missing editorial coverage', () => {
  const { buildScenarios } = require('../../scripts/generate-questions-from-quizzes.js');
  const generated = buildScenarios('go_developer', Array.from({ length: 50 }, () => ({ question: 'A service needs access to a resource.' })), 1001);
  assert.equal(generated.length, 25);
  assert.doesNotMatch(JSON.stringify(generated), /service needs access|build a.*\(go developer\) tool/);
  assert.throws(() => buildScenarios('unknown_career', [], 1001), /Missing editorial career activity/);
});
