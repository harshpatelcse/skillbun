const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(201, 2, "{name}, what would you like to do with a spreadsheet from a student event?", ["data_analyst","data_science","data_engineering","bi_developer"], 'data_ai'),
  q(202, 2, "Which kind of pattern would you like to help a computer recognize, {name}?", ["nlp_engineer","computer_vision_engineer","speech_ai_engineer","recommendation_systems_engineer"], 'data_ai'),
  q(203, 2, "{name}, which part of a small data project would you enjoy exploring?", ["analytics_engineer","data_governance_specialist","data_visualization_specialist","ai_research_engineer"], 'data_ai'),
];
