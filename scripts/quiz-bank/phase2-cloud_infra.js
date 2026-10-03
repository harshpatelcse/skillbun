const { preferenceQuestion: q } = require('./editorial-question');
module.exports = [
  q(401, 2, "Your team is putting its first app online. Which activity would you like to learn, {name}?", ["devops_cloud","cloud_architect","site_reliability_engineer","terraform_iac_engineer"], 'cloud_infra'),
  q(402, 2, "{name}, which task would you enjoy while helping a team run its app?", ["platform_engineer","finops_engineer","linux_system_admin","observability_engineer"], 'cloud_infra'),
];
