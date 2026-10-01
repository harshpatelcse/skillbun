'use client';

import { Suspense, useEffect, useMemo, useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import { normalizeInternalPath, buildOnboardingPath } from '@/utils/shared/routes';
import { validateEmail } from '@/utils/shared/emailValidator';
import posthog from 'posthog-js';

const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_COOLDOWN_KEY = 'sb_password_reset_available_at';

function readPasswordResetAvailableAt() {
  if (typeof window === 'undefined') {
    return 0;
  }

  try {
    const availableAt = Number(window.localStorage.getItem(PASSWORD_RESET_COOLDOWN_KEY) || 0);
    return Number.isFinite(availableAt) ? availableAt : 0;
  } catch {
    return 0;
  }
}

function friendlyAuthError(error) {
  const code = error?.code || '';

  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) {
    return 'That email or password does not match a SkillBun account.';
  }

  if (code.includes('auth/email-already-in-use')) {
    return 'That email already has an account. Try logging in instead.';
  }

  if (code.includes('auth/account-exists-with-different-credential') || code.includes('account-exists')) {
    return 'An account already exists with this email address. Please sign in using the method you originally registered with (e.g. Google or Password).';
  }

  if (code.includes('auth/weak-password')) {
    return 'Use a password with at least 6 characters.';
  }

  if (code.includes('auth/popup-closed-by-user')) {
    return 'The Google sign-in window was closed before finishing.';
  }

  if (code.includes('auth/unauthorized-domain')) {
    return 'This domain is not authorized in Firebase Authentication settings.';
  }

  if (code.includes('auth/too-many-requests')) {
    return 'Too many attempts. Wait a bit before trying again.';
  }

  return error?.message || 'Something went wrong. Please try again.';
}

