/**
 * Build 25 student preference scenarios for each certification career.
 * Certification files establish career coverage and topic provenance; exam
 * sentence fragments are never reused as discovery question wording.
 * No provider or external service is used.
 */
const fs = require('fs');
const path = require('path');
const { roadmapToPillar } = require('./quiz-bank/config');
const { activities, situations, questionFrames, optionFrames, alternatives } = require('./quiz-bank/student-scenarios');

const QUIZZES_DIR = path.join(__dirname, '..', 'public', 'data', 'quizzes');
const BANK_DIR = path.join(__dirname, 'quiz-bank');
const pillarIds = Object.keys(alternatives);

function format(template, values) {
  return template.replace(/\{(activity|situation)\}/g, (_match, key) => values[key]);
}

function buildScenarios(slug, certificationQuestions, firstId) {
  const pillar = roadmapToPillar[slug];
  if (!pillar || !activities[slug]) throw new Error(`Missing editorial career activity: ${slug}`);
  if (!Array.isArray(certificationQuestions) || certificationQuestions.length < 25) throw new Error(`Incomplete certification coverage: ${slug}`);
  const otherPillars = pillarIds.filter(value => value !== pillar);
  return situations.map((situation, index) => {
    const alternatePillars = Array.from({ length: 3 }, (_, offset) => otherPillars[(index + offset) % otherPillars.length]);
    const choices = [slug, ...alternatePillars.map(value => alternatives[value][index % alternatives[value].length])];
    // Rotate the role-specific option so answering A repeatedly cannot select
    // every question's source career.
    const rotation = index % choices.length;
    const ordered = [...choices.slice(rotation), ...choices.slice(0, rotation)];
    return {
      id: firstId + index, phase: 2, pillar, sourceSlug: slug,
      sourceQuestionIndex: index, topic: activities[slug],
      q: format(questionFrames[index % questionFrames.length], { situation, activity: activities[slug] }),
      options: ordered.map((career, optionIndex) => ({
        l: 'ABCD'[optionIndex],
        t: format(optionFrames[(index + optionIndex) % optionFrames.length], { activity: activities[career] }),
        pillar: roadmapToPillar[career], tags: [career],
        i: `This choice suggests that you would like to ${activities[career]}, {name}. You can test that interest with a small project.`,
      })),
    };
  });
}

function generate() {
  const files = fs.readdirSync(QUIZZES_DIR).filter(file => file.endsWith('.json')).sort();
  const pillarQuestions = Object.fromEntries(pillarIds.map(pillar => [pillar, []]));
  let firstId = 1001;
  for (const file of files) {
    const slug = path.basename(file, '.json');
    const questions = JSON.parse(fs.readFileSync(path.join(QUIZZES_DIR, file), 'utf8'));
    const scenarios = buildScenarios(slug, questions, firstId);
    pillarQuestions[roadmapToPillar[slug]].push(...scenarios);
    firstId += scenarios.length;
  }
  if (files.length !== 100 || firstId !== 3501) throw new Error('Expected 100 careers and 2,500 derived scenarios');
  for (const [pillar, questions] of Object.entries(pillarQuestions)) {
    fs.writeFileSync(path.join(BANK_DIR, `phase2-cert-${pillar}.js`), `/** Student preference scenarios for ${pillar}; generated offline. */\nmodule.exports = ${JSON.stringify(questions, null, 2)};\n`);
    console.log(`${pillar}: ${questions.length} scenarios`);
  }
}

if (require.main === module) generate();
module.exports = { buildScenarios, generate };
