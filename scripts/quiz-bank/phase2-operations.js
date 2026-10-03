const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(601, 2, "{name}, which type of practical tool or experience would you enjoy making?", ["qa_automation","rpa_developer","game_development","embedded_iot"], 'operations'),
  q(602, 2, "Which project would make you curious enough to start learning today, {name}?", ["no_code_low_code_developer","robotics_engineer","ar_vr_developer","generative_ai_app_developer"], 'operations'),
];
