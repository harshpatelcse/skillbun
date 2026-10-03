'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../components/AuthProvider';
import { normalizeInternalPath } from '@/utils/shared/routes';

export default function CounsellorPage() {
  const router = useRouter();
  const { user, profile, authLoading, profileLoading, isProfileComplete } = useAuth();

  useEffect(() => {
    const destination = normalizeInternalPath(`/counsellor${window.location.search}`, '/counsellor');
    if (!authLoading && !user) {
      router.replace(`/auth?next=${encodeURIComponent(destination)}`);
      return;
    }

    if (!authLoading && !profileLoading && user && !isProfileComplete) {
      router.replace(`/onboarding?next=${encodeURIComponent(destination)}`);
    }
  }, [authLoading, isProfileComplete, profileLoading, router, user]);

  useEffect(() => {
    if (authLoading || profileLoading || !user || !isProfileComplete) {
      return undefined;
    }

    let cancelled = false;
    let cleanup = () => {};

    import('@/utils/client/counsellorRuntime')
      .then(({ mountCounsellorRuntime }) => {
        if (cancelled) {
          return;
        }

        cleanup = mountCounsellorRuntime();
      })
      .catch((error) => {
        console.error('Failed to load counsellor runtime:', error);
      });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [authLoading, isProfileComplete, profileLoading, user]);

  if (authLoading || profileLoading || !profile.hydrated || !user || !isProfileComplete) return <div id="main-page" style={{ opacity: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingTop: '60px', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>Loading...</div>;

  const { name, degree, year } = profile;

  return (
    <>
      <div id="main-page" className="counsellor-workspace">
        <div className="workspace-container">
          {/* Workspace Left Sidebar: Desktop Desk Guide */}
          <aside className="workspace-sidebar">
            <div className="sidebar-card profile-card">
              <div className="profile-avatar-wrapper">
                <div className="profile-avatar">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                    <path d="M7 3v6"/>
                    <path d="M17 3v6"/>
                    <path d="M6 18c0-3 3-5 6-5s6 2 6 5v3H6v-3z"/>
                  </svg>
                </div>
                <div className="avatar-status-ring"></div>
              </div>
              <div className="profile-details">
                <h3>{name}</h3>
                <div className="profile-degree-badge">{degree}</div>
                <div className="profile-year-tag">Year {year}</div>
              </div>
            </div>
            
            <div className="sidebar-card limit-card" id="limitCard">
              <h4>
                <span className="card-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </span> Usage Quota
              </h4>
              <div className="limit-progress-container">
                <div className="limit-text">
                  <span>Messages Left</span>
                  <strong id="limitCount">100 / 100</strong>
                </div>
                <div className="limit-bar-bg">
                  <div className="limit-bar" id="limitBar" style={{ width: '100%' }}></div>
                </div>
              </div>
              <div className="limit-reset-info" id="limitReset">
                Timer starts on first message
              </div>
            </div>

            <div className="sidebar-card tips-card">
              <h4>
                <span className="card-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                </span> Pro Tips
              </h4>
              <ul>
                <li>Compare career tracks (e.g. <em>Web Dev vs DevOps</em>)</li>
                <li>Ask for global salaries in <strong>USD ($) or your local currency</strong></li>
                <li>Request interactive roadmaps & cert guidance</li>
                <li>Ask in English or your preferred conversational language!</li>
              </ul>
            </div>

            <div className="sidebar-card nav-card">
              <h4>
                <span className="card-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z"/></svg>
                </span> Fast Access
              </h4>
              <Link href="/dashboard" className="sidebar-link">
                <span className="link-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                </span> Dashboard
              </Link>
              <Link href="/quiz" className="sidebar-link">
                <span className="link-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                </span> Retake Career Quiz
              </Link>
            </div>
          </aside>

          {/* Main Chat Console */}
          <div id="chat-container" className="chat-console">
            {/* Mobile Top Compact Info Bar */}
            <div className="mobile-counsellor-bar">
              <div className="mobile-limit-badge">
                <span>Quota:</span>
                <strong id="mobileLimitCount">100/100</strong>
              </div>
              <div className="mobile-bar-actions">
                <Link href="/dashboard" className="mobile-icon-link" title="Dashboard">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                </Link>
                <Link href="/quiz" className="mobile-icon-link" title="Retake Quiz">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                </Link>
              </div>
            </div>

            <div className="chat-header">
              <div className="chat-header-main">
                <div className="chat-bot-icon-glow">
                  <div className="chat-bot-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M9 18h6"/></svg>
                  </div>
                  <span className="bot-status-ring"></span>
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-title-row">
                    <h2>BunBot</h2>
                    <span className="chat-engine-tag">AI Career Advisor</span>
                  </div>
                  <p>
                    <span className="status-dot"></span>
                    <span className="status-text">Online</span>
                    <span className="status-divider">•</span>
                    <span>Ready to help <strong>{name.split(' ')[0]}</strong></span>
                  </p>
                </div>
                <button className="chat-clear-btn" id="clearChatBtn" title="Clear Chat History">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  <span className="clear-text">Clear Chat</span>
                </button>
              </div>
            </div>

            <div id="securityBanner" style={{ display: 'none' }} className="security-banner-card">
              <div className="security-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div className="security-body">
                <p id="captchaStatus">Checking security...</p>
                <div id="captchaWidget"></div>
              </div>
            </div>

            <div className="chat-messages" id="chatMessages">
              <div className="message-row bot">
                <div className="msg-avatar bot">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="12" x="3" y="8" rx="2"/><path d="M12 2v6"/><circle cx="8" cy="14" r="1.5" fill="currentColor"/><circle cx="16" cy="14" r="1.5" fill="currentColor"/><path d="M9 18h6"/></svg>
                </div>
                <div className="message bot">
                  <p>Hi <strong>{name.split(' ')[0]}</strong>! I'm <strong>BunBot</strong>, your personal AI Career Advisor.</p>
                  <p>I can guide you through tech career paths worldwide. Ask me anything like:</p>
                  <ul>
                    <li>Pros and cons of learning different courses or languages</li>
                    <li>Salary expectations for various roles (e.g., <em>Data Scientist vs. Backend Dev</em>)</li>
                    <li>What a "day in the life" looks like for specific tech roles</li>
                    <li>Which projects, skills, or certifications fit your timeline</li>
                  </ul>
                  <p>What would you like to explore today?</p>
                </div>
              </div>
            </div>

            <div className="typing-indicator" id="typingIndicator">
              <span></span><span></span><span></span>
            </div>

            {/* Input area wrapper containing prompt starters and input console */}
            <div className="chat-input-wrapper">
              <p className="chat-session-note">This chat stays in this tab until you refresh or leave. Copy any advice you want to keep.</p>
              <div className="chat-suggestions-wrapper" id="chatSuggestionsWrapper">
                <div className="chat-suggestions-header">
                  <span id="suggestionsTitle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                    </svg>
                    Suggested Questions
                  </span>
                  <button id="refreshSuggestionsBtn" className="suggestions-refresh-btn" title="Shuffle new questions">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    Shuffle
                  </button>
                </div>
                <div className="chat-suggestions" id="chatSuggestions">
                  {/* Dynamically populated by smartSuggestions */}
                </div>
              </div>

              <div className="chat-input-area">
                <div className="chat-input-container">
                  <textarea id="chatInput" className="chat-input" placeholder="Ask BunBot anything about tech careers, roadmaps, salaries..." rows={1} aria-label="Chat input"></textarea>
                  <div className="chat-input-hint">Press <span>Enter ↵</span> to send</div>
                </div>
                <button className="chat-send-btn" id="sendBtn" title="Send message">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
