'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { normalizeInternalPath } from '@/utils/shared/routes';
import { cinzel, pixelify } from '@/app/fonts';
import { useTranslation } from './components/I18nProvider';



const FLOATER_TEXTS = [
  'console.log("career")', 'import skills', 'git commit -m "future"',
  'npm i success', 'def find_path():', 'SELECT * FROM jobs',
  '404: fear not found', 'while(learning) grow()', 'sudo make me a developer',
  'git checkout new-life',
  'try { succeed() } catch (e) { learn() }', 'public static void main()',
  'SELECT dream FROM opportunities'
];

const FLOATER_LEFT_LANES = [10, 18, 27, 35];
const FLOATER_RIGHT_LANES = [57, 65, 74, 82];
const CAREER_FIELD_LINKS = [
  { label: 'AI/ML Engineer', href: '/roadmap/ai_ml_engineer' },
  { label: 'Full Stack Developer', href: '/roadmap/fullstack' },
  { label: 'Android Developer', href: '/roadmap/android' },
  { label: 'iOS Developer', href: '/roadmap/ios_developer' },
  { label: 'Flutter Developer', href: '/roadmap/flutter_developer' },
  { label: 'React Native Developer', href: '/roadmap/react_native_developer' },
  { label: 'Cybersecurity Specialist', href: '/roadmap/cybersecurity' },
  { label: 'Data Science & AI', href: '/roadmap/data_science' },
  { label: 'Analytics Engineer', href: '/roadmap/analytics_engineer' },
  { label: 'DevOps & Cloud Engineer', href: '/roadmap/devops_cloud' },
  { label: 'Game Developer', href: '/roadmap/game_development' },
  { label: 'Blockchain/Web3 Developer', href: '/roadmap/blockchain_web3' },
  { label: 'Robotics Engineer', href: '/roadmap/robotics_engineer' },
  { label: 'Embedded & IoT Developer', href: '/roadmap/embedded_iot' },
  { label: 'C/C++ Systems Developer', href: '/roadmap/c_cpp_systems_developer' },
  { label: 'Network Engineer', href: '/roadmap/network_engineer' },
  { label: 'UI/UX Designer', href: '/roadmap/ui_ux_design' },
];

const BUNBOT_DEMO_PROMPTS = [
  {
    id: 'swe_playbook',
    chipLabel: 'Tech Career Playbook',
    userMsg: 'I am a 2nd year CS student. How do I target high-compensation software engineer roles?',
    botIntro: 'Hey! For an early CS student, focus on Full Stack Web Dev or Backend Distributed Systems first. Here is your roadmap:',
    tags: [
      { text: 'Goal: Software Engineering', green: false },
      { text: 'Roadmap: Fullstack', green: true },
      { text: 'Portfolio & Referral Ready', green: true },
    ],
    botAdvice: 'Start building 2 production GitHub projects and prepare for internship & referral pipelines.',
    actionHref: '/counsellor?q=How+to+land+a+high+paying+software+engineering+job%3F',
    actionText: 'Ask BunBot this live →'
  },
  {
    id: 'devops_vs_fullstack',
    chipLabel: 'Fullstack vs DevOps',
    userMsg: 'DevOps vs Full Stack Developer: Which path hires faster in 2026 for junior developers?',
    botIntro: 'Compare the work you enjoy: Full Stack focuses on building web products, while DevOps focuses on deployment, automation, and reliability. Hiring and pay vary by location and experience.',
    tags: [
      { text: 'Build Products: Fullstack', green: true },
      { text: 'Roadmap: DevOps & Cloud', green: true },
      { text: 'Compare Local Opportunities', green: false },
    ],
    botAdvice: 'Best Strategy: Learn React & Node first, then add Docker + CI/CD to unlock high-paying DevOps hybrid roles.',
    actionHref: '/counsellor?q=Fullstack+vs+DevOps+global+salary+spectrum+and+remote+roles%3F',
    actionText: 'Compare paths with BunBot →'
  },
  {
    id: 'cybersecurity_certs',
    chipLabel: 'Cybersecurity Entry',
    userMsg: 'Is CEH certification mandatory for getting a junior SOC Analyst job?',
    botIntro: 'Skip expensive theoretical certs for now! Master Linux networking basics, TryHackMe labs, and get your SkillBun Cybersecurity Certificate first.',
    tags: [
      { text: 'Role: SOC Analyst', green: false },
      { text: 'Roadmap: Cybersecurity', green: true },
      { text: 'Key Skill: Linux & Pentest', green: true },
    ],
    botAdvice: 'Focus on hands-on SIEM log analysis & Linux command line proficiency over theoretical certifications.',
    actionHref: '/counsellor?q=Is+CEH+certification+worth+it+for+freshers%3F',
    actionText: 'Explore Security path live →'
  }
];

