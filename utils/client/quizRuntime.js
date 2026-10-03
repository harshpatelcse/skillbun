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
import { careerCatalog } from '../shared/careerCatalog';
import { catalogCareer, groundDiscoveryResults, rankDiscoveryCareers, scoreDiscoveryChoice } from './quiz/careerDiscovery.mjs';

const SUPPORT_EMAIL = 'harsh@skillbun.tech';

export function mountQuizRuntime() {
  const eventController = new AbortController();
  const state = createState(eventController);

  let nextInsight = '';
  let quizQuestionsLoading = false;
  let quizLoadQueued = false;

  function getDominantPillar() {
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
Based on their answers above, generate ONE tailored student team-project preference question for Question 8 (Phase 3: AI Niche Deep-Dive).
Use plain first-year-friendly language. Explain any necessary technical term; do not test existing knowledge or ask for a right answer.
Give four genuinely different activities inside their dominant pillar (${dominantPillar}). Every option must carry a different valid career slug from this list: ${Object.keys(careerCatalog).filter(slug => careerCatalog[slug].pillar === dominantPillar).join(', ')}.

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
      "description": "2-3 sentences explaining WHY based on their specific answers.",
      "nextSteps": "Specific, actionable steps for a tech student or junior developer.",
      "roadmapUrl": "exact_slug_from_list"
    },
    { "rank": 2, ... },
    { "rank": 3, ... }
  ]
}
Do not generate a match percentage, salary figure, demand rating, employment guarantee or estimated chance of success. Ranking is exploratory and must be explained using the student's actual answers. The interface supplies salary estimates and skills from the public catalog.`;
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

  function getLocalFallbackResults() {
    return groundDiscoveryResults({}, state, careerCatalog);
  }

  const localFallbackQuestions = {
    "phase1": [
      {
        "id": 101,
        "phase": 1,
        "q": "{name}, your student team is making its first app. Which contribution sounds interesting?",
        "options": [
          {
            "l": "A",
            "t": "Explore the everyday work of a fullstack.",
            "pillar": "systems",
            "tags": [
              "fullstack"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "B",
            "t": "Explore the everyday work of a data analyst.",
            "pillar": "data_ai",
            "tags": [
              "data_analyst"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "C",
            "t": "Explore the everyday work of a ui ux design.",
            "pillar": "design_product",
            "tags": [
              "ui_ux_design"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "D",
            "t": "Explore the everyday work of a devops cloud.",
            "pillar": "cloud_infra",
            "tags": [
              "devops_cloud"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          }
        ]
      },
      {
        "id": 102,
        "phase": 1,
        "q": "A student club website needs improvements. Which activity would you try, {name}?",
        "options": [
          {
            "l": "A",
            "t": "Explore the everyday work of a frontend.",
            "pillar": "systems",
            "tags": [
              "frontend"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "B",
            "t": "Explore the everyday work of a site reliability engineer.",
            "pillar": "cloud_infra",
            "tags": [
              "site_reliability_engineer"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "C",
            "t": "Explore the everyday work of a ux researcher.",
            "pillar": "design_product",
            "tags": [
              "ux_researcher"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "D",
            "t": "Explore the everyday work of a qa automation.",
            "pillar": "operations",
            "tags": [
              "qa_automation"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          }
        ]
      },
      {
        "id": 103,
        "phase": 1,
        "q": "{name}, a mentor offers four beginner workshops. Which would you pick?",
        "options": [
          {
            "l": "A",
            "t": "Explore the everyday work of a python developer.",
            "pillar": "systems",
            "tags": [
              "python_developer"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "B",
            "t": "Explore the everyday work of a computer vision engineer.",
            "pillar": "data_ai",
            "tags": [
              "computer_vision_engineer"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "C",
            "t": "Explore the everyday work of a application security engineer.",
            "pillar": "security",
            "tags": [
              "application_security_engineer"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "D",
            "t": "Explore the everyday work of a embedded iot.",
            "pillar": "operations",
            "tags": [
              "embedded_iot"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          }
        ]
      },
      {
        "id": 104,
        "phase": 1,
        "q": "Which activity would you enjoy practicing in a small team project, {name}?",
        "options": [
          {
            "l": "A",
            "t": "Explore the everyday work of a backend.",
            "pillar": "systems",
            "tags": [
              "backend"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "B",
            "t": "Explore the everyday work of a data visualization specialist.",
            "pillar": "data_ai",
            "tags": [
              "data_visualization_specialist"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "C",
            "t": "Explore the everyday work of a content designer.",
            "pillar": "design_product",
            "tags": [
              "content_designer"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          },
          {
            "l": "D",
            "t": "Explore the everyday work of a iam engineer.",
            "pillar": "security",
            "tags": [
              "iam_engineer"
            ],
            "i": "This is an interest to explore through a small project, {name}."
          }
        ]
      }
    ]
  };

  function pickQuestionForStep(qNum) {
    const questionsObj = state.quizQuestions || localFallbackQuestions;
    const used = new Set(state.usedQuestionIds || []);

    if (qNum === 8) {
      const pool = (questionsObj.phase3Fallback?.[getDominantPillar()] || []).filter(q => !used.has(q.id));
      if (pool.length) {
        const picked = pool[Math.floor(Math.random() * pool.length)];
        state.usedQuestionIds.push(picked.id);
        return picked;
      }
    }

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
    if (state.signal.aborted) return;
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
          if (state.signal.aborted) return;

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
          if (state.signal.aborted) return;
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
        if (state.signal.aborted) return;

        document.getElementById('quizLoading').style.display = 'none';
        showResults(state, groundDiscoveryResults(aiResults, state, careerCatalog));
        posthog.capture('quiz_completed', {
          recommendation_source: 'ai',
          questions_answered: state.userAnswers.length,
          dominant_pillar: getDominantPillar(),
        });
      } catch (err) {
        if (state.signal.aborted) return;
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
    if (state.signal.aborted || element.disabled) return;
    state.lastSelectedOption = option;

    const { tags, pillar: optPillar } = scoreDiscoveryChoice(state, option, careerCatalog);

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
      if (!state.signal.aborted) advanceQuestion();
    }, 250);
  }

  async function loadMoreCareers() {
    const loadBtn = document.getElementById('loadMoreBtn');
    if (!loadBtn) return;
    const defaultLabel = loadBtn.dataset.defaultLabel || loadBtn.textContent;
    loadBtn.dataset.defaultLabel = defaultLabel;
    loadBtn.textContent = 'Finding more paths...';
    loadBtn.disabled = true;

    try {
      const container = document.getElementById('resultCards');
      if (!container) throw new Error('Results container not found');

      const existingSlugs = new Set(
        Array.from(container.querySelectorAll('.result-card'))
          .map(el => el.dataset.roadmapSlug)
          .filter(Boolean)
      );

      const candidateSlugs = rankDiscoveryCareers(state, careerCatalog);
      const unshownSlugs = candidateSlugs.filter(slug => !existingSlugs.has(slug));
      const next3Slugs = unshownSlugs.slice(0, 3);

      if (next3Slugs.length === 0) {
        loadBtn.textContent = 'No More Unique Paths';
        loadBtn.disabled = false;
        setTimeout(() => { loadBtn.textContent = 'Explore More Career Paths'; }, 2000);
        return;
      }

      const newCareers = next3Slugs.map(slug => catalogCareer(slug, careerCatalog, { related: true }));

      const existingCount = container.children.length;
      newCareers.forEach((career, i) => {
        container.insertAdjacentHTML('beforeend', renderCareerCard(career, existingCount + i + 1));
      });

      const newCards = container.querySelectorAll('.result-card.new:not(.visible)');
      newCards.forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 100);
      });

      loadBtn.textContent = 'Explore More Career Paths';
      loadBtn.disabled = false;

    } catch (err) {
      loadBtn.textContent = 'Failed — Try Again';
      loadBtn.disabled = false;
      setTimeout(() => { loadBtn.textContent = 'Explore More Career Paths'; }, 2000);
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
      state.identifiedPillar = null;
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
