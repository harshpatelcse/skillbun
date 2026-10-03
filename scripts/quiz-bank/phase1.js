const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(1, 1, '{name}, your college team is making its first useful app. Which contribution sounds most interesting?', ['fullstack', 'data_analyst', 'ui_ux_design', 'devops_cloud']),
  q(2, 1, 'A student club website is confusing and sometimes stops working. Which improvement would you like to try, {name}?', ['frontend', 'site_reliability_engineer', 'ux_researcher', 'qa_automation']),
  q(3, 1, '{name}, a mentor offers four beginner-friendly workshops. Which would you pick first?', ['python_developer', 'computer_vision_engineer', 'application_security_engineer', 'embedded_iot']),
  q(4, 1, 'Your team has finished a small prototype. Which kind of progress would feel most rewarding to you, {name}?', ['backend', 'data_visualization_specialist', 'content_designer', 'iam_engineer']),
  q(5, 1, '{name}, you have one week to explore a role in a small startup. Which activity would you try?', ['product_manager', 'data_science', 'cloud_architect', 'technical_support_engineer']),
  q(6, 1, 'You can build one practice project with a friend, {name}. Which activity makes you curious?', ['android', 'nlp_engineer', 'game_development', 'penetration_tester']),
  q(7, 1, '{name}, which question would you enjoy investigating while a team checks its new app?', ['qa_automation', 'data_analyst', 'ux_researcher', 'soc_analyst']),
  q(8, 1, 'You have two weeks to learn something through a small project. Which activity would you choose, {name}?', ['frontend', 'recommendation_systems_engineer', 'technical_writing', 'network_engineer']),
];
