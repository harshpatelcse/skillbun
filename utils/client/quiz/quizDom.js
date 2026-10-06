'use client';

import { hasFreshHumanProof, clearHumanProof } from './quizState';
import { setCaptchaStatus } from './quizCaptcha';
import { formatWaitTime } from './quizApi';
import { readProfileSnapshot } from '../../shared/profileStore';

function safeGet(obj, key) {
  const keyStr = String(key);
  if (obj && Object.prototype.hasOwnProperty.call(obj, keyStr)) {
    return Reflect.get(obj, keyStr);
  }
  return undefined;
}

function safeGetIndex(arr, idx) {
  if (Array.isArray(arr) && idx >= 0 && idx < arr.length) {
    return arr.at(idx);
  }
  return undefined;
}

function safeSetIndex(arr, idx, val) {
  if (Array.isArray(arr) && idx >= 0) {
    arr.splice(idx, 1, val);
  }
}

const SUPPORT_EMAIL = 'harsh@skillbun.tech';
const MAX_RETRIES_PER_QUESTION = 3;

const ROADMAP_FALLBACK_URL = '/roadmap/general';

const KNOWN_ROADMAP_SLUGS = new Set([
  'ai_ml_engineer',
  'ai_research_engineer',
  'analytics_engineer',
  'android',
  'angular_developer',
  'api_platform_engineer',
  'application_security_engineer',
  'ar_vr_developer',
  'aws_cloud_engineer',
  'azure_cloud_engineer',
  'backend',
  'bi_developer',
  'blockchain_web3',
  'business_analyst',
  'c_cpp_systems_developer',
  'cloud_architect',
  'cloud_security_engineer',
  'computer_vision_engineer',
  'content_designer',
  'cybersecurity',
  'data_analyst',
  'data_engineering',
  'data_governance_specialist',
  'data_science',
  'data_visualization_specialist',
  'database_admin',
  'design_systems_engineer',
  'desktop_app_developer',
  'devops_cloud',
  'dfir_analyst',
  'digital_marketing_analyst',
  'dotnet_developer',
  'elixir_phoenix_developer',
  'embedded_iot',
  'finops_engineer',
  'flutter_developer',
  'frontend',
  'fullstack',
  'game_development',
  'gcp_cloud_engineer',
  'generative_ai_app_developer',
  'geospatial_data_scientist',
  'go_developer',
  'graphql_api_developer',
  'grc_analyst',
  'iam_engineer',
  'ios_developer',
  'java_developer',
  'kubernetes_engineer',
  'linux_system_admin',
  'llmops_engineer',
  'macos_developer',
  'malware_analyst',
  'mlops_engineer',
  'network_engineer',
  'nextjs_developer',
  'nlp_engineer',
  'no_code_low_code_developer',
  'observability_engineer',
  'penetration_tester',
  'php_laravel_developer',
  'platform_engineer',
  'product_designer',
  'product_manager',
  'prompt_engineer',
  'python_developer',
  'qa_automation',
  'react_native_developer',
  'recommendation_systems_engineer',
  'red_team_operator',
  'reinforcement_learning_engineer',
  'release_engineer',
  'robotics_engineer',
  'rpa_developer',
  'ruby_on_rails_developer',
  'rust_developer',
  'salesforce_developer',
  'scala_developer',
  'scrum_master_agile_coach',
  'seo_specialist',
  'serverless_developer',
  'service_designer',
  'shopify_developer',
  'site_reliability_engineer',
  'soc_analyst',
  'speech_ai_engineer',
  'svelte_developer',
  'technical_artist',
  'technical_support_engineer',
  'technical_writing',
  'terraform_iac_engineer',
  'threat_intelligence_analyst',
  'ui_ux_design',
  'unity_developer',
  'unreal_engine_developer',
  'ux_researcher',
  'vue_developer',
  'windows_app_developer',
  'wordpress_developer',
  'general'
]);

