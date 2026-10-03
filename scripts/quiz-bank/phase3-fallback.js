const { preferenceQuestion: q } = require('./editorial-question');
module.exports = {
  systems: [q(701, 3, '{name}, your team is choosing a first app project. Which part would you like to build?', ['backend', 'frontend', 'go_developer', 'flutter_developer'], 'systems')],
  data_ai: [q(702, 3, 'Your club has a small collection of data. Which way of using it sounds interesting, {name}?', ['ai_ml_engineer', 'data_engineering', 'data_analyst', 'data_visualization_specialist'], 'data_ai')],
  design_product: [q(703, 3, '{name}, people are struggling with a student app. Which improvement would you enjoy exploring?', ['ui_ux_design', 'ux_researcher', 'content_designer', 'product_manager'], 'design_product')],
  cloud_infra: [q(704, 3, 'A practice app is ready to go online. Which supporting task would you like to learn, {name}?', ['devops_cloud', 'terraform_iac_engineer', 'observability_engineer', 'finops_engineer'], 'cloud_infra')],
  security: [q(705, 3, '{name}, your club has permission to check a practice app for security problems. What interests you?', ['application_security_engineer', 'penetration_tester', 'iam_engineer', 'soc_analyst'], 'security')],
  operations: [q(706, 3, 'Your team wants to save time or make something interactive. Which project would you try, {name}?', ['qa_automation', 'rpa_developer', 'game_development', 'embedded_iot'], 'operations')],
};
