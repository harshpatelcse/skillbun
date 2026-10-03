/**
 * SkillBun Career Discovery Quiz Bank Builder
 * 
 * Reads modular question data files from scripts/quiz-bank/
 * and assembles the private encryption source content/quiz/source_quizQuestions.json
 * 
 * Usage: node scripts/build-career-quiz-bank.js
 * Then:  node scripts/encrypt-quiz.js
 */

const fs = require('fs');
const path = require('path');

const BANK_DIR = path.join(__dirname, 'quiz-bank');
const OUTPUT_FILE = path.join(__dirname, '..', 'content', 'quiz', 'source_quizQuestions.json');

// --- Load all question modules ---
const config = require('./quiz-bank/config');

// Phase 1: Core DNA (broad pillar discovery)
let phase1 = [];
try { phase1 = require('./quiz-bank/phase1'); } catch (e) { console.warn('Phase 1 not found yet:', e.message); }

// Phase 2: Pillar-specific branching (keyed by pillar)
const phase2 = { systems: [], data_ai: [], design_product: [], cloud_infra: [], security: [], operations: [] };

// Auto-discover phase2-*.js files
const phase2Files = fs.readdirSync(BANK_DIR).filter(f => f.startsWith('phase2-') && f.endsWith('.js'));
for (const file of phase2Files) {
  try {
    const data = require(path.join(BANK_DIR, file));
    if (Array.isArray(data)) {
      for (const q of data) {
        const pillar = q.pillar;
        if (phase2[pillar]) {
          phase2[pillar].push(q);
        } else {
          console.warn(`Unknown pillar "${pillar}" in ${file}, question ${q.id}`);
        }
      }
    }
  } catch (e) {
    console.warn(`Could not load ${file}:`, e.message);
  }
}

// Phase 3: AI fallback questions (keyed by pillar)
let phase3Fallback = {};
try { phase3Fallback = require('./quiz-bank/phase3-fallback'); } catch (e) { console.warn('Phase 3 fallback not found yet:', e.message); }

// Phase 4: Confirmation questions
let phase4 = [];
try { phase4 = require('./quiz-bank/phase4'); } catch (e) { console.warn('Phase 4 not found yet:', e.message); }

// --- Validate questions ---
let errors = 0;
const seenIds = new Set();
function validateQuestion(q, source) {
  if (!q.id) { console.error(`Missing id in ${source}`); errors++; }
  if (seenIds.has(q.id)) { console.error(`Duplicate question id in ${source}: ${q.id}`); errors++; }
  seenIds.add(q.id);
  if (!q.q) { console.error(`Missing question text in ${source}, id=${q.id}`); errors++; }
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    console.error(`Need exactly 4 options in ${source}, id=${q.id}`); errors++;
  }
  const choices = new Set((q.options || []).map(option => JSON.stringify(option.tags)));
  if (choices.size !== 4) { console.error(`Options need distinct career signals in ${source}, id=${q.id}`); errors++; }
  for (const opt of (q.options || [])) {
    if (!opt.t) { console.error(`Missing option text in ${source}, id=${q.id}`); errors++; }
    if (!Array.isArray(opt.tags) || opt.tags.length === 0) {
      console.error(`Missing tags in ${source}, id=${q.id}, option="${opt.t?.slice(0, 30)}"`); errors++;
    }
    if ((opt.tags || []).some(tag => !Object.hasOwn(config.roadmapToPillar, tag))) {
      console.error(`Unknown career tag in ${source}, id=${q.id}`); errors++;
    }
    if (!opt.i) { console.error(`Missing insight in ${source}, id=${q.id}`); errors++; }
  }
}

console.log('\n📋 Validating question bank...\n');

for (const q of phase1) validateQuestion(q, 'phase1');
for (const [pillar, questions] of Object.entries(phase2)) {
  for (const q of questions) validateQuestion(q, `phase2-${pillar}`);
}
for (const [pillar, questions] of Object.entries(phase3Fallback)) {
  for (const q of questions) validateQuestion(q, `phase3-${pillar}`);
}
for (const q of phase4) validateQuestion(q, 'phase4');

// --- Count ---
const phase2Total = Object.values(phase2).reduce((sum, arr) => sum + arr.length, 0);
const phase3Total = Object.values(phase3Fallback).reduce((sum, arr) => sum + arr.length, 0);
const grandTotal = phase1.length + phase2Total + phase3Total + phase4.length;
if (grandTotal !== 2531) { console.error(`Expected 2,531 discovery questions, received ${grandTotal}`); errors++; }

console.log('--- Question Bank Stats ---');
console.log(`Phase 1 (Core DNA):        ${phase1.length}`);
for (const [pillar, questions] of Object.entries(phase2)) {
  console.log(`Phase 2 (${pillar}):  ${questions.length}`);
}
console.log(`Phase 2 Total:             ${phase2Total}`);
console.log(`Phase 3 (AI Fallback):     ${phase3Total}`);
console.log(`Phase 4 (Confirmation):    ${phase4.length}`);
console.log(`─────────────────────────────`);
console.log(`GRAND TOTAL:               ${grandTotal}`);
console.log();

if (errors > 0) {
  console.error(`❌ ${errors} validation error(s) found. Fix them before building.`);
  process.exit(1);
}

// --- Assemble output ---
const output = {
  version: '2.0',
  generatedAt: new Date().toISOString(),
  stats: {
    phase1: phase1.length,
    phase2: Object.fromEntries(Object.entries(phase2).map(([k, v]) => [k, v.length])),
    phase3: phase3Total,
    phase4: phase4.length,
    total: grandTotal
  },
  profileMapping: config.profileMapping,
  pillars: config.pillars,
  phase1,
  phase2,
  phase3Fallback,
  phase4
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
console.log(`✅ Built ${grandTotal} career discovery questions → ${OUTPUT_FILE}`);
console.log(`📦 File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
console.log(`\n🔐 Next step: node scripts/encrypt-quiz.js`);