const ROADMAP_KEYWORD_RULES = [
  { slug: 'scala_developer', keywords: ['scala developer', 'scala programming', 'akka', 'sbt', 'functional programming scala'] },
  { slug: 'ruby_on_rails_developer', keywords: ['ruby on rails developer', 'ruby on rails', 'rails developer', 'ruby developer', 'active record'] },
  { slug: 'elixir_phoenix_developer', keywords: ['elixir/phoenix developer', 'elixir phoenix developer', 'elixir developer', 'phoenix developer', 'liveview', 'otp', 'beam'] },
  { slug: 'c_cpp_systems_developer', keywords: ['c/c++ systems developer', 'c cpp systems developer', 'c++ developer', 'cpp developer', 'c developer', 'systems programming', 'memory management'] },
  { slug: 'angular_developer', keywords: ['angular developer', 'angular', 'rxjs', 'typescript angular'] },
  { slug: 'vue_developer', keywords: ['vue developer', 'vue.js', 'vue js', 'pinia', 'nuxt'] },
  { slug: 'svelte_developer', keywords: ['svelte developer', 'sveltekit', 'svelte', 'svelte js'] },
  { slug: 'nextjs_developer', keywords: ['next.js developer', 'nextjs developer', 'next.js', 'next js', 'app router', 'server components'] },
  { slug: 'graphql_api_developer', keywords: ['graphql api developer', 'graphql developer', 'graphql api', 'apollo graphql', 'schema federation'] },
  { slug: 'api_platform_engineer', keywords: ['api platform engineer', 'api design', 'openapi', 'api gateway', 'developer portal'] },
  { slug: 'serverless_developer', keywords: ['serverless developer', 'aws lambda', 'event driven', 'serverless framework'] },
  { slug: 'kubernetes_engineer', keywords: ['kubernetes engineer', 'k8s', 'helm', 'cluster operations', 'container orchestration'] },
  { slug: 'platform_engineer', keywords: ['platform engineer', 'internal developer platform', 'backstage', 'developer platform', 'golden path'] },
  { slug: 'terraform_iac_engineer', keywords: ['terraform/iac engineer', 'terraform iac engineer', 'terraform engineer', 'iac engineer', 'infrastructure as code', 'hashicorp terraform'] },
  { slug: 'aws_cloud_engineer', keywords: ['aws cloud engineer', 'aws engineer', 'ec2', 's3', 'vpc', 'iam aws'] },
  { slug: 'azure_cloud_engineer', keywords: ['azure cloud engineer', 'azure engineer', 'microsoft azure', 'azure devops'] },
  { slug: 'gcp_cloud_engineer', keywords: ['gcp cloud engineer', 'google cloud engineer', 'gke', 'cloud run', 'bigquery cloud'] },
  { slug: 'finops_engineer', keywords: ['finops engineer', 'cloud cost', 'cost optimization', 'cloud economics', 'finops'] },
  { slug: 'observability_engineer', keywords: ['observability engineer', 'opentelemetry', 'prometheus', 'grafana', 'logs metrics traces'] },
  { slug: 'release_engineer', keywords: ['release engineer', 'release engineering', 'ci cd release', 'deployment pipeline'] },
  { slug: 'application_security_engineer', keywords: ['application security engineer', 'appsec', 'secure code review', 'sast', 'dast', 'owasp asvs'] },
  { slug: 'malware_analyst', keywords: ['malware analyst', 'malware analysis', 'reverse engineering', 'yara', 'remnux'] },
  { slug: 'dfir_analyst', keywords: ['dfir analyst', 'digital forensics', 'incident response', 'memory forensics', 'volatility'] },
  { slug: 'threat_intelligence_analyst', keywords: ['threat intelligence analyst', 'cyber threat intelligence', 'cti analyst', 'osint', 'mitre attack'] },
  { slug: 'red_team_operator', keywords: ['red team operator', 'red team', 'adversary simulation', 'purple team', 'atomic red team'] },
  { slug: 'grc_analyst', keywords: ['grc analyst', 'governance risk compliance', 'risk analyst', 'security compliance', 'iso 27001'] },
  { slug: 'iam_engineer', keywords: ['iam engineer', 'identity access management', 'sso', 'mfa', 'rbac', 'entra', 'okta'] },
  { slug: 'analytics_engineer', keywords: ['analytics engineer', 'dbt', 'semantic layer', 'data modeling', 'warehouse analytics'] },
  { slug: 'bi_developer', keywords: ['bi developer', 'business intelligence developer', 'power bi developer', 'tableau developer', 'dax'] },
  { slug: 'data_visualization_specialist', keywords: ['data visualization specialist', 'dashboard designer', 'd3', 'tableau visualization', 'data storytelling'] },
  { slug: 'data_governance_specialist', keywords: ['data governance specialist', 'data stewardship', 'data catalog', 'data lineage', 'data quality'] },
  { slug: 'geospatial_data_scientist', keywords: ['geospatial data scientist', 'gis data scientist', 'geopandas', 'qgis', 'spatial analysis'] },
  { slug: 'nlp_engineer', keywords: ['nlp engineer', 'natural language processing', 'transformers', 'hugging face', 'text classification'] },
  { slug: 'reinforcement_learning_engineer', keywords: ['reinforcement learning engineer', 'rl engineer', 'deep reinforcement learning', 'gymnasium', 'stable baselines'] },
  { slug: 'ai_research_engineer', keywords: ['ai research engineer', 'research engineer', 'machine learning research', 'pytorch experiments', 'benchmarks'] },
  { slug: 'llmops_engineer', keywords: ['llmops engineer', 'llm ops', 'llm monitoring', 'rag evaluation', 'langsmith'] },
  { slug: 'speech_ai_engineer', keywords: ['speech ai engineer', 'speech recognition', 'asr', 'text to speech', 'audio ai'] },
  { slug: 'recommendation_systems_engineer', keywords: ['recommendation systems engineer', 'recommender systems', 'ranking models', 'collaborative filtering'] },
  { slug: 'desktop_app_developer', keywords: ['desktop app developer', 'desktop application', 'electron', 'tauri', 'qt'] },
  { slug: 'windows_app_developer', keywords: ['windows app developer', 'winui', 'windows app sdk', 'xaml', 'uwp'] },
  { slug: 'macos_developer', keywords: ['macos developer', 'mac app developer', 'swiftui macos', 'appkit'] },
  { slug: 'unity_developer', keywords: ['unity developer', 'unity game developer', 'unity c#', 'game engine unity'] },
  { slug: 'unreal_engine_developer', keywords: ['unreal engine developer', 'unreal developer', 'blueprints', 'ue5', 'unreal c++'] },
  { slug: 'technical_artist', keywords: ['technical artist', 'tech artist', 'shader artist', 'game art pipeline', 'procedural tools'] },
  { slug: 'ux_researcher', keywords: ['ux researcher', 'user researcher', 'usability testing', 'research synthesis', 'user interviews'] },
  { slug: 'product_designer', keywords: ['product designer', 'digital product design', 'interaction design', 'figma designer'] },
  { slug: 'service_designer', keywords: ['service designer', 'service design', 'journey mapping', 'service blueprint'] },
  { slug: 'design_systems_engineer', keywords: ['design systems engineer', 'design system developer', 'storybook', 'design tokens', 'component library'] },
  { slug: 'content_designer', keywords: ['content designer', 'ux writer', 'content design', 'product content', 'microcopy'] },
  { slug: 'scrum_master_agile_coach', keywords: ['scrum master / agile coach', 'scrum master agile coach', 'scrum master', 'agile coach', 'scrum', 'kanban', 'agile delivery'] },
  { slug: 'fullstack', keywords: ['full stack', 'full-stack', 'fullstack'] },
  { slug: 'frontend', keywords: ['frontend', 'front end', 'front-end', 'web ui', 'react', 'vue', 'angular'] },
  { slug: 'backend', keywords: ['backend', 'back end', 'back-end', 'server side', 'api developer', 'microservice'] },
  { slug: 'flutter_developer', keywords: ['flutter', 'dart', 'cross platform mobile'] },
  { slug: 'react_native_developer', keywords: ['react native', 'expo', 'mobile react'] },
  { slug: 'python_developer', keywords: ['python developer', 'python backend', 'fastapi', 'django developer', 'python automation'] },
  { slug: 'java_developer', keywords: ['java developer', 'spring boot', 'spring developer', 'java backend'] },
  { slug: 'dotnet_developer', keywords: ['.net', 'dotnet', 'c#', 'asp.net', 'asp net', 'microsoft stack'] },
  { slug: 'go_developer', keywords: ['go developer', 'golang', 'go backend'] },
  { slug: 'rust_developer', keywords: ['rust developer', 'rust programming', 'systems programming'] },
  { slug: 'php_laravel_developer', keywords: ['php', 'laravel', 'php developer', 'laravel developer'] },
  { slug: 'wordpress_developer', keywords: ['wordpress', 'wordpress developer', 'woocommerce developer'] },
  { slug: 'shopify_developer', keywords: ['shopify', 'shopify developer', 'liquid theme', 'ecommerce developer'] },
  { slug: 'computer_vision_engineer', keywords: ['computer vision', 'opencv', 'image processing', 'object detection', 'vision engineer'] },
  { slug: 'mlops_engineer', keywords: ['mlops', 'ml ops', 'machine learning operations', 'model deployment', 'model monitoring', 'mlflow', 'dvc', 'model registry'] },
  { slug: 'generative_ai_app_developer', keywords: ['generative ai app', 'genai app', 'ai app developer', 'rag', 'retrieval augmented generation', 'llm app'] },
  { slug: 'prompt_engineer', keywords: ['prompt engineer', 'prompt engineering', 'prompt designer', 'llm prompt'] },
  { slug: 'ai_ml_engineer', keywords: ['ai engineer', 'artificial intelligence', 'llm', 'genai', 'nlp', 'machine learning', 'ml engineer', 'deep learning'] },
  { slug: 'digital_marketing_analyst', keywords: ['digital marketing analyst', 'marketing analyst', 'campaign analyst', 'performance marketing', 'ga4', 'google analytics'] },
  { slug: 'seo_specialist', keywords: ['seo', 'search engine optimization', 'seo specialist', 'technical seo'] },
  { slug: 'data_analyst', keywords: ['data analyst', 'business intelligence analyst', 'bi analyst', 'power bi', 'tableau', 'excel analyst', 'dashboard analyst', 'reporting analyst'] },
  { slug: 'data_science', keywords: ['data scientist', 'analytics', 'statistics', 'predictive modeling'] },
  { slug: 'data_engineering', keywords: ['data engineer', 'etl', 'elt', 'spark', 'kafka', 'airflow', 'warehouse', 'pipeline'] },
  { slug: 'site_reliability_engineer', keywords: ['site reliability engineer', 'sre engineer', 'sre', 'slo', 'error budget', 'incident response', 'prometheus'] },
  { slug: 'devops_cloud', keywords: ['devops', 'ci/cd', 'docker', 'kubernetes', 'terraform'] },
  { slug: 'cloud_architect', keywords: ['cloud architect', 'solution architect', 'solutions architect', 'aws architect', 'azure architect', 'gcp architect'] },
  { slug: 'network_engineer', keywords: ['network engineer', 'network administrator', 'ccna', 'routing', 'switching', 'subnetting', 'networking'] },
  { slug: 'linux_system_admin', keywords: ['linux administrator', 'linux admin', 'system administrator', 'sysadmin', 'server administrator', 'linux server'] },
  { slug: 'database_admin', keywords: ['database administrator', 'dba', 'postgres admin', 'mysql admin', 'database admin', 'database operations'] },
  { slug: 'technical_support_engineer', keywords: ['technical support', 'it support', 'helpdesk', 'desktop support', 'support engineer'] },
  { slug: 'qa_automation', keywords: ['qa', 'quality assurance', 'test automation', 'automation tester', 'sdet', 'playwright', 'selenium'] },
  { slug: 'ui_ux_design', keywords: ['ui ux', 'ux designer', 'ui designer', 'product designer', 'figma', 'user research'] },
  { slug: 'product_manager', keywords: ['product manager', 'product management', 'associate product manager', 'apm', 'product owner'] },
  { slug: 'business_analyst', keywords: ['business analyst', 'business analysis', 'requirements analyst', 'process analyst', 'functional analyst'] },
  { slug: 'game_development', keywords: ['game developer', 'game development', 'unity', 'godot', 'unreal'] },
  { slug: 'ar_vr_developer', keywords: ['ar developer', 'vr developer', 'xr developer', 'augmented reality', 'virtual reality', 'mixed reality', 'webxr'] },
  { slug: 'embedded_iot', keywords: ['embedded', 'iot', 'internet of things', 'firmware', 'microcontroller', 'arduino', 'esp32'] },
  { slug: 'robotics_engineer', keywords: ['robotics', 'robotics engineer', 'ros', 'ros2', 'autonomous robot', 'slam'] },
  { slug: 'blockchain_web3', keywords: ['blockchain', 'web3', 'solidity', 'smart contract', 'ethereum', 'dapp'] },
  { slug: 'cloud_security_engineer', keywords: ['cloud security', 'cloud security engineer', 'aws security', 'azure security', 'gcp security', 'guardduty', 'security hub', 'cloud iam', 'cspm'] },
  { slug: 'cybersecurity', keywords: ['cybersecurity', 'cyber security', 'information security', 'infosec', 'security engineer'] },
  { slug: 'soc_analyst', keywords: ['soc analyst', 'security operations', 'siem', 'blue team', 'threat hunting'] },
  { slug: 'penetration_tester', keywords: ['penetration tester', 'pentester', 'ethical hacker', 'web app pentest', 'bug bounty'] },
  { slug: 'salesforce_developer', keywords: ['salesforce', 'apex', 'lightning web components', 'lwc', 'crm developer', 'salesforce developer'] },
  { slug: 'technical_writing', keywords: ['technical writer', 'documentation', 'docs writer', 'api writer', 'developer documentation'] },
  { slug: 'no_code_low_code_developer', keywords: ['no code', 'low code', 'nocode', 'bubble', 'webflow', 'appsheet', 'power platform'] },
  { slug: 'rpa_developer', keywords: ['rpa', 'robotic process automation', 'uipath', 'power automate', 'automation developer'] },
  { slug: 'ios_developer', keywords: ['ios', 'swift', 'swiftui', 'iphone app'] },
  { slug: 'android', keywords: ['android', 'mobile', 'kotlin', 'app developer'] }
];

