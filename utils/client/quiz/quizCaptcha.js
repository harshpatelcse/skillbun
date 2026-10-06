'use client';

import { hasFreshHumanProof } from './quizState';

export function loadTurnstileScript(state) {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-turnstile="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true, signal: state.signal });
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile script')), { once: true, signal: state.signal });
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

export function getCaptchaErrorMessage(errorCode) {
  const code = String(errorCode || '').trim();

  if (code === '110200') {
    return `Turnstile domain is not authorized for this site key (${code}). Add this hostname in Cloudflare Turnstile Hostname Management.`;
  }

  if (code === '110100' || code === '110110' || code === '400020') {
    return `Turnstile site key is invalid or not found (${code}). Check the deployed TURNSTILE_SITE_KEY.`;
  }

  if (code === '400070') {
    return `Turnstile site key is disabled (${code}). Enable it in Cloudflare.`;
  }

  if (code === '200500') {
    return `Turnstile iframe could not load (${code}). Check browser extensions, network, or challenges.cloudflare.com blocking.`;
  }

  if (code === '110600' || code === '110620') {
    return `Verification timed out (${code}). Please retry.`;
  }

  return code ? `Verification failed (${code}). Please retry.` : 'Verification failed. Please retry.';
}

export function setCaptchaStatus(message, tone) {
  const statusEl = document.getElementById('captchaStatus');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.classList.remove('ok', 'error');
  if (tone === 'ok') statusEl.classList.add('ok');
  if (tone === 'error') statusEl.classList.add('error');
}

export async function initCaptcha(state, onVerified) {
  if (state.signal.aborted || !state.securityConfig.captchaEnabled || hasFreshHumanProof(state)) return;

  const wrap = document.getElementById('captchaWrap');
  const widget = document.getElementById('captchaWidget');

  if (!wrap || !widget) return;

  wrap.style.display = 'block';
  if (state.captchaWidgetId !== null && window.turnstile) {
    setCaptchaStatus('Complete the verification below to start the quiz.');
    return;
  }

  if (state.captchaInitPromise) {
    await state.captchaInitPromise;
    return;
  }

  state.captchaInitPromise = (async () => {
    setCaptchaStatus('Complete the verification below to start the quiz.');

    try {
      await loadTurnstileScript(state);
    } catch (err) {
      if (state.signal.aborted) return;
      setCaptchaStatus('Captcha failed to load. Please refresh and try again.', 'error');
      return;
    }

    if (state.signal.aborted) return;

    if (!window.turnstile) {
      setCaptchaStatus('Captcha unavailable. Please refresh and try again.', 'error');
      return;
    }

    state.captchaWidgetId = window.turnstile.render('#captchaWidget', {
      sitekey: state.securityConfig.captchaSiteKey,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      callback: (token) => {
        if (state.signal.aborted) return;
        state.captchaToken = token;
        setCaptchaStatus('Verification complete. Loading your quiz...', 'ok');
        if (onVerified) void onVerified();
      },
      'expired-callback': () => {
        if (state.signal.aborted) return;
        state.captchaToken = '';
        setCaptchaStatus('Verification expired. Please verify again.', 'error');
      },
      'error-callback': (errorCode) => {
        if (state.signal.aborted) return;
        state.captchaToken = '';
        setCaptchaStatus(getCaptchaErrorMessage(errorCode), 'error');
      }
    });
  })();

  try {
    await state.captchaInitPromise;
  } finally {
    state.captchaInitPromise = null;
  }
}
