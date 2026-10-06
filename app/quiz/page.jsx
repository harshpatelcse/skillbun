'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { mountQuizRuntime } from '@/utils/client/quizRuntime';
import { trackEvent } from '@/lib/analytics';

export default function QuizPage() {
  const router = useRouter();
  const { user, profile, authLoading, profileLoading, isProfileComplete } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth?next=/quiz');
      return;
    }

    if (!authLoading && !profileLoading && user && !isProfileComplete) {
      router.replace('/onboarding?next=/quiz');
    }
  }, [authLoading, isProfileComplete, profileLoading, router, user]);

  useEffect(() => {
    if (authLoading || profileLoading || !user || !isProfileComplete) {
      return undefined;
    }

    const cleanup = mountQuizRuntime();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [authLoading, isProfileComplete, profileLoading, user]);

  useEffect(() => {
    const isQuizActive = () => {
      const quizScreen = document.getElementById('quizScreen');
      const resultScreen = document.getElementById('resultScreen');
      return Boolean(
        quizScreen &&
        quizScreen.style.display !== 'none' &&
        (!resultScreen || resultScreen.style.display === 'none')
      );
    };

    const handleBeforeUnload = (e) => {
      if (isQuizActive()) {
        e.preventDefault();
        e.returnValue = 'Are you sure you want to exit the quiz? Your quiz progress will be lost.';
        return e.returnValue;
      }
    };

    const handleInternalClick = (e) => {
      if (!isQuizActive()) return;

      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (link && !link.closest('#quizScreen') && !link.closest('#resultScreen')) {
        const confirmLeave = window.confirm('Are you sure you want to exit the quiz? Your quiz progress will be lost.');
        if (!confirmLeave) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    const handlePopState = () => {
      if (isQuizActive()) {
        const confirmLeave = window.confirm('Are you sure you want to exit the quiz? Your quiz progress will be lost.');
        if (!confirmLeave) {
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleInternalClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleInternalClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  if (authLoading || profileLoading || !profile.hydrated || !user || !isProfileComplete) return <div className="quiz-wrapper" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text)' }}>Loading...</div>;

  const { name, degree, year } = profile;

  return (
    <>
      <div className="quiz-wrapper">
        <div id="welcomeScreen" className="quiz-welcome">
            <div className="welcome-bunny"><Image src="/logo.png" alt="SkillBun Logo" width={64} height={64} /></div>
            <h1>Hey <span id="userName">{name.split(' ')[0]}</span>!</h1>
            <p>Let's find your perfect tech career path. I'll ask you <strong>10 questions</strong> that adapt based on your answers.</p>
            <div className="welcome-profile" id="welcomeProfile">
              <div className="profile-tag">Degree: {degree}</div>
              <div className="profile-tag">Year: {year}</div>
            </div>
            
            <div id="quizLoadError" className="quiz-load-error" role="alert" aria-live="polite" style={{ display: 'none' }}>
                <p id="quizLoadErrorMessage" className="quiz-load-error-message"></p>
                <button type="button" id="quizRetryBtn" className="btn-primary quiz-retry-btn">Retry</button>
            </div>
            <div id="captchaWrap" className="quiz-captcha-wrap" style={{ display: 'none' }}>
                <div id="captchaWidget" className="quiz-captcha-widget"></div>
                <p id="captchaStatus" className="quiz-captcha-status"></p>
            </div>
            <button
              type="button"
              className="btn-primary quiz-start-btn"
              id="startQuizBtn"
              disabled
              onClick={(e) => {
                trackEvent('quiz_started', { degree, year });
                const btn = e.currentTarget;
                btn.classList.add('loading');
                btn.innerHTML = '<span>Launching Quiz...</span>';
                
                setTimeout(() => {
                  const welcomeScreen = document.getElementById('welcomeScreen');
                  const quizScreen = document.getElementById('quizScreen');
                  if (welcomeScreen) welcomeScreen.style.display = 'none';
                  if (quizScreen) quizScreen.style.display = 'block';
                  btn.classList.remove('loading');
                  btn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Let's Begin!
                  `;
                }, 150);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Let's Begin!
            </button>
        </div>

        <div id="quizScreen" className="quiz-screen" style={{ display: 'none' }}>
            <div className="quiz-progress-wrap">
                <div className="quiz-phase" id="quizPhase">Phase 1: Discovery</div>
                <div className="quiz-progress-bar">
                    <div className="quiz-progress-fill" id="progressFill" style={{ width: '0%' }}></div>
                </div>
                <div className="quiz-progress-text">Question <span id="qNum">1</span> of <span id="qTotal">10</span></div>
            </div>

            <div className="quiz-question-card" id="questionCard">
                <div id="aiInsight" className="quiz-insight" style={{ display: 'none' }}></div>
                <div className="quiz-q-text" id="questionText">Loading your first question...</div>
            </div>

            <div className="quiz-options" id="optionsContainer">
            </div>

            <div className="quiz-loading" id="quizLoading" style={{ display: 'none' }}>
                <div className="quiz-loading-dots">
                    <span></span><span></span><span></span>
                </div>
                <p>SkillBun is thinking...</p>
            </div>
        </div>

        <div id="resultScreen" className="quiz-results" style={{ display: 'none' }}>
            <div className="result-header">
                <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="6"/>
                    <circle cx="12" cy="12" r="2"/>
                  </svg>
                </div>
                <h1>Your Career Matches</h1>
                <p>Based on your profile and answers, here are your top career paths:</p>
            </div>

            <div className="result-cards" id="resultCards">
            </div>

            <div className="result-actions">
                <button type="button" className="btn-primary" id="loadMoreBtn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Load More Career Paths
                </button>
                <button type="button" className="btn-secondary" id="retakeBtn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                  Retake Quiz
                </button>
                <Link href="/" className="btn-secondary">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                  Back to Home
                </Link>
            </div>
        </div>
      </div>
    </>
  )
}