const ROADMAP_STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'apps', 'career', 'cloud', 'code', 'developer',
  'development', 'engineer', 'engineering', 'for', 'in', 'of', 'platform',
  'specialist', 'systems', 'the', 'with'
]);

const ROADMAP_LOW_SIGNAL_TOKENS = new Set([
  'app', 'cloud', 'code', 'data', 'developer', 'engineer', 'management',
  'mobile', 'product', 'security', 'software', 'support', 'system',
  'systems', 'tech', 'web'
]);

const BROAD_ROADMAP_SLUGS = new Set([
  'ai_ml_engineer', 'backend', 'cloud_architect', 'cybersecurity',
  'data_analyst', 'data_science', 'devops_cloud', 'frontend', 'fullstack',
  'game_development', 'general', 'product_manager', 'ui_ux_design'
]);

export function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function getStoredProfile() {
  const { name, degree, year, interest } = readProfileSnapshot();
  return { name, degree, year, interest };
}

export function redirectToProfileSetup(destination) {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/onboarding?next=${encodeURIComponent('/' + destination.replace('.html', ''))}`;
}

export function loadProfile(state) {
  const { name, degree, year, interest } = getStoredProfile();
  if (!degree || !year) {
    redirectToProfileSetup('quiz');
    return false;
  }

  state.userProfile = { name: name || 'Student', degree, year, interest };

  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = name;

  const userBadgeEl = document.getElementById('userBadge');
  if (userBadgeEl) userBadgeEl.textContent = `User: ${name}`;

  const welcomeProfileEl = document.getElementById('welcomeProfile');
  if (welcomeProfileEl) {
    welcomeProfileEl.innerHTML = '';
    const tag1 = document.createElement('div');
    tag1.className = 'profile-tag';
    tag1.textContent = 'Degree: ' + degree;
    const tag2 = document.createElement('div');
    tag2.className = 'profile-tag';
    tag2.textContent = 'Year: ' + year;
    welcomeProfileEl.appendChild(tag1);
    welcomeProfileEl.appendChild(tag2);
  }

  const dropdownNameEl = document.getElementById('dropdownName');
  if (dropdownNameEl) dropdownNameEl.textContent = name;
  const dropdownDegreeEl = document.getElementById('dropdownDegree');
  if (dropdownDegreeEl) dropdownDegreeEl.textContent = degree;
  const dropdownYearEl = document.getElementById('dropdownYear');
  if (dropdownYearEl) dropdownYearEl.textContent = year;
  return true;
}

export function resetQuizStateUI(state) {
  state.conversationHistory = [];
  state.questionCount = 0;
  state.totalQuestions = 10;
  state.lastSelectedOption = null;
  state.retryCount = 0;
  state.quizResults = null;

  const welcomeScreen = document.getElementById('welcomeScreen');
  const quizScreen = document.getElementById('quizScreen');
  const resultScreen = document.getElementById('resultScreen');
  const resultCards = document.getElementById('resultCards');
  const questionText = document.getElementById('questionText');
  const optionsContainer = document.getElementById('optionsContainer');
  const quizLoading = document.getElementById('quizLoading');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const captchaWrap = document.getElementById('captchaWrap');

  if (welcomeScreen) welcomeScreen.style.display = 'block';
  if (quizScreen) quizScreen.style.display = 'none';
  if (resultScreen) resultScreen.style.display = 'none';
  if (resultCards) resultCards.innerHTML = '';
  if (questionText) questionText.textContent = 'Loading your first question...';
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    optionsContainer.style.display = 'grid';
    optionsContainer.style.opacity = '1';
  }
  if (quizLoading) quizLoading.style.display = 'none';

  const aiInsight = document.getElementById('aiInsight');
  if (aiInsight) aiInsight.style.display = 'none';

  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('quizPhase').textContent = 'Phase 1: Discovery';
  document.getElementById('qNum').textContent = '1';
  document.getElementById('qTotal').textContent = '10';

  if (captchaWrap) {
    if (hasFreshHumanProof(state)) {
      captchaWrap.style.display = 'none';
      setCaptchaStatus('Security already verified for this session.', 'ok');
    } else if (state.securityConfig.captchaEnabled) {
      captchaWrap.style.display = 'block';
      setCaptchaStatus('Complete the verification below to start the quiz.');
    } else {
      captchaWrap.style.display = 'none';
    }
  }

  if (loadMoreBtn) {
    const defaultLabel = loadMoreBtn.dataset.defaultLabel || loadMoreBtn.textContent;
    loadMoreBtn.dataset.defaultLabel = defaultLabel;
    loadMoreBtn.textContent = defaultLabel;
    loadMoreBtn.disabled = false;
  }
}

export function updateProgress(state, qNum, phase) {
  document.getElementById('qNum').textContent = qNum;

  if (!state.totalQuestions) state.totalQuestions = 10;
  if (qNum > state.totalQuestions) state.totalQuestions = qNum;
  document.getElementById('qTotal').textContent = state.totalQuestions;

  const percent = Math.min((qNum / state.totalQuestions) * 100, 100);
  document.getElementById('progressFill').style.width = `${percent}%`;

  const phaseNames = {
    1: 'Phase 1: Discovery',
    2: 'Phase 2: Narrowing Down',
    3: 'Phase 3: Deep Dive'
  };

  document.getElementById('quizPhase').textContent = safeGet(phaseNames, phase) || '✨ Phase: Finalizing Match';
}

export function showQuestion(state, data, onSelect) {
  const userName = (state.userProfile?.name || 'Student').split(' ')[0];

  updateProgress(state, data.questionNumber || state.questionCount, data.phase || 1);

  const questionText = document.getElementById('questionText');
  const aiInsight = document.getElementById('aiInsight');
  const optionsContainer = document.getElementById('optionsContainer');

  if (questionText) {
    const rawQ = data.question || '';
    questionText.textContent = rawQ.replace(/\{name\}/g, userName);
  }

  if (aiInsight) {
    if (data.insight && String(data.insight).trim().length > 0) {
      const formattedInsight = String(data.insight).replace(/\{name\}/g, userName);
      aiInsight.innerHTML = `💡 <span>${sanitize(formattedInsight)}</span>`;
      aiInsight.style.display = 'block';
    } else {
      aiInsight.style.display = 'none';
      aiInsight.innerHTML = '';
    }
  }

  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    optionsContainer.style.display = 'grid';
    optionsContainer.style.opacity = '1';

    const options = Array.isArray(data.options) ? data.options : [];
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';

      const rawText = opt.t || opt.text || '';
      const optText = rawText.replace(/\{name\}/g, userName);
      const label = opt.l || opt.label || '•';

      btn.innerHTML = `<span class="opt-label">${sanitize(label)}</span> <span class="opt-text">${sanitize(optText)}</span>`;

      btn.addEventListener('click', () => {
        if (typeof onSelect === 'function') {
          onSelect(opt, btn);
        }
      });

      optionsContainer.appendChild(btn);
    });
  }
}

export function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/c\+\+/g, 'cplusplus')
    .replace(/c#/g, 'csharp')
    .replace(/\.net/g, 'dotnet')
    .replace(/ci\/cd/g, 'cicd')
    .replace(/ui\/ux/g, 'ui ux')
    .replace(/ar\/vr/g, 'ar vr')
    .replace(/no-code/g, 'no code')
    .replace(/low-code/g, 'low code')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeRoadmapSlug(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\.(json|html)$/i, '')
    .replace(/roadmap\.sh/gi, '')
    .replace(/roadmaps?/gi, ' ')
    .replace(/&/g, ' and ')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getRoadmapSlugCandidates(rawUrl) {
  if (typeof rawUrl !== 'string') return [];
  const input = rawUrl.trim();
  if (!input || /coming-soon/i.test(input)) return [];

  const candidates = [];
  const pushCandidate = (value) => {
    const normalized = normalizeRoadmapSlug(value);
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  pushCandidate(input);

  try {
    const parsed = new URL(input, window.location.origin);
    parsed.pathname
      .split('/')
      .filter(Boolean)
      .forEach(pushCandidate);
  } catch (err) {
    input.split(/[/?#=&]+/g).forEach(pushCandidate);
  }

  return candidates;
}

export function extractRoadmapSlug(rawUrl) {
  const candidates = getRoadmapSlugCandidates(rawUrl);
  return candidates.find(slug => KNOWN_ROADMAP_SLUGS.has(slug)) || candidates[0] || '';
}

export function getCareerTextParts(career) {
  const skills = Array.isArray(career?.skills) ? career.skills : [career?.skills];
  return [
    career?.title,
    career?.roadmapUrl,
    career?.description,
    career?.nextSteps,
    ...skills
  ].filter(part => typeof part === 'string' && part.trim().length > 0);
}

export function containsNormalizedPhrase(text, phrase) {
  if (!text || !phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

export function getRoadmapTokens(value) {
  return normalizeMatchText(value)
    .split(' ')
    .filter(token => token.length > 1 && !ROADMAP_STOP_WORDS.has(token));
}

export function countSharedTokens(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  return rightTokens.reduce((count, token) => count + (left.has(token) ? 1 : 0), 0);
}

export function getKeywordScore(text, titleText, keyword) {
  const normalizedKeyword = normalizeMatchText(keyword);
  if (!containsNormalizedPhrase(text, normalizedKeyword)) return 0;

  const keywordTokens = normalizedKeyword.split(' ').filter(Boolean);
  const titleHit = containsNormalizedPhrase(titleText, normalizedKeyword);
  const lowSignalOnly = keywordTokens.length === 1 && ROADMAP_LOW_SIGNAL_TOKENS.has(keywordTokens[0]);
  let score = 6 + Math.min(14, normalizedKeyword.length / 2) + Math.max(0, keywordTokens.length - 1) * 3;

  if (titleHit) score += 12;
  if (lowSignalOnly) score *= 0.35;

  return score;
}

export function scoreRoadmapRule(career, rule) {
  const titleText = normalizeMatchText(career?.title);
  const text = normalizeMatchText(getCareerTextParts(career).join(' '));
  const slugTokens = getRoadmapTokens(rule.slug.replace(/_/g, ' '));
  const titleTokens = getRoadmapTokens(career?.title);
  const allTokens = getRoadmapTokens(text);
  let score = 0;

  if (!text && !titleText) return 0;

  if (normalizeRoadmapSlug(career?.title) === rule.slug) {
    score += 45;
  }

  for (const keyword of rule.keywords) {
    score += getKeywordScore(text, titleText, keyword);
  }

  const titleOverlap = countSharedTokens(titleTokens, slugTokens);
  if (titleOverlap > 0) {
    score += titleOverlap * 5;
    if (titleOverlap === slugTokens.length) score += 10;
  }

  const overallOverlap = countSharedTokens(allTokens, slugTokens);
  if (overallOverlap > 0) {
    score += overallOverlap * 1.2;
  }

  return score;
}

export function inferRoadmapSlugFromCareer(career) {
  const ranked = ROADMAP_KEYWORD_RULES
    .map(rule => ({ slug: rule.slug, score: scoreRoadmapRule(career, rule) }))
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 9) return '';
  if (second && best.score - second.score < 2 && best.score < 24) return '';

  return best.slug;
}

export function resolveRoadmapSlug(career) {
  const fromAiUrl = extractRoadmapSlug(career?.roadmapUrl);
  if (career?.catalogGrounded === true && KNOWN_ROADMAP_SLUGS.has(fromAiUrl)) return fromAiUrl;
  const fromKeywords = inferRoadmapSlugFromCareer(career);

  if (fromKeywords && KNOWN_ROADMAP_SLUGS.has(fromKeywords)) {
    if (!fromAiUrl || fromAiUrl === fromKeywords || BROAD_ROADMAP_SLUGS.has(fromAiUrl)) {
      return fromKeywords;
    }
  }

  if (fromAiUrl && KNOWN_ROADMAP_SLUGS.has(fromAiUrl)) {
    return fromAiUrl;
  }

  if (fromKeywords && KNOWN_ROADMAP_SLUGS.has(fromKeywords)) {
    return fromKeywords;
  }

  if (fromAiUrl) {
    const fuzzyMatch = fuzzyMatchRoadmapSlug(fromAiUrl);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }
  }

  if (career?.title) {
    const titleSlug = normalizeRoadmapSlug(career.title);
    if (KNOWN_ROADMAP_SLUGS.has(titleSlug)) {
      return titleSlug;
    }

    const titleFuzzy = fuzzyMatchRoadmapSlug(titleSlug);
    if (titleFuzzy) {
      return titleFuzzy;
    }
  }

  return 'general';
}

export function resolveRoadmapUrl(career) {
  const slug = resolveRoadmapSlug(career);
  return KNOWN_ROADMAP_SLUGS.has(slug) ? `/roadmap/${slug}` : ROADMAP_FALLBACK_URL;
}

export function fuzzyMatchRoadmapSlug(input) {
  if (!input) return '';
  const normalizedInput = normalizeMatchText(input).replace(/\s/g, '');
  if (!normalizedInput) return '';

  let bestMatch = '';
  let bestScore = 0;

  for (const slug of KNOWN_ROADMAP_SLUGS) {
    if (slug === 'general') continue;
    const normalizedSlug = normalizeMatchText(slug.replace(/_/g, ' ')).replace(/\s/g, '');
    let score = getStringSimilarityScore(normalizedInput, normalizedSlug);

    if (normalizedSlug.includes(normalizedInput) || normalizedInput.includes(normalizedSlug)) {
      score += 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = slug;
    }
  }

  return bestScore >= 0.72 ? bestMatch : '';
}

export function getStringSimilarityScore(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const distance = getLevenshteinDistance(left, right);
  return 1 - (distance / Math.max(left.length, right.length));
}

export function getLevenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = safeGetIndex(previous, 0);
    safeSetIndex(previous, 0, i);

    for (let j = 1; j <= right.length; j += 1) {
      const temp = safeGetIndex(previous, j);
      const cost = left.charAt(i - 1) === right.charAt(j - 1) ? 0 : 1;
      safeSetIndex(previous, j, Math.min(
        safeGetIndex(previous, j) + 1,
        safeGetIndex(previous, j - 1) + 1,
        diagonal + cost
      ));
      diagonal = temp;
    }
  }

  return safeGetIndex(previous, right.length);
}

export function normalizeSkills(skills) {
  if (Array.isArray(skills)) {
    return skills
      .map(skill => String(skill || '').trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  if (typeof skills === 'string' && skills.trim()) {
    return skills
      .split(/[,|/]/g)
      .map(skill => skill.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  return [];
}

export function normalizeCareerEntry(career, index) {
  if (!career || typeof career !== 'object') return null;

  const title = String(career.title || '').trim();
  if (!title) return null;

  const normalizedCareer = {
    catalogGrounded: career.catalogGrounded === true,
    title,
    description: String(career.description || 'Recommended based on your quiz answers.').trim(),
    skills: normalizeSkills(career.skills),
    salaryRange: String(career.salaryRange || 'Varies by role and experience').trim(),
    nextSteps: String(career.nextSteps || 'Start with the roadmap and build small projects.').trim(),
    salaryNote: String(career.salaryNote || '').trim(),
    recommendationLabel: career.recommendationLabel === 'Related path to explore' ? career.recommendationLabel : 'Suggested path',
    roadmapUrl: String(career.roadmapUrl || '').trim()
  };

  return {
    ...normalizedCareer,
    roadmapUrl: resolveRoadmapSlug(normalizedCareer)
  };
}

export function getCareerDedupeKey(career) {
  const slug = resolveRoadmapSlug(career);
  if (slug && slug !== 'general') return `slug:${slug}`;
  return `title:${normalizeMatchText(career?.title)}`;
}

export function dedupeCareers(careers) {
  const seen = new Set();
  return careers.filter((career) => {
    const key = getCareerDedupeKey(career);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractCareers(response) {
  if (!response) return [];

  let rawCareers = [];
  if (Array.isArray(response.careers)) {
    rawCareers = response.careers;
  } else if (response.careers && typeof response.careers === 'object') {
    rawCareers = Object.values(response.careers);
  } else if (Array.isArray(response.results)) {
    rawCareers = response.results;
  }

  return dedupeCareers(rawCareers
    .map((career, index) => normalizeCareerEntry(career, index))
    .filter(Boolean));
}

export function renderCareerCard(career, index) {
  const roadmapSlug = resolveRoadmapSlug(career);

  const skillsHtml = (career.skills || [])
    .map(s => '<span class="skill-pill">' + sanitize(s) + '</span>')
    .join('');

  const finalUrl = resolveRoadmapUrl({ ...career, roadmapUrl: roadmapSlug });
  const isExternal = finalUrl.startsWith('https://roadmap.sh/');

  const actionLinkHtml = '<a href="' + sanitize(finalUrl) + '" ' + 
    (isExternal ? 'target="_blank" rel="noopener noreferrer"' : '') + 
    ' class="btn-secondary" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; text-decoration: none; font-size: 0.9rem;">' +
    'Explore Roadmap' +
    '</a>';

  return '<div class="result-card new" data-roadmap-slug="' + sanitize(roadmapSlug) + '" style="animation-delay:' + ((index - 1) * 0.15) + 's">' +
    '<div class="result-card-header">' +
      '<span class="result-medal" aria-label="Suggestion ' + index + '">' + index + '</span>' +
      '<span class="result-match">' + sanitize(career.recommendationLabel || 'Suggested path') + '</span>' +
    '</div>' +
    '<h3>' + sanitize(career.title) + '</h3>' +
    '<p class="result-desc">' + sanitize(career.description) + '</p>' +
    '<div class="result-meta">' +
      '<span class="result-tag salary">Indicative pay: ' + sanitize(career.salaryRange) + '</span>' +
    '</div>' +
    (career.salaryNote ? '<p class="result-desc">' + sanitize(career.salaryNote) + '</p>' : '') +
    '<div class="result-skills">' +
      '<h4>Key Skills</h4>' +
      '<div class="skill-pills">' +
        skillsHtml +
      '</div>' +
    '</div>' +
    '<div class="result-next">' +
      '<h4>Next Steps</h4>' +
      '<p>' + sanitize(career.nextSteps) + '</p>' +
    '</div>' +
    '<div class="result-action-link" style="margin-top: 1rem; text-align: right;">' +
      actionLinkHtml +
    '</div>' +
  '</div>';
}

export function buildErrorReportBody(state, { code, message, originalMessage, retryAfterMs, status }) {
  const cause = getAiErrorCause({ code, message, originalMessage, status });
  const reference = code || (status ? `AI_${status}` : 'AI_CLIENT');
  const statusText = status ? String(status) : 'N/A';
  const waitText = retryAfterMs > 0 ? formatWaitTime(retryAfterMs) : 'N/A';
  const technicalMessage = String(originalMessage || message || 'N/A').slice(0, 300);

  return [
    'Hi Team,',
    '',
    'I encountered an error during the SkillBun career quiz.',
    '',
    `Short brief: ${message || 'Quiz could not continue.'}`,
    `Error code: ${reference}`,
    `HTTP status: ${statusText}`,
    `Likely cause: ${cause}`,
    `Suggested wait: ${waitText}`,
    `Question number: ${state.questionCount || 'N/A'}`,
    `Attempt: ${state.retryCount} of ${MAX_RETRIES_PER_QUESTION}`,
    `Technical message: ${technicalMessage}`,
    '',
    'Please look into it. Thanks!'
  ].join('\n');
}

function getAiErrorCause({ code, message, originalMessage, status }) {
  const text = `${code || ''} ${message || ''} ${originalMessage || ''}`.toLowerCase();

  if (status === 429 || /quota|too many|rate|busy|limit/.test(text)) {
    return 'AI rate limit or quota pressure';
  }

  if (status === 403 || /human verification|captcha|turnstile/.test(text)) {
    return 'Human verification session was missing or expired';
  }

  if (status === 401 || /authentication|credential|api key|not configured/.test(text)) {
    return 'AI service authentication or configuration issue';
  }

  if (/json|parse|format|response_shape|result_shape|question_shape/.test(text)) {
    return 'AI returned a response that did not match the quiz JSON format';
  }

  if (/blocked|safety/.test(text)) {
    return 'AI safety filter blocked the request';
  }

  if (status === 504 || /timeout|timed out/.test(text)) {
    return 'AI request timed out';
  }

  if (status >= 500 || /network|fetch|could not reach|temporarily unavailable/.test(text)) {
    return 'Network or AI service availability issue';
  }

  return 'Unexpected quiz runtime error';
}

export function createQuizFormatError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function normalizeQuizResponse(state, response) {
  if (!response || typeof response !== 'object') {
    throw createQuizFormatError('AI response was not a JSON object', 'AI_RESPONSE_SHAPE');
  }

  if (response.type === 'result' || Array.isArray(response.careers) || (response.careers && typeof response.careers === 'object') || Array.isArray(response.results)) {
    const careers = extractCareers(response).slice(0, 3);
    if (careers.length === 0) {
      throw createQuizFormatError('AI result did not include usable careers', 'AI_RESULT_SHAPE');
    }

    return {
      ...response,
      type: 'result',
      careers
    };
  }

  let options = normalizeQuestionOptions(response.options);
  if (!String(response.question || '').trim() || options.length === 0) {
    throw createQuizFormatError('AI question did not include a question with options', 'AI_QUESTION_SHAPE');
  }

  const tagChoices = new Set(options.map(option => [...(option.tags || [])].sort().join(',')));
  if (options.length !== 4 || options.some(option => !option.tags?.length) || tagChoices.size !== 4) {
    throw createQuizFormatError('AI question must include four distinct career preference choices', 'AI_QUESTION_SHAPE');
  }

  options = options.slice(0, 4).map((option, index) => ({
    ...option,
    label: safeGetIndex(['A', 'B', 'C', 'D'], index)
  }));

  const parsedPhase = Number.parseInt(response.phase, 10);
  const parsedQuestionNumber = Number.parseInt(response.questionNumber, 10);

  return {
    ...response,
    type: 'question',
    phase: Number.isFinite(parsedPhase) ? Math.max(1, Math.min(parsedPhase, 4)) : 1,
    questionNumber: Number.isFinite(parsedQuestionNumber) ? parsedQuestionNumber : state.questionCount + 1,
    insight: String(response.insight || '').trim(),
    question: String(response.question).trim(),
    options
  };
}

export function normalizeQuestionOptions(options) {
  const rawOptions = Array.isArray(options)
    ? options
    : options && typeof options === 'object'
      ? Object.entries(options).map(([label, text]) => ({ label, text }))
      : [];
  const seenTexts = new Set();

  return rawOptions
    .map((option, index) => {
      const label = String(option?.label || String.fromCharCode(65 + index)).trim().slice(0, 1).toUpperCase();
      const rawText = typeof option === 'string' ? option : option?.text || option?.value || option?.description || '';
      const text = String(rawText).trim();
      const dedupeKey = normalizeMatchText(text);

      if (!text || seenTexts.has(dedupeKey)) return null;
      seenTexts.add(dedupeKey);
      const tags = [...new Set(Array.isArray(option?.tags) ? option.tags : [])]
        .filter(tag => typeof tag === 'string' && KNOWN_ROADMAP_SLUGS.has(tag));
      const pillar = ['systems', 'data_ai', 'design_product', 'cloud_infra', 'security', 'operations'].includes(option?.pillar) ? option.pillar : undefined;
      return { label: safeGetIndex(['A', 'B', 'C', 'D'], index) || label || 'A', text,
        ...(tags.length ? { tags } : {}), ...(pillar ? { pillar } : {}),
        ...(typeof option?.i === 'string' ? { i: option.i.trim() } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

export function showResults(state, data) {
  state.retryCount = 0;
  state.quizResults = data;

  document.getElementById('quizScreen').style.display = 'none';
  const resultScreen = document.getElementById('resultScreen');
  if (resultScreen) resultScreen.style.display = 'block';

  const container = document.getElementById('resultCards');
  if (!container) return;
  container.innerHTML = '';

  const careers = extractCareers(data);
  if (careers.length === 0) {
    container.innerHTML = `
      <div class="result-card visible">
        <h3>Unable to Load Career Paths</h3>
        <p class="result-desc">We could not parse the AI response. Please tap Retake Quiz and try again.</p>
      </div>
    `;
    return;
  }

  careers.forEach((career, i) => {
    container.insertAdjacentHTML('beforeend', renderCareerCard(career, i + 1));
  });

  setTimeout(() => {
    document.querySelectorAll('.result-card').forEach((card, i) => {
      setTimeout(() => card.classList.add('visible'), i * 250);
    });
  }, 200);
}

export function toggleDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

export function logoutUser(state) {
  localStorage.removeItem('sb_name');
  localStorage.removeItem('sb_email');
  localStorage.removeItem('sb_degree');
  localStorage.removeItem('sb_year');
  clearHumanProof(state);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = '/';
}
