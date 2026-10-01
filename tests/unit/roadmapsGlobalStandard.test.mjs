import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROADMAPS_DIR = path.join(process.cwd(), 'public', 'data', 'roadmaps');

test('every roadmap certification bank has 50 questions with the required 14/26/10 distribution', () => {
  for (const file of fs.readdirSync(ROADMAPS_DIR).filter(file => file.endsWith('.json'))) {
    const bank = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'quizzes', file), 'utf8'));
    assert.equal(bank.length, 50, file);
    const distribution = ['easy', 'moderate', 'hard'].map(level => bank.filter(question => question.difficulty === level).length);
    assert.deepEqual(distribution, [14, 26, 10], file);
    for (const question of bank) {
      assert.equal(question.options.length, 4, file);
      assert.ok(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex <= 3, file);
    }
  }
});

test('SkillBun 100 Roadmaps Global Standard Suite', async (t) => {
  const files = fs.readdirSync(ROADMAPS_DIR).filter((f) => f.endsWith('.json')).sort();

  await t.test('Exactly 100 roadmap files exist in the catalog', () => {
    assert.equal(files.length, 100, `Expected exactly 100 roadmap files, but found ${files.length}`);
  });

  await t.test('All 100 roadmaps adhere to the global standard schema and pillars', () => {
    const regionalRegex = /\b(in India|Indian landscape|dynamic Indian context)\b/i;

    for (const file of files) {
      const filePath = path.join(ROADMAPS_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      
      // JSON integrity
      assert.doesNotThrow(() => JSON.parse(raw), `${file} must be valid JSON`);
      const data = JSON.parse(raw);

      // Core metadata
      assert.ok(data.id, `${file} must have id`);
      assert.ok(data.title, `${file} must have title`);
      assert.ok(data.description && data.description.length > 20, `${file} must have descriptive description`);
      assert.equal(regionalRegex.test(data.description), false, `${file} description must be global standard`);

      // Pillar 1: Goal
      assert.ok(data.goal, `${file} must define goal`);
      assert.ok(data.goal.objective, `${file} goal must define objective`);
      assert.ok(data.goal.salary, `${file} goal must define salary string`);
      assert.ok(data.goal.salary.includes('$'), `${file} salary must include global USD benchmark`);
      assert.ok(data.goal.salary.includes('₹') || data.goal.salary.includes('LPA'), `${file} salary must include regional LPA benchmark`);
      assert.ok(data.goal.salary_range?.usd?.min > 0, `${file} salary_range must define usd.min`);
      assert.ok(data.goal.salary_range?.inr_lpa?.min > 0, `${file} salary_range must define inr_lpa.min`);
      assert.ok(Array.isArray(data.goal.target_roles) && data.goal.target_roles.length >= 2, `${file} goal must define target_roles`);
      assert.ok(Array.isArray(data.goal.career_pillars) && data.goal.career_pillars.length >= 2, `${file} goal must define career_pillars`);

      // Pillar 2: Learn
      assert.ok(data.learn, `${file} must define learn`);
      assert.ok(data.learn.summary, `${file} learn must define summary`);
      assert.ok(Array.isArray(data.learn.key_competencies) && data.learn.key_competencies.length >= 3, `${file} learn must define key_competencies`);
      assert.ok(Array.isArray(data.learn.prerequisites), `${file} learn must define prerequisites`);

      // Pillar 3: Boost
      assert.ok(data.boost, `${file} must define boost`);
      assert.ok(Array.isArray(data.boost.capstone_projects) && data.boost.capstone_projects.length >= 2, `${file} boost must define at least 2 capstone_projects`);
      for (const proj of data.boost.capstone_projects) {
        assert.ok(proj.title && proj.title.length > 3, `${file} capstone project must have title`);
        assert.ok(proj.description && proj.description.length >= 40, `${file} capstone project must have comprehensive description`);
        assert.ok(Array.isArray(proj.tech_stack) && proj.tech_stack.length >= 2, `${file} capstone project must have tech_stack`);
      }
      assert.ok(Array.isArray(data.boost.certifications) && data.boost.certifications.length >= 2, `${file} boost must define at least 2 certifications`);
      assert.ok(Array.isArray(data.boost.interview_focus) && data.boost.interview_focus.length >= 2, `${file} boost must define interview_focus`);

      // Structure integrity
      const hasTree = Array.isArray(data.tree) && data.tree.length > 0;
      const hasStages = Array.isArray(data.stages) && data.stages.length > 0;
      assert.ok(hasTree || hasStages, `${file} must contain a valid tree or stages structure`);
    }
  });

  await t.test('Zero regional framing phrases or non-global resources remain anywhere in all 100 files', () => {
    const strictRegionalRegex = /\b(in India|Indian landscape|dynamic Indian context|hindi|apna college|codewithharry|thapa technical|kunal kushwaha|hitesh choudhary|bca|mca|tier-3|tier 3)\b/i;
    for (const file of files) {
      const raw = fs.readFileSync(path.join(ROADMAPS_DIR, file), 'utf8');
      assert.equal(strictRegionalRegex.test(raw), false, `Found regional framing text in ${file}`);
    }
  });

  await t.test('All roadmap nodes have difficulty rating and calibrated EXP points', () => {
    const validDifficulties = new Set(['beginner', 'intermediate', 'advanced']);
    let totalNodesChecked = 0;

    function checkNode(node, file) {
      if (Array.isArray(node)) {
        for (const item of node) checkNode(item, file);
        return;
      }
      if (!node || typeof node !== 'object') return;
      totalNodesChecked++;

      assert.ok(node.id, `${file} node must have an id`);
      assert.ok(node.difficulty, `${file} node ${node.id} must define difficulty`);
      assert.ok(validDifficulties.has(node.difficulty), `${file} node ${node.id} has invalid difficulty: ${node.difficulty}`);
      assert.ok(typeof node.exp === 'number' && node.exp > 0, `${file} node ${node.id} must define numeric exp > 0`);

      if (Array.isArray(node.children)) {
        for (const child of node.children) checkNode(child, file);
      }
    }

    for (const file of files) {
      const raw = fs.readFileSync(path.join(ROADMAPS_DIR, file), 'utf8');
      const data = JSON.parse(raw);
      if (data.tree) {
        checkNode(data.tree, file);
      }
    }

    assert.ok(totalNodesChecked >= 3000, `Expected at least 3000 nodes checked, found ${totalNodesChecked}`);
  });

  await t.test('Every roadmap has an equal 1,000 EXP pool divided across its nodes', () => {
    for (const file of files) {
      const raw = fs.readFileSync(path.join(ROADMAPS_DIR, file), 'utf8');
      const data = JSON.parse(raw);
      assert.equal(data.total_exp, 1000, `${file} must define total_exp of 1000`);

      let roadmapExpSum = 0;
      function sumExp(node) {
        if (Array.isArray(node)) {
          for (const item of node) sumExp(item);
          return;
        }
        if (!node || typeof node !== 'object') return;
        roadmapExpSum += node.exp;
        if (Array.isArray(node.children)) {
          for (const child of node.children) sumExp(child);
        }
      }

      if (data.tree) {
        sumExp(data.tree);
      }
      assert.equal(roadmapExpSum, 1000, `${file} nodes must sum to exactly 1000 EXP (got ${roadmapExpSum})`);
    }
  });

  await t.test('All roadmap video resources comply with the SkillBun Official Video Standard', () => {
    const verifiedVideosRaw = fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'verified_videos.json'), 'utf8');
    const verifiedVideosSet = new Set(JSON.parse(verifiedVideosRaw));
    const bannedChannelPatterns = [
      /codewithharry/i, /apna college/i, /wscube/i, /sreemanti dey/i,
      /code step by step/i, /thapa technical/i, /kunal kushwaha/i,
      /hitesh choudhary/i, /gate smashers/i, /5 minutes engineering/i
    ];

    let totalVideosChecked = 0;

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(ROADMAPS_DIR, file), 'utf8'));
      function checkNode(node) {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(checkNode); return; }
        if (typeof node === 'object') {
          if (Array.isArray(node.resources)) {
            node.resources.forEach(r => {
              if (r && (r.type === 'video' || (r.url && (r.url.includes('youtube.com') || r.url.includes('youtu.be'))))) {
                totalVideosChecked++;
                assert.ok(r.url, `${file} video resource must have url`);
                assert.ok(r.title, `${file} video resource must have title`);
                assert.ok(verifiedVideosSet.has(r.url), `${file} video ${r.url} must exist in verified_videos.json`);
                bannedChannelPatterns.forEach(pat => {
                  assert.equal(pat.test(r.title), false, `${file} video title "${r.title}" matches banned pattern ${pat}`);
                });
              }
            });
          }
          for (const k of Object.keys(node)) {
            if (k !== 'resources') checkNode(node[k]);
          }
        }
      }
      checkNode(data);
    }
    assert.ok(totalVideosChecked > 1000, `Expected at least 1000 video resources checked, found ${totalVideosChecked}`);
  });
});