function PreviewIcon({ shield = false }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
      {shield ? <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 11 2 2 4-4" /></> : <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3z" /><path d="M8 7h8M8 11h6" /></>}
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [activeBunBotPrompt, setActiveBunBotPrompt] = useState(0);

  useEffect(() => {
    const shuffleTimeouts = [];
    const shuffleIntervals = [];
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('authRequired') === 'true') {
      window.history.replaceState({}, '', '/');
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Shuffle text animation (starts immediately on mount)
    const shuffleTexts = document.querySelectorAll('.shuffle-text');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&';

    // Scramble immediately on client mount so it doesn't flash the final word first
    shuffleTexts.forEach((el) => {
      const finalWord = el.getAttribute('data-final') || '';
      el.innerText = reducedMotion ? finalWord : finalWord.split('').map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    });

    shuffleTexts.forEach((el, idx) => {
      if (reducedMotion) return;
      const finalWord = el.getAttribute('data-final') || '';
      let iteration = 0;
      const timeoutId = window.setTimeout(() => {
        const iv = setInterval(() => {
          el.innerText = finalWord.split('').map((letter, i) => {
            if (i < iteration) return finalWord[i];
            return chars[Math.floor(Math.random() * chars.length)];
          }).join('');
          iteration += 1 / 3;
          if (iteration >= finalWord.length) {
            el.innerText = finalWord;
            clearInterval(iv);
          }
        }, 40);
        shuffleIntervals.push(iv);
      }, 200 + idx * 200);
      shuffleTimeouts.push(timeoutId);
    });

    // Floating code snippets in hero
    const floatersEl = document.getElementById('floaters');
    if (floatersEl) {
      floatersEl.innerHTML = '';
      let leftLaneIndex = 0;
      let rightLaneIndex = 0;

      for (let i = 0; i < FLOATER_TEXTS.length; i++) {
        const floater = document.createElement('div');
        floater.className = 'floater';
        floater.textContent = FLOATER_TEXTS[i];
        const placeOnLeft = i % 2 === 0;
        const laneGroup = placeOnLeft ? FLOATER_LEFT_LANES : FLOATER_RIGHT_LANES;
        const laneIndex = placeOnLeft ? leftLaneIndex++ : rightLaneIndex++;
        const baseLeft = laneGroup[laneIndex % laneGroup.length];
        const jitter = (Math.random() - 0.5) * 4;
        floater.style.left = `${baseLeft + jitter}%`;
        floater.style.animationDuration = `${10 + Math.random() * 12}s`;
        floater.style.animationDelay = `${Math.random() * 8}s`;
        floatersEl.appendChild(floater);
      }
    }

    let revealObserver;
    const revealNodes = Array.from(document.querySelectorAll('.sb-reveal'));
    if ('IntersectionObserver' in window) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

      revealNodes.forEach((node) => revealObserver.observe(node));
    } else {
      revealNodes.forEach((node) => node.classList.add('is-visible'));
    }

    return () => {
      shuffleTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      shuffleIntervals.forEach((intervalId) => window.clearInterval(intervalId));
      revealObserver?.disconnect();
      if (floatersEl) floatersEl.innerHTML = '';
    };
  }, [locale]);

  const openAuthModal = (destination) => {
    const next = normalizeInternalPath(destination, '/quiz');
    try {
      localStorage.setItem('sb_dest', next);
    } catch {
      // The URL carries the destination when browser storage is unavailable.
    }
    router.push(`/auth?next=${encodeURIComponent(next)}`);
  };

  return (
    <>
      <div id="main-page">
        {/* ===== HERO ===== */}
        <div className="hero" lang={locale}>
          <div className="hero-bg-glow"></div>
          <div className="floaters" id="floaters"></div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="hero-tag" lang={locale}>{t('hero.tagline', 'For Computer Science & Tech Students Worldwide')}</div>
            <h1 lang={locale}>{t('hero.headlinePart1', 'Your Tech')} <span className="shuffle-text" data-final={t('hero.careerWord', 'Career')} lang={locale}>{t('hero.careerWord', 'Career')}</span>,<br /><span
              className="highlight" lang={locale}>{t('hero.engineeredFor', 'Engineered For')} <span className="shuffle-text" data-final={t('hero.successWord', 'Success')} lang={locale}>{t('hero.successWord', 'Success')}</span>.</span></h1>
            <div className="hero-btns">
              <button onClick={() => openAuthModal('/quiz')} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
                {t('hero.ctaStartQuiz', 'Take the Career Quiz')}
              </button>
              <a href="#features" className="btn-secondary hero-secondary" lang={locale}>{t('hero.seePlatform', 'See the platform')}</a>
              <Link href="/certificate" className="btn-secondary hero-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 11 2 2 4-4" />
                </svg>
                {t('hero.verifyCert', 'Verify Certificate')}
              </Link>
            </div>
            <div className="hero-signal-strip" aria-label="SkillBun guidance flow">
              <span lang={locale}>{t('hero.signalProfile', 'Profile')}</span>
              <span lang={locale}>{t('hero.signalQuiz', 'Adaptive Quiz')}</span>
              <span lang={locale}>{t('hero.signalMatch', 'Career Match')}</span>
              <span lang={locale}>{t('hero.signalRoadmap', 'Roadmap')}</span>
            </div>
          </div>
        </div>

        {/* ===== STUDENT MOMENTS ===== */}
        <section className="sb-section sb-moments-section sb-reveal" aria-labelledby="student-moments-title">
          <div className="sb-moments-shell">
            <div className="sb-moments-copy">
              <div className="section-label" lang={locale}>{t('sections.sampleMoments.tag', 'Sample student moments')}</div>
              <h2 id="student-moments-title" className="section-title" lang={locale}>{t('sections.sampleMoments.title', 'The kind of clarity SkillBun is built to create')}</h2>
              <p className="section-sub" lang={locale}>{t('sections.sampleMoments.subtitle', 'Illustrative guidance moments, not testimonials. These show the journey SkillBun is designed to support before, during, and after the quiz.')}</p>
              <div className="sb-guidance-rhythm" aria-label="SkillBun guidance rhythm">
                <span lang={locale}>{t('sections.sampleMoments.rhythm1', 'Profile context')}</span>
                <span lang={locale}>{t('sections.sampleMoments.rhythm2', 'Adaptive quiz')}</span>
                <span lang={locale}>{t('sections.sampleMoments.rhythm3', 'Roadmap support')}</span>
              </div>
            </div>

            <div className="sb-guidance-console" aria-label="Illustrative SkillBun guidance moments">
              <div className="sb-console-topline">
                <span className="sb-console-dot"></span>
                <span>skillbun.guidance.flow</span>
              </div>

              <div className="sb-moment-rail" aria-hidden="true">
                <span></span>
              </div>

              <div className="sb-moment-grid">
                <article className="sb-moment-card before">
                  <span className="sb-moment-tag" lang={locale}>{t('sections.sampleMoments.beforeLabel', 'Before')}</span>
                  <p lang={locale}>{t('sections.sampleMoments.beforeText', 'I like tech, but I don’t know where to start.')}</p>
                </article>

                <article className="sb-moment-card profile">
                  <span className="sb-moment-tag" lang={locale}>{t('sections.sampleMoments.profileSignal', 'Profile signal')}</span>
                  <h3>{t('sections.sampleMoments.profileTitle', 'Context first')}</h3>
                  <p lang={locale}>{t('sections.sampleMoments.profileDesc', 'Degree, year, interests, and learning confidence shape the first guidance layer.')}</p>
                  <div className="sb-signal-chips">
                    <span>CS / Software Engg</span>
                    <span>2nd Year</span>
                    <span>Not sure yet</span>
                  </div>
                </article>

                <article className="sb-moment-card quiz">
                  <span className="sb-moment-tag" lang={locale}>{t('sections.sampleMoments.quizAdapts', 'Quiz adapts')}</span>
                  <h3>{t('sections.sampleMoments.quizTitle', 'Answers shape the next question')}</h3>
                  <p lang={locale}>{t('sections.sampleMoments.quizDesc', 'If you lean toward building, data, security, or cloud, the quiz narrows instead of staying generic.')}</p>
                </article>

                <article className="sb-moment-card recommendation">
                  <span className="sb-moment-tag" lang={locale}>{t('sections.sampleMoments.recClarity', 'Recommendation clarity')}</span>
                  <h3>{t('sections.sampleMoments.recTitle', 'Not just a career name')}</h3>
                  <p lang={locale}>{t('sections.sampleMoments.recDesc', 'Fit reason, skills, demand, salary context, and the next step sit together so comparison feels calmer.')}</p>
                </article>

                <article className="sb-moment-card roadmap">
                  <span className="sb-moment-tag" lang={locale}>{t('sections.sampleMoments.roadmapBunbot', 'Roadmap + BunBot')}</span>
                  <h3>{t('sections.sampleMoments.roadmapTitle', 'Keep moving after results')}</h3>
                  <p lang={locale}>{t('sections.sampleMoments.roadmapDesc', 'Open a skill tree, build projects, track progress, and ask BunBot when a topic feels foggy.')}</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        {/* ===== WHAT SKILLBUN DOES ===== */}
        <section id="features" className="sb-section sb-reveal">
          <div className="section-label" lang={locale}>{t('sections.os.tag', 'SkillBun')}</div>
          <h2 className="section-title" lang={locale}>{t('sections.os.title', 'A complete guidance system before you pick a tech path')}</h2>
          <p className="section-sub" lang={locale}>{t('sections.os.subtitle', 'Most students get scattered advice. SkillBun connects profile, quiz, recommendations, roadmaps, and counselling into one clear flow.')}</p>
          <div className="sb-capability-grid">
            <div className="sb-capability">
              <span className="sb-capability-kicker">01</span>
              <h3>{t('sections.os.cap1Title', 'Understand your starting point')}</h3>
              <p lang={locale}>{t('sections.os.cap1Desc', 'Collect degree, year, interests, and confidence level so guidance starts from your real student context.')}</p>
            </div>
            <div className="sb-capability">
              <span className="sb-capability-kicker">02</span>
              <h3>{t('sections.os.cap2Title', 'Ask adaptive questions')}</h3>
              <p lang={locale}>{t('sections.os.cap2Desc', 'The quiz changes direction based on your answers instead of forcing every student through the same form.')}</p>
            </div>
            <div className="sb-capability">
              <span className="sb-capability-kicker">03</span>
              <h3>{t('sections.os.cap3Title', 'Explain career matches')}</h3>
              <p lang={locale}>{t('sections.os.cap3Desc', 'Recommendations include match strength, skills, demand, salary context, and next steps you can compare.')}</p>
            </div>
            <div className="sb-capability">
              <span className="sb-capability-kicker">04</span>
              <h3>{t('sections.os.cap4Title', 'Turn decisions into action')}</h3>
              <p lang={locale}>{t('sections.os.cap4Desc', 'Native roadmap pages break careers into staged skill trees, projects, resources, and progress checkpoints.')}</p>
            </div>
          </div>
        </section>

        {/* ===== JOURNEY ===== */}
        <section id="how" className="sb-section sb-reveal">
          <div className="section-label" lang={locale}>{t('sections.journey.tag', 'The Journey')}</div>
          <h2 className="section-title" lang={locale}>{t('sections.journey.title', 'From confused student to focused roadmap')}</h2>
          <p className="section-sub" lang={locale}>{t('sections.journey.subtitle', 'The public homepage stays open for every viewer. When you are ready, the same CTA takes you through onboarding, quiz, recommendation, and roadmap.')}</p>
          <div className="sb-journey" aria-label="SkillBun user journey">
            <div className="sb-journey-line"></div>
            <div className="sb-journey-step">
              <div className="sb-journey-dot">1</div>
              <h3>{t('sections.journey.step1Title', 'Explore the platform')}</h3>
              <p lang={locale}>{t('sections.journey.step1Desc', 'Understand what SkillBun can do before sharing details or starting the quiz.')}</p>
            </div>
            <div className="sb-journey-step">
              <div className="sb-journey-dot">2</div>
              <h3>{t('sections.journey.step2Title', 'Enter profile details')}</h3>
              <p lang={locale}>{t('sections.journey.step2Desc', 'Tell SkillBun your name, degree, current year, and optional interest area.')}</p>
            </div>
            <div className="sb-journey-step">
              <div className="sb-journey-dot">3</div>
              <h3>{t('sections.journey.step3Title', 'Take the adaptive quiz')}</h3>
              <p lang={locale}>{t('sections.journey.step3Desc', 'Answer focused questions about interests, strengths, learning style, and goals.')}</p>
            </div>
            <div className="sb-journey-step">
              <div className="sb-journey-dot">4</div>
              <h3>{t('sections.journey.step4Title', 'Open your roadmap')}</h3>
              <p lang={locale}>{t('sections.journey.step4Desc', 'Use your recommended skill tree to learn, build projects, and ask BunBot for help.')}</p>
            </div>
          </div>
        </section>

        {/* ===== AI QUIZ ENGINE ===== */}
        <section className="sb-section sb-split sb-reveal">
          <div className="sb-copy-block">
            <div className="section-label" lang={locale}>{t('sections.quizEngine.tag', 'AI Quiz Engine')}</div>
            <h2 className="section-title" lang={locale}>{t('sections.quizEngine.title', 'A quiz that behaves more like a career interview')}</h2>
            <p className="section-sub" lang={locale}>{t('sections.quizEngine.subtitle', 'SkillBun asks 10 adaptive questions that respond to your answers and recommends careers built on your signal.')}</p>
            <div className="sb-check-list">
              <span lang={locale}>{t('sections.quizEngine.check1', 'Interest, strengths, and learning-style discovery')}</span>
              <span lang={locale}>{t('sections.quizEngine.check2', 'Branching questions that narrow the path')}</span>
              <span lang={locale}>{t('sections.quizEngine.check3', 'Human verification and rate limits stay protected')}</span>
            </div>
          </div>
          <div className="sb-quiz-panel" aria-label="Adaptive quiz preview">
            <div className="sb-panel-top">
              <span lang={locale}>{t('sections.quizEngine.phase', 'Phase 1: Discovery')}</span>
              <span lang={locale}>{t('sections.quizEngine.questionMeta', 'Question 7 / 10')}</span>
            </div>
            <div className="sb-progress-shell"><span></span></div>
            <h3>{t('sections.quizEngine.sampleQ', 'Which problem sounds exciting to solve?')}</h3>
            <div className="sb-answer-stack">
              <div className="sb-answer active" lang={locale}>{t('sections.quizEngine.ans1', 'Making apps that people use daily')}</div>
              <div className="sb-answer" lang={locale}>{t('sections.quizEngine.ans2', 'Finding hidden patterns in data')}</div>
              <div className="sb-answer" lang={locale}>{t('sections.quizEngine.ans3', 'Protecting systems from attacks')}</div>
              <div className="sb-answer" lang={locale}>{t('sections.quizEngine.ans4', 'Automating cloud deployments')}</div>
            </div>
          </div>
        </section>

        {/* ===== RECOMMENDATION OUTPUT ===== */}
        <section className="sb-section sb-reveal">
          <div className="section-label" lang={locale}>{t('sections.recOutput.tag', 'Career Recommendations')}</div>
          <h2 className="section-title" lang={locale}>{t('sections.recOutput.title', 'Results that explain why a path fits you')}</h2>
          <p className="section-sub" lang={locale}>{t('sections.recOutput.subtitle', 'The quiz does not stop at a career name. It gives you context you can actually use while deciding what to learn next.')}</p>
          <div className="sb-results-showcase">
            <div className="sb-result-card sb-result-primary">
              <div className="sb-result-meta">
                <span lang={locale}>{t('sections.recOutput.topMatch', 'Top Match')}</span>
                <strong>94%</strong>
              </div>
              <h3>Full Stack Developer</h3>
              <p>Best fit if you enjoy building visible products, connecting interfaces to data, and learning by shipping projects.</p>
              <div className="sb-mini-tags">
                <span>React</span>
                <span>APIs</span>
                <span>Databases</span>
              </div>
            </div>
            <div className="sb-result-card">
              <div className="sb-result-meta">
                <span lang={locale}>{t('sections.recOutput.strongFit', 'Strong Fit')}</span>
                <strong>88%</strong>
              </div>
              <h3>Data Analyst</h3>
              <p>Great for students who like finding meaning in numbers, dashboards, and business decisions.</p>
              <div className="sb-mini-tags">
                <span>SQL</span>
                <span>Excel</span>
                <span>BI</span>
              </div>
            </div>
            <div className="sb-result-card">
              <div className="sb-result-meta">
                <span lang={locale}>{t('sections.recOutput.explore', 'Explore')}</span>
                <strong>82%</strong>
              </div>
              <h3>Cybersecurity</h3>
              <p>A solid path if you enjoy puzzles, systems thinking, and protecting users from real-world threats.</p>
              <div className="sb-mini-tags">
                <span>Networks</span>
                <span>Linux</span>
                <span>Security</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===== ROADMAP PREVIEW ===== */}
        <section className="sb-section sb-split sb-split-reverse sb-reveal">
          <div className="sb-roadmap-preview" aria-label="Roadmap preview">
            <div className="sb-roadmap-node root">
              <span>&lt;/&gt;</span>
              <strong>Career Core</strong>
            </div>
            <div className="sb-roadmap-branches">
              <div className="sb-roadmap-node"><span>01</span><strong>Foundations</strong></div>
              <div className="sb-roadmap-node"><span>02</span><strong>Projects</strong></div>
              <div className="sb-roadmap-node"><span>03</span><strong>Portfolio</strong></div>
            </div>
            <div className="sb-roadmap-pulse"></div>
          </div>
          <div className="sb-copy-block">
            <div className="section-label" lang={locale}>{t('sections.roadmapPreview.tag', 'Interactive Roadmaps')}</div>
            <h2 className="section-title" lang={locale}>{t('sections.roadmapPreview.title', 'Every recommendation becomes a skill tree')}</h2>
            <p className="section-sub" lang={locale}>{t('sections.roadmapPreview.subtitle', 'Roadmaps are not static PDFs. They unlock step-by-step, track local progress, include resources, and let you ask BunBot about any topic.')}</p>
            <div className="sb-check-list">
              <span lang={locale}>{t('sections.roadmapPreview.check1', 'Skill nodes with prerequisite flow')}</span>
              <span lang={locale}>{t('sections.roadmapPreview.check2', 'Portfolio-ready project checkpoints')}</span>
              <span lang={locale}>{t('sections.roadmapPreview.check3', 'Progress, XP, resources, and BunBot help')}</span>
            </div>
          </div>
        </section>

        {/* ===== VERIFIABLE CERTIFICATIONS ===== */}
        <section className="sb-section sb-split sb-split-reverse sb-reveal">
          <div className="sb-cert-showcase" style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--card-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div className="sb-cert-mock" style={{
              position: 'relative',
              width: '100%',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: 'var(--card-shadow)',
              containerType: 'inline-size'
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/certificate-template.png"
                alt="Illustrative SkillBun certificate preview with a sample student and roadmap"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
                draggable={false}
              />

              {/* Overlay: Fix SKILLBUN text */}
              <div className="sb-cert-mock-overlay-skillbun" aria-hidden="true">
                <span className="sb-cert-mock-text-skillbun">ꌗꀘꀤ꒒꒒ꌃꀎꈤ</span>
              </div>

              {/* Overlay: Recipient Name */}
              <p className={`sb-cert-mock-name ${cinzel.className}`}>STUDENT NAME</p>

              {/* Overlay: Roadmap Title */}
              <h2
                className={`sb-cert-mock-title ${pixelify.className}`}
                style={{ '--char-count': 21 }}
              >
                YOUR LEARNING ROADMAP
              </h2>

              {/* Overlay: Certificate ID below QR */}
              <div className="sb-cert-mock-qr-meta">
                <span className="sb-cert-mock-qr-meta-id">cert_xxxx_xxxx</span>
              </div>
            </div>
            
            <div style={{
              background: 'var(--danger-soft)',
              border: '1px dashed var(--danger)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.8rem',
              color: 'var(--text)'
            }}>
              <strong style={{ color: 'var(--danger)', display: 'block', marginBottom: '4px' }}><PreviewIcon shield />{t('sections.certs.antiCheatingTitle', 'Anti-Cheating Exam Proctoring')}</strong>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: '1.4' }}>
                {t('sections.certs.antiCheatingDesc', 'Quizzes enforce text-selection & copy blocking, right-click prevention, background blurring on focus loss, student-identifying watermarks (email, IP, timestamp), and AI-assistant refusal tags.')}
              </p>
            </div>
          </div>

          <div className="sb-copy-block">
            <div className="section-label" lang={locale}>{t('sections.certs.tag', 'Certifications')}</div>
            <h2 className="section-title" lang={locale}>{t('sections.certs.title', 'Earn verifiable digital credentials')}</h2>
            <p className="section-sub" lang={locale}>{t('sections.certs.subtitle', 'Validate your progress. Once you complete 60% of any roadmap, take the proctored exam to earn a public certificate that employers can verify.')}</p>
            <div className="sb-check-list">
              <span lang={locale}>{t('sections.certs.check1', 'Dynamic 10-question quiz (3 Easy, 5 Moderate, 2 Hard)')}</span>
              <span lang={locale}>{t('sections.certs.check2', '45s question limit & focus loss window masking protection')}</span>
              <span lang={locale}>{t('sections.certs.check3', 'Retry rules: 2 attempts per try, 1-hour study cooldown, max 3 tries per 24 hours')}</span>
              <span lang={locale}>{t('sections.certs.check4', 'Public registry verification search page at `/certificate`')}</span>
            </div>
            <div style={{ marginTop: '20px' }}>
              <Link href="/certificate" className="btn-secondary sb-inline-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                {t('sections.certs.btn', 'Open Verification Registry')}
              </Link>
            </div>
          </div>
        </section>

        {/* ===== BUNBOT SHOWCASE (INTERACTIVE ENGINE) ===== */}
        <section id="bunbot" className="sb-section sb-split sb-reveal">
          <div className="sb-copy-block">
            <div className="section-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '5px' }}>
                <rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M9 18h6"/>
              </svg>
              {t('sections.counsellor.tag', 'BunBot AI Advisor')}
            </div>
            <h2 className="section-title" lang={locale}>{t('sections.counsellor.title', 'Your 24/7 AI companion for tech career decisions')}</h2>
            <p className="section-sub" lang={locale}>{t('sections.counsellor.subtitle', 'Trained on global tech industry realities. Ask follow-up questions about salaries, degree playbooks, roadmap tradeoffs, certifications, and international remote strategies.')}</p>

            <div className="sb-bot-signal-strip">
              <span className="sb-bot-signal-pill"><PreviewIcon />100+ Roadmaps Sync</span>
              <span className="sb-bot-signal-pill"><PreviewIcon />Profile Memory Engine</span>
              <span className="sb-bot-signal-pill"><PreviewIcon />Global Salary Radar</span>
              <span className="sb-bot-signal-pill"><PreviewIcon shield />100% Free</span>
            </div>
            
            <div className="sb-bot-pillar-grid">
              <div className="sb-bot-pillar-card">
                <div className="sb-bot-pillar-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
                </div>
                <div>
                  <strong>Degree & Stage Aware</strong>
                  <p>Remembers your degree, year, bootcamp, or self-taught timeline to align advice with your career stage.</p>
                </div>
              </div>
              <div className="sb-bot-pillar-card">
                <div className="sb-bot-pillar-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div>
                  <strong>Global Salary Insights</strong>
                  <p>Provides realistic junior to senior salary spectrums across Big Tech, product scale-ups, and remote engineering roles.</p>
                </div>
              </div>
              <div className="sb-bot-pillar-card">
                <div className="sb-bot-pillar-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"/></svg>
                </div>
                <div>
                  <strong>100+ Roadmap Sync</strong>
                  <p>Recommends exact SkillBun roadmaps and study guide steps to unblock your learning journey.</p>
                </div>
              </div>
              <div className="sb-bot-pillar-card">
                <div className="sb-bot-pillar-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <div>
                  <strong>Global Tech Insights</strong>
                  <p>Benchmarks technical skills against worldwide developer standards and modern stack requirements.</p>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <Link href="/counsellor" className="btn-primary sb-inline-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M9 18h6"/>
                </svg>
                {t('sections.counsellor.chatBtn', 'Chat with BunBot Now')}
              </Link>
            </div>
          </div>

          <div className="sb-bot-window" aria-label="BunBot preview console">
            <div className="sb-bot-header">
              <div className="sb-bot-mac-dots">
                <span></span><span></span><span></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot"></span>
                <strong style={{ fontSize: '0.82rem', letterSpacing: '0.5px' }}>bunbot.engine</strong>
              </div>
              <span className="sb-bot-badge">Illustrative preview</span>
            </div>
            
            <div className="sb-bot-prompts-bar">
              <span className="sb-bot-prompts-label">Tap Prompt:</span>
              {BUNBOT_DEMO_PROMPTS.map((prompt, idx) => (
                <button
                  key={prompt.id}
                  type="button"
                  className={`sb-bot-prompt-chip ${activeBunBotPrompt === idx ? 'active' : ''}`}
                  aria-pressed={activeBunBotPrompt === idx}
                  onClick={() => setActiveBunBotPrompt(idx)}
                >
                  <span>{prompt.chipLabel}</span>
                </button>
              ))}
            </div>

            <div className="sb-bot-chat-preview">
              <div className="sb-bot-message user">
                {BUNBOT_DEMO_PROMPTS[activeBunBotPrompt].userMsg}
              </div>
              <div className="sb-bot-message bot">
                <p>{BUNBOT_DEMO_PROMPTS[activeBunBotPrompt].botIntro}</p>
                <div className="sb-bot-preview-tags">
                  {BUNBOT_DEMO_PROMPTS[activeBunBotPrompt].tags.map((tag, tIdx) => (
                    <span key={tIdx} className={`sb-bot-tag ${tag.green ? 'green' : ''}`}>
                      {tag.text}
                    </span>
                  ))}
                </div>
                <p style={{ marginTop: '10px', fontSize: '0.84rem', lineHeight: '1.45' }}>
                  {BUNBOT_DEMO_PROMPTS[activeBunBotPrompt].botAdvice}
                </p>
                <div style={{ marginTop: '12px' }}>
                  <Link href={BUNBOT_DEMO_PROMPTS[activeBunBotPrompt].actionHref} className="sb-bot-action-link">
                    {BUNBOT_DEMO_PROMPTS[activeBunBotPrompt].actionText}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CAREER FIELDS ===== */}
        <section id="careers" className="sb-section sb-reveal" style={{ paddingTop: 0 }}>
          <div className="section-label" lang={locale}>{t('sections.careerFields.tag', 'Explore Fields')}</div>
          <h2 className="section-title" lang={locale}>{t('sections.careerFields.title', 'Which path will you hop?')}</h2>
          <p className="section-sub" lang={locale}>{t('sections.careerFields.subtitle', 'SkillBun covers major and emerging tech roles for Computer Science, Software Engineering, IT, and self-taught learners worldwide.')}</p>
          <div className="fields-wrap">
            {CAREER_FIELD_LINKS.map((field) => (
              <a className="field-pill" href={field.href} key={field.href}>{field.label}</a>
            ))}
          </div>
        </section>

        {/* ===== TRUST ===== */}
        <section className="sb-section sb-trust-section sb-reveal">
          <div className="section-label" lang={locale}>{t('sections.trust.tag', 'Why It Feels Different')}</div>
          <h2 className="section-title" lang={locale}>{t('sections.trust.title', 'Detailed enough for decisions, friendly enough to start today')}</h2>
          <div className="sb-trust-grid">
            <div>
              <strong lang={locale}>{t('sections.trust.card1Title', 'Student-first')}</strong>
              <p lang={locale}>{t('sections.trust.card1Desc', 'Built around degree, year, uncertainty, and practical learning constraints.')}</p>
            </div>
            <div>
              <strong lang={locale}>{t('sections.trust.card2Title', 'Action-oriented')}</strong>
              <p lang={locale}>{t('sections.trust.card2Desc', 'Recommendations connect directly to roadmaps, projects, and follow-up help.')}</p>
            </div>
            <div>
              <strong lang={locale}>{t('sections.trust.card3Title', 'Safe by design')}</strong>
              <p lang={locale}>{t('sections.trust.card3Desc', 'Existing validation, rate limits, and human-verification protections remain intact.')}</p>
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <div className="cta-section sb-reveal">
          <div className="cta-card">
            <div className="welcome-bunny" style={{ marginBottom: '1rem' }}>
              <Image src="/logo.png" alt="SkillBun Logo" width={56} height={56} unoptimized />
            </div>
            <h2 lang={locale}>{t('sections.finalCta.title', 'Ready to Hop In?')}</h2>
            <p lang={locale}>{t('sections.finalCta.subtitle', "Explore your interests, find a roadmap, and take your next step with SkillBun. It's free to start.")}</p>
            <button onClick={() => openAuthModal('/quiz')} className="btn-primary" style={{ margin: '0 auto' }}>{t('sections.finalCta.button', "Start Your Quiz — It's Free")}</button>
          </div>
        </div>
        </div>

    </>
  );
}
