/** Public metadata only. Never includes questions, keys or private user data. */
const fs = require('fs');
const path = require('path');
const { roadmapToPillar } = require('./quiz-bank/config');

function buildCatalog() {
  const directory = path.join(__dirname, '..', 'public', 'data', 'roadmaps');
  const catalog = {};
  for (const filename of fs.readdirSync(directory).filter(value => value.endsWith('.json')).sort()) {
    const slug = filename.slice(0, -5);
    const roadmap = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    catalog[slug] = {
      title: roadmap.title, description: roadmap.description || roadmap.goal?.objective || '',
      pillar: roadmapToPillar[slug],
      skills: (roadmap.learn?.key_competencies || []).filter(value => typeof value === 'string').slice(0, 5),
      salary: roadmap.goal?.salary || '',
      salaryNote: 'SkillBun editorial estimates, not a verified salary survey. USD and India INR ranges describe separate markets; actual pay varies by location, employer and experience.',
    };
  }
  if (Object.keys(catalog).length !== 100) throw new Error('Expected metadata for 100 careers');
  fs.writeFileSync(path.join(__dirname, '..', 'utils', 'shared', 'careerCatalog.js'), `// Generated from public roadmap metadata by scripts/build-career-catalog.js.\nexport const careerCatalog = ${JSON.stringify(catalog, null, 2)};\n`);
  return catalog;
}

if (require.main === module) console.log(`Built public metadata for ${Object.keys(buildCatalog()).length} careers`);
module.exports = { buildCatalog };
