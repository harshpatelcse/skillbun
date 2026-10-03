const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(301, 2, "A student app needs to become easier to use. Where would you like to help, {name}?", ["ui_ux_design","ux_researcher","content_designer","design_systems_engineer"], 'design_product'),
  q(302, 2, "{name}, your team is deciding what to improve next. Which activity interests you?", ["product_manager","business_analyst","service_designer","technical_writing"], 'design_product'),
];
