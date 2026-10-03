const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(501, 2, "Which safe practice activity would you like to explore in a security workshop, {name}?", ["penetration_tester","soc_analyst","application_security_engineer","grc_analyst"], 'security'),
];
