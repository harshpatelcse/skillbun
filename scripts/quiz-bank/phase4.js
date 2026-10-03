const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(801, 4, '{name}, which type of activity would you enjoy practicing regularly over the next few months?', ['fullstack', 'data_science', 'product_designer', 'cybersecurity']),
  q(802, 4, 'Which kind of project would you like to show in your future portfolio, {name}?', ['backend', 'ai_ml_engineer', 'ui_ux_design', 'devops_cloud']),
];