function friendlyTurnstileError(errorCode) {
  const code = String(errorCode || '').trim();

  if (code === '110200') {
    return 'Domain is not authorized for this site key. Add this hostname in Cloudflare Turnstile Settings.';
  }

  if (code === '110100' || code === '110110' || code === '400020') {
    return 'Invalid site key. Please check your Cloudflare Turnstile configuration.';
  }

  if (code === '400070') {
    return 'Turnstile site key is disabled in Cloudflare Settings.';
  }

  if (code === '200500') {
    return 'Verification blocked. Check browser extensions (AdBlockers) or network connection.';
  }

  if (code === '110600' || code === '110620') {
    return 'Verification timed out. Please refresh and retry.';
  }

  return code ? `Verification failed (Error ${code}). Please retry.` : 'Verification failed. Please retry.';
}

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = normalizeInternalPath(searchParams.get('next'), '/dashboard');
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const {
    configured,
    user,
    authLoading,
    profileLoading,
    isProfileComplete,
    authError,
    signInWithGoogle,
    requestEmailSignup,
    completeEmailSignup,
    signInWithEmail,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState(initialMode);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  // Credentials stay in this component's memory until verification completes.
  const [password, setPassword] = useState('');
  const [signupChallenge, setSignupChallenge] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [signupAvailableAt, setSignupAvailableAt] = useState(0);
  const [verifyAvailableAt, setVerifyAvailableAt] = useState(0);
  const [otpClock, setOtpClock] = useState(0);
  const otpInput = useRef(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);
  const resetAvailableAt = useRef(0);

  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaWidgetId = useRef(null);
  const [captchaError, setCaptchaError] = useState('');

  const title = mode === 'signup' ? 'Create your SkillBun account' : 'Welcome back to SkillBun';
  const actionLabel = mode === 'signup' ? 'Send verification code' : 'Log in';
  const switchCopy = mode === 'signup' ? 'Already have an account?' : 'New to SkillBun?';
  const switchLabel = mode === 'signup' ? 'Log in' : 'Sign up';
  const isVerifyingSignup = mode === 'signup' && Boolean(signupChallenge);
  const signupCooldownSeconds = Math.max(0, Math.ceil((signupAvailableAt - otpClock) / 1000));
  const verifyCooldownSeconds = Math.max(0, Math.ceil((verifyAvailableAt - otpClock) / 1000));
  const codeExpired = Boolean(signupChallenge && otpClock >= signupChallenge.expiresAt);

  useEffect(() => {
    const intervalId = window.setInterval(() => setOtpClock(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (isVerifyingSignup) otpInput.current?.focus();
  }, [isVerifyingSignup]);

  useEffect(() => {
    if (authLoading || profileLoading || !user) {
      return;
    }

    router.replace(isProfileComplete ? next : buildOnboardingPath(next));
  }, [authLoading, isProfileComplete, next, profileLoading, router, user]);

  useEffect(() => {
    const updateResetCooldown = () => {
      const availableAt = Math.max(readPasswordResetAvailableAt(), resetAvailableAt.current);
      const nextCooldownSeconds = Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));

      setResetCooldownSeconds(nextCooldownSeconds);

      if (nextCooldownSeconds === 0 && availableAt > 0) {
        resetAvailableAt.current = 0;
        try { window.localStorage.removeItem(PASSWORD_RESET_COOLDOWN_KEY); } catch {}
      }
    };

    updateResetCooldown();
    const intervalId = window.setInterval(updateResetCooldown, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch('/api/config');
        if (!response.ok) return;
        const data = await response.json();
        const captcha = data?.captcha || {};
        if (captcha.enabled && captcha.siteKey) {
          setCaptchaEnabled(true);
          setCaptchaSiteKey(captcha.siteKey);
        }
      } catch (err) {
        console.warn('Could not load security config:', err);
      }
    }
    fetchConfig();

    // Parallel preloading of the Turnstile script immediately on mount
    if (typeof window !== 'undefined') {
      const existing = document.querySelector('script[data-turnstile="true"]');
      if (!existing && !window.turnstile) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = 'true';
        document.head.appendChild(script);
      }
    }
  }, []);

  useEffect(() => {
    if (!captchaEnabled || mode !== 'signup' || !captchaSiteKey) {
      return;
    }

    let active = true;
    let scriptPoll = null;
    let scriptTimeout = null;
    const scriptController = new AbortController();

    function waitForScript() {
      return new Promise((resolve, reject) => {
        if (window.turnstile) {
          resolve();
          return;
        }
        const existing = document.querySelector('script[data-turnstile="true"]');
        if (existing) {
          const finish = (error) => {
            clearInterval(scriptPoll);
            clearTimeout(scriptTimeout);
            if (error) reject(error);
            else resolve();
          };
          existing.addEventListener('load', () => finish(), { once: true, signal: scriptController.signal });
          existing.addEventListener('error', () => finish(new Error('Failed to load Turnstile script')), { once: true, signal: scriptController.signal });
          // Polling fallback just in case script loads but load event is missed
          scriptPoll = setInterval(() => {
            if (window.turnstile) {
              finish();
            }
          }, 50);
          scriptTimeout = setTimeout(() => finish(new Error('Turnstile script timed out')), 15000);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Turnstile script'));
        document.head.appendChild(script);
      });
    }

    function doRender() {
      if (!active || !window.turnstile) return;

      const container = document.getElementById('auth-captcha-widget');
      if (container) {
        container.innerHTML = '';
      }

      try {
        const widgetId = window.turnstile.render('#auth-captcha-widget', {
          sitekey: captchaSiteKey,
          theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
          callback: (token) => {
            setCaptchaToken(token);
            setCaptchaError('');
          },
          'expired-callback': () => {
            setCaptchaToken('');
          },
          'error-callback': (errorCode) => {
            setCaptchaToken('');
            setCaptchaError(friendlyTurnstileError(errorCode));
          }
        });
        captchaWidgetId.current = widgetId;
      } catch (e) {
        console.warn('Turnstile render error:', e);
      }
    }

    async function init() {
      try {
        await waitForScript();
        if (!active) return;

        if (window.turnstile) {
          const container = document.getElementById('auth-captcha-widget');
          if (!container) {
            setTimeout(doRender, 0);
          } else {
            doRender();
          }
        }
      } catch (err) {
        if (active) setCaptchaError('Failed to load verification script.');
      }
    }

    init();

    return () => {
      active = false;
      scriptController.abort();
      clearInterval(scriptPoll);
      clearTimeout(scriptTimeout);
      if (captchaWidgetId.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(captchaWidgetId.current);
        } catch (e) {}
        captchaWidgetId.current = null;
      }
    };
  }, [captchaEnabled, mode, captchaSiteKey]);

  const helperText = useMemo(() => {
    if (!configured) {
      return 'Firebase is not configured yet. Add the NEXT_PUBLIC_FIREBASE_* values to your environment before using login.';
    }

    if (mode === 'signup') {
      return 'Verify the code sent to your email to create your account. Your profile starts after verification.';
    }

    return 'Use Google or email to continue your quiz, roadmap, and dashboard on any device.';
  }, [configured, mode]);

  function updateSignupCooldown(retryAfterMs) {
    const now = Date.now();
    setOtpClock(now);
    if (retryAfterMs > 0) {
      setSignupAvailableAt((current) => Math.max(current, now + retryAfterMs));
    }
  }

  function switchMode(nextMode) {
    if (submitting || nextMode === mode) return;
    setMode(nextMode);
    setSignupChallenge(null);
    setVerificationCode('');
    setPassword('');
    setError('');
    setStatus('');
  }

  function editSignupEmail() {
    if (submitting) return;
    setSignupChallenge(null);
    setVerificationCode('');
    setError('');
    setStatus('');
  }

  async function getSignupHumanProof() {
    if (!captchaEnabled) return '';
    if (!captchaToken) {
      throw new Error('Please complete the verification check before requesting a code.');
    }

    const headers = { 'Content-Type': 'application/json' };
    try {
      const response = await fetch('/api/human/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: captchaToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.humanToken) {
        const verificationError = new Error(typeof data.error === 'string' ? data.error : 'Human verification failed. Please try again.');
        const retryAfter = response.headers.get('Retry-After');
        const headerDelay = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter || '') - Date.now());
        verificationError.retryAfterMs = Math.max(Number(data.retryAfterMs) || 0, Number.isFinite(headerDelay) ? headerDelay : 0);
        throw verificationError;
      }
      return data.humanToken;
    } finally {
      if (window.turnstile && captchaWidgetId.current !== null) {
        window.turnstile.reset(captchaWidgetId.current);
        setCaptchaToken('');
      } else {
        setCaptchaToken('');
      }
    }
  }

  async function sendSignupCode(signupEmail) {
    if (signupCooldownSeconds > 0) {
      throw new Error(`Please wait ${signupCooldownSeconds} seconds before requesting another code.`);
    }
    const humanToken = await getSignupHumanProof();
    const result = await requestEmailSignup({ email: signupEmail, humanToken });
    if (typeof result.challengeId !== 'string' || !Number.isFinite(result.expiresAt)) {
      throw new Error('Could not start email verification. Please try again.');
    }
    setSignupChallenge({ challengeId: result.challengeId, email: signupEmail, expiresAt: result.expiresAt });
    setVerificationCode('');
    setVerifyAvailableAt(0);
    updateSignupCooldown(result.retryAfterMs || 60000);
    setStatus('Verification code sent. Check your inbox and spam folder. Only the newest code will work.');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setStatus('');

    if (isVerifyingSignup) {
      if (!/^\d{6}$/.test(verificationCode)) {
        setError('Enter the 6-digit code from your email.');
        return;
      }
      if (codeExpired) {
        setError('This code has expired. Request a new code to continue.');
        return;
      }
      if (verifyCooldownSeconds > 0) {
        setError(`Please wait ${verifyCooldownSeconds} seconds before trying again.`);
        return;
      }

      setSubmitting(true);
      try {
        await completeEmailSignup({
          email: signupChallenge.email,
          password,
          code: verificationCode,
          challengeId: signupChallenge.challengeId,
        });
        setPassword('');
        setVerificationCode('');
        setSignupChallenge(null);
        posthog.capture('account_signed_up', { authentication_method: 'email' });
        setStatus('Email verified. Loading your SkillBun profile...');
      } catch (verificationError) {
        if (verificationError.signupCompleted) {
          setPassword('');
          setVerificationCode('');
          setSignupChallenge(null);
          setMode('login');
          setError('Your email is verified and your account is ready. Log in with your email and password to continue.');
        } else {
          setError(friendlyAuthError(verificationError));
          if (verificationError.retryAfterMs > 0) {
            const now = Date.now();
            setOtpClock(now);
            setVerifyAvailableAt(now + verificationError.retryAfterMs);
          }
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const formEmail = email.trim();

    if (!formEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    const emailCheck = validateEmail(formEmail);
    if (!emailCheck.isValid) {
      setError(emailCheck.error);
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'signup') {
        await sendSignupCode(emailCheck.normalizedEmail);
      } else {
        await signInWithEmail(formEmail, password);
        setPassword('');
        posthog.capture('account_logged_in', { authentication_method: 'email' });
        setStatus('Logged in. Loading your SkillBun profile...');
      }
    } catch (authSubmitError) {
      setError(friendlyAuthError(authSubmitError));
      if (mode === 'signup') updateSignupCooldown(authSubmitError.retryAfterMs);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setStatus('');
    setSubmitting(true);

    try {
      await signInWithGoogle();
      setPassword('');
      setVerificationCode('');
      setSignupChallenge(null);
      posthog.capture('account_logged_in', { authentication_method: 'google' });
      setStatus('Google sign-in complete. Loading your SkillBun profile...');
    } catch (googleError) {
      setError(friendlyAuthError(googleError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setError('');
    setStatus('');

    if (!email.trim()) {
      setError('Enter your email first, then request a reset link.');
      return;
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.isValid) {
      setError(emailCheck.error);
      return;
    }

    if (resetCooldownSeconds > 0) {
      setError(`Please wait ${resetCooldownSeconds} seconds before requesting another reset email.`);
      return;
    }

    setSubmitting(true);

    try {
      await resetPassword(email.trim());
      const availableAt = Date.now() + PASSWORD_RESET_COOLDOWN_MS;
      resetAvailableAt.current = availableAt;
      try { window.localStorage.setItem(PASSWORD_RESET_COOLDOWN_KEY, String(availableAt)); } catch {}
      setResetCooldownSeconds(Math.ceil(PASSWORD_RESET_COOLDOWN_MS / 1000));
      setStatus('Password reset email sent. You can request another in 60 seconds.');
    } catch (resetError) {
      setError(friendlyAuthError(resetError));
      if (resetError.retryAfterMs > 0) {
        const availableAt = Date.now() + resetError.retryAfterMs;
        resetAvailableAt.current = availableAt;
        try { window.localStorage.setItem(PASSWORD_RESET_COOLDOWN_KEY, String(availableAt)); } catch {}
        setResetCooldownSeconds(Math.ceil(resetError.retryAfterMs / 1000));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    if (!signupChallenge || submitting) return;
    setError('');
    setStatus('');
    setSubmitting(true);

    try {
      await sendSignupCode(signupChallenge.email);
    } catch (verificationError) {
      setError(friendlyAuthError(verificationError));
      updateSignupCooldown(verificationError.retryAfterMs);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-copy">
          <div className="auth-bunny" aria-hidden="true">
            <Image src="/logo.png" alt="" width={58} height={58} priority unoptimized />
          </div>
          <p className="section-label">SkillBun Account</p>
          <h1 id="auth-title">{title}</h1>
          <p>{helperText}</p>
          <div className="auth-flow-tags" aria-label="SkillBun account flow">
            <span>Login</span>
            <span>Profile</span>
            <span>Quiz</span>
            <span>Roadmaps</span>
          </div>
          <div className="auth-path-panel" aria-label="What SkillBun restores after login">
            <div className="auth-path-step">
              <span>01</span>
              <strong>Profile context</strong>
              <p>Keep your interests, strengths, and study preferences ready.</p>
            </div>
            <div className="auth-path-step">
              <span>02</span>
              <strong>Adaptive quiz</strong>
              <p>Continue from the same career signals across devices.</p>
            </div>
            <div className="auth-path-step">
              <span>03</span>
              <strong>Roadmap progress</strong>
              <p>Return to saved skills, milestones, and BunBot guidance.</p>
            </div>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-header">
            <span>Account checkpoint</span>
            <strong>{isVerifyingSignup ? 'Verify your email' : mode === 'signup' ? 'Start your SkillBun flow' : 'Resume your SkillBun flow'}</strong>
          </div>
          <div className="auth-mode-toggle" role="tablist" aria-label="Choose login or signup">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => switchMode('login')}
              disabled={submitting}
              role="tab"
              aria-selected={mode === 'login'}
            >
              Log In
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => switchMode('signup')}
              disabled={submitting}
              role="tab"
              aria-selected={mode === 'signup'}
            >
              Sign Up
            </button>
          </div>

          <button type="button" className="auth-google-btn" onClick={handleGoogle} disabled={!configured || submitting}>
            <span aria-hidden="true">G</span>
            Continue with Google
          </button>

          <div className="auth-divider"><span>or</span></div>

          <form onSubmit={handleSubmit} aria-busy={submitting}>
            {isVerifyingSignup ? (
              <div className="form-group">
                <label htmlFor="auth-verification-code">Email verification code</label>
                <p id="auth-code-hint" style={{ color: 'var(--text)', overflowWrap: 'anywhere', margin: '0 0 0.75rem' }}>
                  Enter the 6-digit code sent to <strong>{signupChallenge.email}</strong>.
                </p>
                <input
                  ref={otpInput}
                  id="auth-verification-code"
                  name="verification-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  disabled={submitting}
                  aria-describedby="auth-code-hint auth-code-expiry"
                  data-ph-no-capture
                  placeholder="6-digit code"
                />
                <p id="auth-code-expiry" style={{ color: 'var(--text)', margin: '0.75rem 0 0' }}>
                  {codeExpired
                    ? 'This code has expired. Request a new code below.'
                    : `Code expires in ${Math.max(1, Math.ceil((signupChallenge.expiresAt - otpClock) / 60000))} min.`}
                </p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={submitting}
                    required
                    placeholder="you@example.com"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting}
                    required
                    minLength={6}
                    maxLength={4096}
                    data-ph-no-capture
                    placeholder="At least 6 characters"
                  />
                </div>
              </>
            )}

            {mode === 'signup' && captchaEnabled && (
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '15px 0' }}>
                {isVerifyingSignup && <p style={{ color: 'var(--text)', margin: '0 0 0.5rem' }}>Complete this check only if you need another code.</p>}
                <div id="auth-captcha-widget"></div>
                {captchaError && (
                  <span style={{ color: 'var(--sb-error, #ff4444)', fontSize: '0.85rem', marginTop: '5px' }}>
                    {captchaError}
                  </span>
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn-form"
              disabled={!configured || submitting || (isVerifyingSignup ? codeExpired || verifyCooldownSeconds > 0 : mode === 'signup' && signupCooldownSeconds > 0)}
            >
              {submitting
                ? 'Please wait...'
                : isVerifyingSignup
                  ? verifyCooldownSeconds > 0 ? `Try again in ${verifyCooldownSeconds}s` : 'Verify and create account'
                  : mode === 'signup' && signupCooldownSeconds > 0 ? `Send code in ${signupCooldownSeconds}s` : actionLabel}
            </button>
          </form>

          {mode === 'login' && (
            <button
              type="button"
              className="auth-link-button"
              onClick={handlePasswordReset}
              disabled={!configured || submitting || resetCooldownSeconds > 0}
            >
              {resetCooldownSeconds > 0 ? `Send again in ${resetCooldownSeconds}s` : 'Send password reset email'}
            </button>
          )}

          {isVerifyingSignup && (
            <>
              <button
                type="button"
                className="auth-link-button"
                onClick={handleResendCode}
                disabled={!configured || submitting || signupCooldownSeconds > 0}
              >
                {signupCooldownSeconds > 0 ? `Resend code in ${signupCooldownSeconds}s` : 'Resend verification code'}
              </button>
              <button type="button" className="auth-link-button" onClick={editSignupEmail} disabled={submitting}>
                Change email or password
              </button>
            </>
          )}

          {(status || error || authError) && (
            <div className={`auth-message ${error || authError ? 'error' : 'ok'}`} role={error || authError ? 'alert' : 'status'}>
              {error || authError || status}
            </div>
          )}

          <p className="auth-switch">
            {switchCopy}{' '}
            <button type="button" onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')} disabled={submitting}>
              {switchLabel}
            </button>
          </p>

          <Link href="/" className="auth-home-link">Back to homepage</Link>
        </div>

        <div className="auth-mini-console" aria-hidden="true">
          <span>next</span>
          <strong>{next}</strong>
        </div>
      </section>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <main className="auth-page">
        <div className="auth-loading">Loading SkillBun login...</div>
      </main>
    }>
      <AuthForm />
    </Suspense>
  );
}
