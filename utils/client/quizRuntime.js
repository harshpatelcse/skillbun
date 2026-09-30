'use client';

import {
  createState,
  hasFreshHumanProof,
  clearHumanProof,
  restoreHumanProof
} from './quiz/quizState';
import {
  fetchSecurityConfig,
  verifyHumanProof,
  refreshHumanProofSession,
  fetchGeminiPayload,
  fetchQuizQuestions
} from './quiz/quizApi';
import {
  initCaptcha,
  setCaptchaStatus
} from './quiz/quizCaptcha';
import {
  sanitize,
  loadProfile,
  resetQuizStateUI,
  updateProgress,
  showQuestion,
  showResults,
  renderCareerCard,
  buildErrorReportBody,
  createQuizFormatError,
  normalizeQuizResponse,
  extractCareers,
  resolveRoadmapSlug,
  resolveRoadmapUrl,
  toggleDropdown,
  logoutUser
} from './quiz/quizDom';
import posthog from 'posthog-js';

const SUPPORT_EMAIL = 'harsh@skillbun.tech';

export function mountQuizRuntime() {
  const eventController = new AbortController();
  const state = createState(eventController);

  let nextInsight = '';
  let quizQuestionsLoading = false;
  let quizLoadQueued = false;

  function getDominantPillar() {
    if (state.identifiedPillar && state.pillarScores[state.identifiedPillar] !== undefined) {
      return state.identifiedPillar;
    }
    const sorted = Object.entries(state.pillarScores).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'systems';
  }

  function getAiCall1Prompt() {
    const qSummary = state.userAnswers
      .map((ans, idx) => `Q${idx + 1}: ${ans.question} -> Answered [${ans.optionLabel}]: ${ans.optionText}`)
      .join('\n');

    const dominantPillar = getDominantPillar();
    const topTags = Object.entries(state.tagScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, s]) => `${t}: ${s}`)
      .join(', ');

    return `You are SkillBun's AI Tech Mentor for computer science and tech students worldwide.
STUDENT PROFILE:
- Name: ${state.userProfile.name}
- Degree: ${state.userProfile.degree}
- Year: ${state.userProfile.year}
- Stated Interest: ${state.userProfile.interest || 'Not specified'}
- Dominant Pillar: ${dominantPillar}
- Top Tag Scores: ${topTags || 'None'}

STUDENT ANSWERS SO FAR (Questions 1-7):
${qSummary}

YOUR TASK:
Based on their answers above, generate ONE highly tailored, realistic modern tech workplace scenario question for Question 8 (Phase 3: AI Niche Deep-Dive).
Test their preference between 2 competing technical sub-specializations inside their dominant pillar (${dominantPillar}).

RESPONSE FORMAT (JSON ONLY, no markdown):
{
  "type": "question",
  "phase": 3,
  "questionNumber": 8,
  "insight": "1-2 sentence mentor observation reflecting on ${state.userProfile.name}'s technical traits revealed so far.",
  "question": "Your dynamic situational question text?",
  "options": [
    {"label": "A", "text": "Option A text", "pillar": "${dominantPillar}", "tags": ["tag1"]},
    {"label": "B", "text": "Option B text", "pillar": "${dominantPillar}", "tags": ["tag2"]},
    {"label": "C", "text": "Option C text", "pillar": "${dominantPillar}", "tags": ["tag3"]},
    {"label": "D", "text": "Option D text", "pillar": "${dominantPillar}", "tags": ["tag4"]}
  ]
}`;
  }

  function getAiCall2Prompt() {
    const qSummary = state.userAnswers
      .map((ans, idx) => `Q${idx + 1}: ${ans.question} -> Answered [${ans.optionLabel}]: ${ans.optionText}`)
      .join('\n');

    const topPillars = Object.entries(state.pillarScores)
      .sort((a, b) => b[1] - a[1])
      .map(([pillar, score]) => `${pillar}: ${score} pts`)
      .join(', ');

    const topTags = Object.entries(state.tagScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t, s]) => `${t}: ${s}pts`)
      .join(', ');

    return `You are SkillBun's Elite Tech Mentor. Synthesize the student's complete 10-question diagnostic quiz into top 3 career recommendations.

STUDENT PROFILE:
- Name: ${state.userProfile.name}
- Degree: ${state.userProfile.degree}
- Year: ${state.userProfile.year}
- Interest: ${state.userProfile.interest || 'Not specified'}

PILLAR SCORES:
${topPillars}

TOP TAG SCORES:
${topTags}

FULL 10-QUESTION QUIZ ANSWERS:
${qSummary}

YOUR TASK:
Return EXACTLY 3 ranked career recommendations in JSON format.
Each "roadmapUrl" MUST be an exact bare local roadmap slug from SkillBun's 100 roadmaps (e.g., 'fullstack', 'frontend', 'backend', 'ai_ml_engineer', 'data_science', 'devops_cloud', 'cybersecurity', 'ui_ux_design', 'product_manager', 'cloud_architect', 'android', 'flutter_developer', 'react_native_developer', 'java_developer', 'python_developer', 'go_developer', 'rust_developer', 'nextjs_developer', 'data_engineering', 'data_analyst', 'site_reliability_engineer', 'qa_automation', 'technical_writing', 'penetration_tester', 'business_analyst', 'cloud_security_engineer').

RESPONSE FORMAT (JSON ONLY, no markdown):
{
  "type": "result",
  "careers": [
    {
      "rank": 1,
      "title": "Career Title",
      "matchPercent": 94,
      "description": "2-3 sentences explaining WHY based on their specific answers.",
      "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"],
      "salaryRange": "$XXk - $YYk USD / regional equivalent (entry level)",
      "demand": "High/Medium/Growing",
      "nextSteps": "Specific, actionable steps for a tech student or junior developer.",
      "roadmapUrl": "exact_slug_from_list"
    },
    { "rank": 2, ... },
    { "rank": 3, ... }
  ]
}`;
  }

  async function callGemini(promptText) {
    const verified = await verifyHumanProof(state, async () => {
      await initCaptcha(state);
    });
    if (!verified) {
      throw new Error('Human verification required');
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    };

    const data = await fetchGeminiPayload(state, payload);
    const parts = data?.candidates?.[0]?.content?.parts;
    let text = '';
    if (Array.isArray(parts)) {
      const textPart = parts.find(part => typeof part?.text === 'string' && part.text.trim());
      text = textPart?.text || '';
    }

    if (!text) throw new Error('Empty response from AI service');

    const parsedJSON = JSON.parse(text.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());
    return normalizeQuizResponse(state, parsedJSON);
  }

  async function callGeminiWithTimeout(promptText) {
    let timer;
    try {
      // Allow the server's bounded provider chain to finish before using local results.
      return await Promise.race([
        callGemini(promptText),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Quiz AI timeout')), 90000); })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  const fallbackCatalog = {
    // Systems
    fullstack: { title: 'Full Stack Web Developer', desc: 'Build scalable web applications end-to-end with modern frontend and backend frameworks.', salary: '$75k - $130k / yr (₹6 - ₹14 LPA)', demand: 'High', skills: ['JavaScript', 'React/Next.js', 'Node.js', 'PostgreSQL', 'REST APIs'] },
    frontend: { title: 'Frontend Developer', desc: 'Craft high-performance, responsive web interfaces and modern UI design systems.', salary: '$70k - $120k / yr (₹5 - ₹13 LPA)', demand: 'High', skills: ['HTML/CSS', 'JavaScript', 'React', 'Tailwind', 'Web Performance'] },
    backend: { title: 'Backend Systems Engineer', desc: 'Design microservices, high-throughput APIs, data pipelines, and database models.', salary: '$80k - $140k / yr (₹7 - ₹16 LPA)', demand: 'High', skills: ['Node.js/Go/Python', 'System Design', 'Databases', 'Docker', 'API Security'] },
    nextjs_developer: { title: 'Next.js & React Developer', desc: 'Build modern server-rendered web applications with Next.js & React.', salary: '$75k - $135k / yr (₹6 - ₹15 LPA)', demand: 'High', skills: ['Next.js', 'React', 'TypeScript', 'Server Components', 'GraphQL'] },
    android: { title: 'Android Mobile Developer', desc: 'Build native Android apps used by millions globally using Kotlin and Jetpack Compose.', salary: '$70k - $125k / yr (₹5 - ₹14 LPA)', demand: 'High', skills: ['Kotlin', 'Android SDK', 'Jetpack Compose', 'REST APIs', 'MVVM'] },
    ios_developer: { title: 'iOS Mobile Developer', desc: 'Craft sleek, high-end native iOS applications for Apple devices.', salary: '$80k - $145k / yr (₹7 - ₹16 LPA)', demand: 'High', skills: ['Swift', 'SwiftUI', 'Xcode', 'CoreData', 'iOS Design'] },
    flutter_developer: { title: 'Flutter Developer', desc: 'Build multi-platform mobile apps from a single codebase using Flutter.', salary: '$70k - $120k / yr (₹5 - ₹13 LPA)', demand: 'High', skills: ['Dart', 'Flutter', 'State Management', 'Firebase', 'Mobile UI'] },
    react_native_developer: { title: 'React Native Developer', desc: 'Build cross-platform iOS and Android apps using React and JavaScript.', salary: '$75k - $130k / yr (₹6 - ₹14 LPA)', demand: 'High', skills: ['React Native', 'JavaScript', 'Redux', 'Native Modules', 'Mobile Optimization'] },
    python_developer: { title: 'Python Software Engineer', desc: 'Build backend microservices, automation engines, and data applications.', salary: '$75k - $135k / yr (₹6 - ₹15 LPA)', demand: 'High', skills: ['Python', 'Django/FastAPI', 'PostgreSQL', 'Data Structures', 'Async IO'] },
    java_developer: { title: 'Java Enterprise Engineer', desc: 'Engineer robust enterprise platforms and backend microservices using Java & Spring.', salary: '$75k - $135k / yr (₹6 - ₹15 LPA)', demand: 'High', skills: ['Java', 'Spring Boot', 'Microservices', 'Hibernate', 'SQL'] },
    go_developer: { title: 'Go Systems Engineer', desc: 'Build ultra-fast, concurrent backend microservices and cloud infrastructure engines.', salary: '$85k - $155k / yr (₹8 - ₹18 LPA)', demand: 'High', skills: ['Go', 'Concurrency', 'gRPC', 'Docker', 'Distributed Systems'] },

    // Data & AI
    ai_ml_engineer: { title: 'AI & Machine Learning Engineer', desc: 'Develop intelligent AI models, neural networks, and LLM applications.', salary: '$90k - $160k / yr (₹8 - ₹18 LPA)', demand: 'High', skills: ['Python', 'PyTorch/TensorFlow', 'LLMs & RAG', 'Scikit-Learn', 'Math & Stats'] },
    data_science: { title: 'Data Scientist', desc: 'Extract strategic insights and predictive models from complex corporate datasets.', salary: '$80k - $140k / yr (₹6 - ₹15 LPA)', demand: 'High', skills: ['Python/R', 'Pandas', 'Statistical Modeling', 'Machine Learning', 'SQL'] },
    data_engineering: { title: 'Data Engineer', desc: 'Build distributed data pipelines, ETL flows, and cloud data warehouses.', salary: '$85k - $150k / yr (₹7 - ₹16 LPA)', demand: 'High', skills: ['Apache Spark', 'SQL', 'Kafka', 'Python/Scala', 'Data Warehouses'] },
    data_analyst: { title: 'Data Analyst', desc: 'Analyze data trends, build interactive dashboards, and drive business decision-making.', salary: '$60k - $100k / yr (₹4.5 - ₹10 LPA)', demand: 'High', skills: ['SQL', 'Excel', 'Tableau/PowerBI', 'Python', 'Business Metrics'] },

    // Cloud & Infra & Security
    devops_cloud: { title: 'DevOps & Cloud Engineer', desc: 'Automate CI/CD pipelines, Docker containers, and cloud infrastructure.', salary: '$85k - $150k / yr (₹7 - ₹16 LPA)', demand: 'High', skills: ['AWS/Azure', 'Docker & Kubernetes', 'Terraform', 'CI/CD', 'Linux'] },
    cybersecurity: { title: 'Cybersecurity Specialist', desc: 'Protect corporate networks, perform vulnerability audits, and safeguard data.', salary: '$75k - $140k / yr (₹6 - ₹15 LPA)', demand: 'High', skills: ['Network Security', 'Ethical Hacking', 'SIEM Tools', 'Cryptography', 'Linux'] },
    penetration_tester: { title: 'Penetration Tester / Red Teamer', desc: 'Simulate real-world cyberattacks to identify vulnerabilities in security posture.', salary: '$80k - $150k / yr (₹7 - ₹16 LPA)', demand: 'High', skills: ['Metasploit', 'Burp Suite', 'Web Security', 'Reverse Engineering', 'OSCP'] },
    cloud_architect: { title: 'Cloud Solutions Architect', desc: 'Design resilient, cost-effective, and secure enterprise multi-cloud architectures.', salary: '$110k - $190k / yr (₹10 - ₹22 LPA)', demand: 'High', skills: ['AWS/GCP/Azure', 'System Design', 'Cloud Security', 'Cost Optimization', 'Networking'] },

    // Design & Product
    ui_ux_design: { title: 'UI/UX Product Designer', desc: 'Craft delightful, user-centered digital interfaces and design systems.', salary: '$65k - $120k / yr (₹5 - ₹12 LPA)', demand: 'High', skills: ['Figma', 'User Research', 'Wireframing', 'Prototyping', 'Design Systems'] },
    product_manager: { title: 'Technical Product Manager', desc: 'Bridge business strategy, user empathy, and engineering execution.', salary: '$85k - $160k / yr (₹8 - ₹18 LPA)', demand: 'Growing', skills: ['Product Roadmap', 'Agile/Scrum', 'User Analytics', 'Feature Specifying', 'Leadership'] },
    qa_automation: { title: 'QA Automation Engineer', desc: 'Build automated testing suites and ensure software release quality across applications.', salary: '$65k - $115k / yr (₹5 - ₹12 LPA)', demand: 'High', skills: ['Selenium/Cypress', 'Playwright', 'JavaScript/Python', 'API Testing', 'CI/CD'] }
  };

  function getMeta(slug) {
    return fallbackCatalog[slug] || {
      title: slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      desc: 'Master the core skills and technology stack for this high-demand career path.',
      salary: '$75k - $130k / yr (₹6 - ₹14 LPA)',
      demand: 'High',
      skills: ['Core Fundamentals', 'Problem Solving', 'Tools & Frameworks', 'Agile Workflows']
    };
  }

  function getLocalFallbackResults() {
    const sortedTags = Object.entries(state.tagScores || {}).sort((a, b) => b[1] - a[1]);
    const topSlug1 = sortedTags[0]?.[0] || 'fullstack';
    const topSlug2 = sortedTags[1]?.[0] || 'backend';
    const topSlug3 = sortedTags[2]?.[0] || 'ai_ml_engineer';

    const m1 = getMeta(topSlug1);
    const m2 = getMeta(topSlug2);
    const m3 = getMeta(topSlug3);

    return {
      type: 'result',
      careers: [
        {
          rank: 1,
          title: m1.title,
          matchPercent: 94,
          description: m1.desc,
          skills: m1.skills || ['Problem Solving', 'Architecture', 'Clean Code', 'Git', 'Agile'],
          salaryRange: m1.salary,
          demand: m1.demand,
          nextSteps: 'Start mastering the core fundamentals on SkillBun roadmap.',
          roadmapUrl: topSlug1
        },
        {
          rank: 2,
          title: m2.title,
          matchPercent: 88,
          description: m2.desc,
          skills: m2.skills || ['System Design', 'API Integration', 'Data Structures', 'Testing'],
          salaryRange: m2.salary,
          demand: m2.demand,
          nextSteps: 'Explore real-world projects in this career domain.',
          roadmapUrl: topSlug2
        },
        {
          rank: 3,
          title: m3.title,
          matchPercent: 82,
          description: m3.desc,
          skills: m3.skills || ['Cloud & Tools', 'Analytics', 'Security', 'Automation'],
          salaryRange: m3.salary,
          demand: m3.demand,
          nextSteps: 'Check out the detailed step-by-step roadmap for your career.',
          roadmapUrl: topSlug3
        }
      ]
    };
  }

  const localFallbackQuestions = {
    phase1: [
      {
        id: 101, phase: 1,
        q: "Your college team is building a major project for an international tech hackathon. Which part of the project do you naturally take charge of, {name}?",
        options: [
          { l: "A", t: "Designing and building the core application logic, APIs, and databases so everything runs reliably.", pillar: "systems", tags: ["fullstack", "backend", "frontend"], i: "Solid engineering instinct, {name}! You naturally focus on core application architecture." },
          { l: "B", t: "Training an intelligent model or analyzing datasets to give your project smart predictive capabilities.", pillar: "data_ai", tags: ["ai_ml_engineer", "data_science"], i: "Analytical mindset, {name}! You look for patterns and intelligence in data." },
          { l: "C", t: "Crafting a beautiful, intuitive user interface in Figma and ensuring user flow is seamless.", pillar: "design_product", tags: ["ui_ux_design", "product_designer"], i: "Great user empathy, {name}! You prioritize user experience and visual interface design." },
          { l: "D", t: "Setting up cloud hosting on AWS/GCP, Docker containers, and CI/CD pipelines so deployment never fails.", pillar: "cloud_infra", tags: ["devops_cloud", "cloud_architect"], i: "Infrastructure-first thinking, {name}! You ensure high availability and smooth deployments." }
        ]
      },
      {
        id: 102, phase: 1,
        q: "During a global product launch event, the e-commerce backend experiences severe lag. What is your immediate diagnostic reaction, {name}?",
        options: [
          { l: "A", t: "Inspect server-side execution traces, database queries, and async code execution bottlenecks.", pillar: "systems", tags: ["backend", "java_developer", "go_developer"], i: "Deep troubleshooter, {name}! You jump right into code execution performance." },
          { l: "B", t: "Analyze real-time event telemetry to understand drop-offs, user funnel anomalies, and anomaly alerts.", pillar: "data_ai", tags: ["data_analyst", "analytics_engineer"], i: "Data-driven approach, {name}! You look at system health through metrics and user data." },
          { l: "C", t: "Redesign the checkout flow to gracefully inform users, queue traffic, and prevent cart abandonment frustration.", pillar: "design_product", tags: ["product_manager", "ux_researcher"], i: "Product-first vision, {name}! You focus on preserving user trust during downtime." },
          { l: "D", t: "Audit firewall traffic, auto-scaling worker groups, load balancers, and network ingress paths.", pillar: "cloud_infra", tags: ["site_reliability_engineer", "network_engineer"], i: "Resilience expert, {name}! You look at traffic routing, load balancers, and cloud infra capacity." }
        ]
      },
      {
        id: 103, phase: 1,
        q: "When exploring a new open-source repository on GitHub, what part of the repository pulls your interest first, {name}?",
        options: [
          { l: "A", t: "The clean directory layout, design patterns, object structures, and modular codebase logic.", pillar: "systems", tags: ["python_developer", "rust_developer"], i: "Architecture focused, {name}! Clean modular code is your technical benchmark." },
          { l: "B", t: "The data pipelines, PyTorch/TensorFlow scripts, data cleanups, and evaluation metrics.", pillar: "data_ai", tags: ["generative_ai_app_developer", "nlp_engineer"], i: "AI-curious mind, {name}! Machine learning and data pipelines catch your eye instantly." },
          { l: "C", t: "The frontend component library, design tokens, responsive CSS micro-animations, and UI components.", pillar: "design_product", tags: ["frontend", "design_systems_engineer"], i: "Eye for detail, {name}! Clean design tokens and frontend components excite you." },
          { l: "D", t: "The Dockerfile, Kubernetes helm charts, Terraform infrastructure scripts, and GitHub workflow actions.", pillar: "cloud_infra", tags: ["terraform_iac_engineer", "kubernetes_engineer"], i: "Automation pro, {name}! Infrastructure-as-code and container setups are your playground." }
        ]
      },
      {
        id: 104, phase: 1,
        q: "What type of technical problem feels most rewarding for you to solve after hours of effort, {name}?",
        options: [
          { l: "A", t: "Optimizing a slow API endpoint or database query from 2.5s down to 40ms.", pillar: "systems", tags: ["backend", "database_admin"], i: "Performance enthusiast, {name}! Speed and efficiency optimization drive your work." },
          { l: "B", t: "Getting a machine learning model to reach 96% accuracy on a complex, messy real-world dataset.", pillar: "data_ai", tags: ["computer_vision_engineer", "ai_ml_engineer"], i: "Precision seeker, {name}! Extracting high accuracy from noisy datasets is your specialty." },
          { l: "C", t: "Transforming a confusing 5-step user journey into a single, effortless 1-click action.", pillar: "design_product", tags: ["ui_ux_design", "service_designer"], i: "Simplicity champion, {name}! You turn complex user friction into elegant simple flows." },
          { l: "D", t: "Automating zero-downtime rolling upgrades across a multi-region cloud cluster.", pillar: "cloud_infra", tags: ["devops_cloud", "aws_cloud_engineer"], i: "Reliability builder, {name}! High availability and seamless upgrades give you peace of mind." }
        ]
      }
    ]
  };

  function pickQuestionForStep(qNum) {
    const questionsObj = state.quizQuestions || localFallbackQuestions;
    const used = new Set(state.usedQuestionIds || []);

    if (qNum <= 3) {
      if (state.identifiedPillar && Array.isArray(questionsObj.phase2?.[state.identifiedPillar])) {
        const p2Pool = questionsObj.phase2[state.identifiedPillar].filter(q => !used.has(q.id));
        if (p2Pool.length > 0) {
          const picked = p2Pool[Math.floor(Math.random() * p2Pool.length)];
          state.usedQuestionIds.push(picked.id);
          return picked;
        }
      }
      const p1Pool = (questionsObj.phase1 || localFallbackQuestions.phase1).filter(q => !used.has(q.id));
      if (p1Pool.length > 0) {
        const picked = p1Pool[Math.floor(Math.random() * p1Pool.length)];
        state.usedQuestionIds.push(picked.id);
        return picked;
      }
    }

    if (qNum >= 4 && qNum <= 7) {
      const dominantPillar = getDominantPillar();
      let pool = (questionsObj.phase2?.[dominantPillar] || []).filter(q => !used.has(q.id));
      if (pool.length === 0) {
        pool = (questionsObj.phase1 || localFallbackQuestions.phase1).filter(q => !used.has(q.id));
      }
      if (pool.length > 0) {
        const picked = pool[Math.floor(Math.random() * pool.length)];
        state.usedQuestionIds.push(picked.id);
        return picked;
      }
    }

    if (qNum >= 9 && qNum <= 10) {
      const p4Pool = (questionsObj.phase4 || []).filter(q => !used.has(q.id));
      if (p4Pool.length > 0) {
        const picked = p4Pool[Math.floor(Math.random() * p4Pool.length)];
        state.usedQuestionIds.push(picked.id);
        return picked;
      }
    }

    const fallbackAll = [
      ...(questionsObj.phase1 || localFallbackQuestions.phase1),
      ...Object.values(questionsObj.phase2 || {}).flat(),
      ...(questionsObj.phase4 || [])
    ].filter(q => !used.has(q.id));

    if (fallbackAll.length > 0) {
      const picked = fallbackAll[Math.floor(Math.random() * fallbackAll.length)];
      state.usedQuestionIds.push(picked.id);
      return picked;
    }

    // Absolute fail-safe: return first local fallback question
    const defaultQ = localFallbackQuestions.phase1[0];
    state.usedQuestionIds.push(defaultQ.id);
    return defaultQ;
  }

  async function advanceQuestion() {
    const qNum = state.questionCount + 1;
    state.questionCount = qNum;

    if (qNum <= 10) {
      if (qNum === 8) {
        document.getElementById('optionsContainer').style.display = 'none';
        document.getElementById('quizLoading').style.display = 'flex';
        const loadingP = document.getElementById('quizLoading').querySelector('p');
        if (loadingP) loadingP.textContent = 'SkillBun AI is generating your custom niche scenario...';

        try {
          const aiQuestion = await callGeminiWithTimeout(getAiCall1Prompt());

          document.getElementById('quizLoading').style.display = 'none';
          document.getElementById('optionsContainer').style.display = 'grid';

          showQuestion(state, {
            type: 'question',
            phase: 3,
            questionNumber: 8,
            insight: aiQuestion.insight || nextInsight || 'AI Niche Deep-Dive based on your Q1-Q7 answers.',
            question: aiQuestion.question,
            options: aiQuestion.options
          }, selectOption);
          nextInsight = '';
        } catch (err) {
          console.warn('AI Call 1 timeout/failed, using seamless local fallback Q8:', err.message);
          document.getElementById('quizLoading').style.display = 'none';
          document.getElementById('optionsContainer').style.display = 'grid';

          const fallbackQ = pickQuestionForStep(8);
          showQuestion(state, {
            type: 'question',
            phase: 3,
            questionNumber: 8,
            insight: nextInsight || 'Tracking your technical DNA preferences.',
            question: fallbackQ.q || fallbackQ.question,
            options: fallbackQ.options
          }, selectOption);
          nextInsight = '';
        }
      } else {
        const rawQ = pickQuestionForStep(qNum);
        if (rawQ) {
          let phaseNum = 1;
          if (qNum >= 4 && qNum <= 7) phaseNum = 2;
          if (qNum >= 9) phaseNum = 3;

          showQuestion(state, {
            type: 'question',
            phase: phaseNum,
            questionNumber: qNum,
            insight: nextInsight || (qNum > 1 ? `Tracking your technical DNA preferences.` : ''),
            question: rawQ.q || rawQ.question,
            options: rawQ.options
          }, selectOption);
          nextInsight = '';
        }
      }
    } else {
      document.getElementById('optionsContainer').style.display = 'none';
      document.getElementById('quizLoading').style.display = 'flex';
      const loadingP = document.getElementById('quizLoading').querySelector('p');
      if (loadingP) loadingP.textContent = 'SkillBun AI is synthesizing your 10-question career matches...';

      try {
        const aiResults = await callGeminiWithTimeout(getAiCall2Prompt());

        document.getElementById('quizLoading').style.display = 'none';
        showResults(state, aiResults);
        posthog.capture('quiz_completed', {
          recommendation_source: 'ai',
          questions_answered: state.userAnswers.length,
          dominant_pillar: getDominantPillar(),
        });
      } catch (err) {
        console.warn('AI Call 2 timeout/failed, rendering instant score-based recommendations:', err.message);
        document.getElementById('quizLoading').style.display = 'none';
        const fallbackResults = getLocalFallbackResults();
        showResults(state, fallbackResults);
        posthog.capture('quiz_completed', {
          recommendation_source: 'fallback',
          questions_answered: state.userAnswers.length,
          dominant_pillar: getDominantPillar(),
        });
      }
    }
  }

  function selectOption(option, element) {
    state.lastSelectedOption = option;

    const optPillar = option.pillar;
    if (optPillar && state.pillarScores[optPillar] !== undefined) {
      state.pillarScores[optPillar] += 1;
    }

    const tags = Array.isArray(option.tags) ? option.tags : [];
    tags.forEach((tag) => {
      state.tagScores[tag] = (state.tagScores[tag] || 0) + 1;
    });

    if (option.i) {
      nextInsight = option.i;
    }

    const optText = option.t || option.text || '';
    const optLabel = option.l || option.label || 'A';

    state.userAnswers.push({
      questionNumber: state.questionCount,
      question: document.getElementById('questionText')?.textContent || '',
      optionLabel: optLabel,
      optionText: optText,
      pillar: optPillar || 'general',
      tags: tags
    });

    document.querySelectorAll('.quiz-option').forEach(el => {
      el.classList.remove('selected');
      el.disabled = true;
    });
    element.classList.add('selected');

    setTimeout(() => {
      advanceQuestion();
    }, 250);
  }

  async function loadMoreCareers() {
    const loadBtn = document.getElementById('loadMoreBtn');
    if (!loadBtn) return;
    const defaultLabel = loadBtn.dataset.defaultLabel || loadBtn.textContent;
    loadBtn.dataset.defaultLabel = defaultLabel;
    loadBtn.textContent = '⏳ Finding more paths...';
    loadBtn.disabled = true;

    try {
      const container = document.getElementById('resultCards');
      if (!container) throw new Error('Results container not found');

      const existingSlugs = new Set(
        Array.from(container.querySelectorAll('.result-card'))
          .map(el => el.dataset.roadmapSlug)
          .filter(Boolean)
      );

      const sortedTags = Object.entries(state.tagScores || {})
        .sort((a, b) => b[1] - a[1])
        .map(([slug]) => slug);

      const catalogSlugs = Object.keys(fallbackCatalog);
      const candidateSlugs = Array.from(new Set([...sortedTags, ...catalogSlugs]));

      const unshownSlugs = candidateSlugs.filter(slug => !existingSlugs.has(slug));
      const next3Slugs = unshownSlugs.slice(0, 3);

      if (next3Slugs.length === 0) {
        loadBtn.textContent = '✅ No More Unique Paths';
        loadBtn.disabled = false;
        setTimeout(() => { loadBtn.textContent = '🔍 Load More Career Paths'; }, 2000);
        return;
      }

      const newCareers = next3Slugs.map((slug) => {
        const meta = getMeta(slug);
        const matchPct = Math.max(72, 90 - (existingSlugs.size * 3));
        return {
          title: meta.title,
          matchPercent: matchPct,
          description: meta.desc,
          skills: meta.skills || ['Core Fundamentals', 'Problem Solving', 'Tools & Frameworks', 'Agile Workflows'],
          salaryRange: meta.salary || '₹6 - ₹14 LPA',
          demand: meta.demand || 'High',
          nextSteps: 'Explore the step-by-step roadmap on SkillBun.',
          roadmapUrl: slug
        };
      });

      const existingCount = container.children.length;
      newCareers.forEach((career, i) => {
        container.insertAdjacentHTML('beforeend', renderCareerCard(career, existingCount + i + 1));
      });

      const newCards = container.querySelectorAll('.result-card.new:not(.visible)');
      newCards.forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 100);
      });

      loadBtn.textContent = '🔍 Load More Career Paths';
      loadBtn.disabled = false;

    } catch (err) {
      loadBtn.textContent = '❌ Failed — Try Again';
      loadBtn.disabled = false;
      setTimeout(() => { loadBtn.textContent = '🔍 Load More Career Paths'; }, 2000);
    }
  }

  const startQuizBtnEl = document.getElementById('startQuizBtn');
  if (startQuizBtnEl) {
    startQuizBtnEl.addEventListener('click', async (e) => {
      const startBtn = document.getElementById('startQuizBtn');
      if (!startBtn) return;

      if (!state.quizQuestions || quizQuestionsLoading || state.quizQuestionsLoadFailed) {
        e.preventDefault();
        e.stopPropagation();
        if (state.quizQuestionsLoadFailed) showQuizLoadError(state.quizLoadErrorInstance);
        return;
      }

      const welcomeScreen = document.getElementById('welcomeScreen');
      const quizScreen = document.getElementById('quizScreen');
      if (welcomeScreen) welcomeScreen.style.display = 'none';
      if (quizScreen) quizScreen.style.display = 'block';

      state.questionCount = 0;
      state.userAnswers = [];
      state.tagScores = {};
      state.usedQuestionIds = [];
      state.pillarScores = { systems: 0, data_ai: 0, design_product: 0, cloud_infra: 0, security: 0, operations: 0 };
      nextInsight = '';

      if (state.quizQuestions?.profileMapping && state.userProfile) {
        const interest = state.userProfile.interest;
        const mappedPillar = state.quizQuestions.profileMapping.interestToPillar?.[interest];
        if (mappedPillar) {
          state.identifiedPillar = mappedPillar;
          state.pillarScores[mappedPillar] = (state.pillarScores[mappedPillar] || 0) + 2;
        }

        const degree = state.userProfile.degree;
        const degreeBoosts = state.quizQuestions.profileMapping.degreeBoosts?.[degree];
        if (degreeBoosts) {
          Object.entries(degreeBoosts).forEach(([p, boost]) => {
            state.pillarScores[p] = (state.pillarScores[p] || 0) + boost;
          });
        }
      }

      advanceQuestion();

      // Parallel background security verification if captcha enabled
      if (state.securityConfig.captchaEnabled && !hasFreshHumanProof(state)) {
        void verifyHumanProof(state, async () => {
          await initCaptcha(state, loadQuizQuestions);
        });
      }
    }, { signal: state.signal });
  }

  const retakeBtnEl = document.getElementById('retakeBtn');
  if (retakeBtnEl) {
    retakeBtnEl.addEventListener('click', () => {
      resetQuizStateUI(state);
    }, { signal: state.signal });
  }

  const quizRetryBtnEl = document.getElementById('quizRetryBtn');
  if (quizRetryBtnEl) {
    quizRetryBtnEl.addEventListener('click', loadQuizQuestions, { signal: state.signal });
  }

  const loadMoreBtnEl = document.getElementById('loadMoreBtn');
  if (loadMoreBtnEl) {
    loadMoreBtnEl.dataset.defaultLabel = loadMoreBtnEl.textContent;
    loadMoreBtnEl.addEventListener('click', loadMoreCareers, { signal: state.signal });
  }

  function showQuizLoadError(err) {
    state.quizQuestionsLoadFailed = true;
    state.quizLoadErrorInstance = err;
    const wrap = document.getElementById('quizLoadError');
    const msg = document.getElementById('quizLoadErrorMessage');
    if (msg) {
      msg.textContent = err?.status === 401
        ? 'Your login session expired. Please sign in again to load the quiz.'
        : err?.status === 403
          ? 'Please complete human verification, then retry.'
          : 'We could not load the quiz right now. Please retry in a moment.';
    }
    if (wrap) wrap.style.display = 'flex';
  }

  function hideQuizLoadError() {
    state.quizQuestionsLoadFailed = false;
    state.quizLoadErrorInstance = null;
    const wrap = document.getElementById('quizLoadError');
    if (wrap) wrap.style.display = 'none';
  }

  async function loadQuizQuestions() {
    if (state.signal.aborted) return;
    if (state.quizQuestions && !state.quizQuestionsLoadFailed) return;
    if (quizQuestionsLoading) {
      quizLoadQueued = true;
      return;
    }
    quizQuestionsLoading = true;
    const startBtn = document.getElementById('startQuizBtn');
    if (startBtn) startBtn.disabled = true;
    if (quizRetryBtnEl) quizRetryBtnEl.disabled = true;

    try {
      const verified = await verifyHumanProof(state, () => initCaptcha(state, loadQuizQuestions));
      if (state.signal.aborted) return;
      if (!verified) {
        // A newly rendered CAPTCHA is still waiting for the student. Its callback
        // resumes loading after the challenge has actually completed.
        if (state.securityConfig.captchaEnabled && !state.captchaToken) return;
        const error = new Error('Human verification required.');
        error.status = 403;
        throw error;
      }

      const questions = await fetchQuizQuestions(state);
      if (state.signal.aborted) return;
      state.quizQuestions = questions;
      hideQuizLoadError();
      setCaptchaStatus('Verification complete. You can start now.', 'ok');
    } catch (err) {
      if (state.signal.aborted) return;
      console.error('Could not load encrypted quiz questions:', err.message);
      showQuizLoadError(err);
    } finally {
      quizQuestionsLoading = false;
      if (!state.signal.aborted) {
        if (startBtn) startBtn.disabled = !state.quizQuestions || state.quizQuestionsLoadFailed;
        if (quizRetryBtnEl) quizRetryBtnEl.disabled = false;
        if (quizLoadQueued) {
          quizLoadQueued = false;
          void loadQuizQuestions();
        }
      }
    }
  }

  async function initQuizPage() {
    const startBtn = document.getElementById('startQuizBtn');
    if (startBtn) startBtn.disabled = true;

    const hasProfile = loadProfile(state);
    if (!hasProfile) return;

    await fetchSecurityConfig(state);
    const hasReusableProof = await refreshHumanProofSession(state);
    if (state.signal.aborted) return;

    if (hasReusableProof) {
      const wrap = document.getElementById('captchaWrap');
      if (wrap) wrap.style.display = 'none';
      setCaptchaStatus('Security already verified for this session.', 'ok');
    }

    await loadQuizQuestions();
    if (state.signal.aborted) return;

    const userBadge = document.getElementById('userBadge');
    if (userBadge) userBadge.addEventListener('click', toggleDropdown, { signal: state.signal });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => logoutUser(state), { signal: state.signal });

  }

  initQuizPage().catch(err => console.error('Quiz page init failed:', err));

  return () => {
    eventController.abort();
    if (state.captchaWidgetId !== null && window.turnstile) {
      window.turnstile.remove(state.captchaWidgetId);
      state.captchaWidgetId = null;
    }
  };
}
