const { roadmapToPillar } = require('./config');
const { activities } = require('./student-scenarios');

function preferenceQuestion(id, phase, q, careers, pillar) {
  return {
    id, phase, ...(pillar ? { pillar } : {}), q,
    options: careers.map((career, index) => ({
      l: 'ABCD'[index], t: `Learn how to ${activities[career]}.`,
      pillar: roadmapToPillar[career], tags: [career],
      i: `You are interested in learning to ${activities[career]}, {name}. Trying a small project can help you decide whether you enjoy it.`,
    })),
  };
}

module.exports = { preferenceQuestion };
