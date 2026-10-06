'use client';

import { getFirebaseServices } from '../firebaseClient';
import {
  hasFreshHumanProof,
  persistHumanProof,
  clearHumanProof,
  restoreHumanProof
} from './counsellorState';

const HUMAN_PROOF_HEADER = 'x-skillbun-human';
const AI_CLIENT_MAX_RETRIES = 1;
const AI_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export const RATE_LIMIT_MAX = 100;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMIT_KEY = 'sb_counsel_rl';
const sessionRateLimits = new Map();

function rateLimitOwner() {
  return getFirebaseServices().auth?.currentUser?.uid || '';
}

function saveRateLimitData(data) {
  const uid = rateLimitOwner();
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({ ...data, uid }));
    sessionRateLimits.delete(uid);
  } catch {
    // This counter is UI feedback; authoritative limits remain on the server.
    // A cache failure must not append an error after a successful AI response.
    sessionRateLimits.set(uid, { ...data });
  }
}

export function getRateLimitData() {
  const uid = rateLimitOwner();
  if (sessionRateLimits.has(uid)) return { ...sessionRateLimits.get(uid) };
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return { count: 0, windowStart: Date.now() };

    const parsed = JSON.parse(raw);
    if (typeof parsed?.uid === 'string' && parsed.uid !== uid) return { count: 0, windowStart: Date.now() };
    const count = Number.parseInt(parsed?.count, 10);
    const windowStart = Number.parseInt(parsed?.windowStart, 10);

    if (!Number.isFinite(count) || count < 0 || !Number.isFinite(windowStart) || windowStart <= 0) {
      return { count: 0, windowStart: Date.now() };
    }

    return { count, windowStart };
  } catch {
    return { count: 0, windowStart: Date.now() };
  }
}

export function checkRateLimit() {
  const now = Date.now();
  let data = getRateLimitData();

  if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
    data = { count: 0, windowStart: now };
    saveRateLimitData(data);
  }

  if (data.count >= RATE_LIMIT_MAX) {
    const msLeft = RATE_LIMIT_WINDOW_MS - (now - data.windowStart);
    const minsLeft = Math.ceil(msLeft / 60000);
    return {
      allowed: false,
      message: `⏳ You've reached the limit of ${RATE_LIMIT_MAX} messages per hour. Please wait ~${minsLeft} minute${minsLeft !== 1 ? 's' : ''} before sending again.`
    };
  }

  return { allowed: true };
}

export function incrementRateLimit() {
  const now = Date.now();
  let data = getRateLimitData();

  if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
    data = { count: 0, windowStart: now };
  }

  data.count += 1;
  saveRateLimitData(data);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getFirebaseIdToken() {
  const services = getFirebaseServices();
  const currentUser = services.auth?.currentUser;

  if (!currentUser) {
    const error = new Error('Login required');
    error.status = 401;
    throw error;
  }

  return currentUser.getIdToken();
}

export function parseRetryAfterMs(value) {
  if (!value) return 0;

  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryDate = Date.parse(value);
  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return 0;
}

export function formatWaitTime(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function getRetryDelayMs(error, attempt) {
  if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
    return Math.min(error.retryAfterMs, 30_000);
  }

  return Math.min(700 * (2 ** attempt), 4_000);
}

export function getFriendlyAiErrorMessage(error) {
  const message = String(error?.message || '').trim();
  const retryAfterMs = Number.parseInt(error?.retryAfterMs, 10);

  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return `AI is cooling down. Please wait ${formatWaitTime(retryAfterMs)} and send again.`;
  }

  if (/quota|too many|rate|busy|limit/i.test(message)) {
    return 'AI is receiving too many requests right now. Please wait a moment and send again.';
  }

  if (/authentication|credential|api key|not configured/i.test(message)) {
    return 'AI is not configured correctly right now. Please contact the SkillBun team.';
  }

  if (/empty response|temporarily unavailable|timed out|could not reach|network/i.test(message)) {
    return 'BunBot could not reach AI reliably. Please send again and I will continue from here.';
  }

  if (/security|human verification/i.test(message)) {
    return message;
  }

  return message || 'BunBot could not answer right now. Please try again.';
}

export async function fetchSecurityConfig(state) {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) return;

    const data = await response.json();
    const captcha = data?.captcha || {};

    state.securityConfig.captchaEnabled = captcha.enabled === true && typeof captcha.siteKey === 'string' && captcha.siteKey.length > 0;
    state.securityConfig.captchaSiteKey = state.securityConfig.captchaEnabled ? captcha.siteKey : '';
  } catch (err) {
    state.securityConfig.captchaEnabled = false;
    state.securityConfig.captchaSiteKey = '';
  }
}

export async function verifyHumanProof(state, renderCaptchaCallback) {
  restoreHumanProof(state);
  if (hasFreshHumanProof(state)) {
    const uid = getFirebaseServices().auth?.currentUser?.uid;
    if (uid && state.humanProofSession === `${uid}:${state.humanProofToken}`) return true;
    if (await refreshHumanProofSession(state)) return true;
  }

  if (state.securityConfig.captchaEnabled && !state.captchaToken) {
    if (renderCaptchaCallback) {
      await renderCaptchaCallback();
    }

    if (!state.captchaToken) {
      return false;
    }
  }

  const body = state.securityConfig.captchaEnabled ? { token: state.captchaToken } : {};
  const headers = { 'Content-Type': 'application/json' };
  const proofUser = getFirebaseServices().auth?.currentUser;
  if (!proofUser) {
    clearHumanProof(state);
    return false;
  }
  try {
    headers.Authorization = `Bearer ${await proofUser.getIdToken()}`;
  } catch {
    if (getFirebaseServices().auth?.currentUser?.uid === proofUser.uid) clearHumanProof(state);
    return false;
  }
  if (getFirebaseServices().auth?.currentUser?.uid !== proofUser.uid) return false;

  try {
    const response = await fetch('/api/human/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (getFirebaseServices().auth?.currentUser?.uid !== proofUser.uid) return false;

    if (!response.ok) {
      clearHumanProof(state);
      return false;
    }

    const data = await response.json();
    if (getFirebaseServices().auth?.currentUser?.uid !== proofUser.uid) return false;
    const token = typeof data?.humanToken === 'string' ? data.humanToken : '';
    const expiresAt = Number.parseInt(data?.expiresAt, 10);

    if (!token || !Number.isFinite(expiresAt)) {
      clearHumanProof(state);
      return false;
    }

    persistHumanProof(state, token, expiresAt);
    state.humanProofSession = `${proofUser.uid}:${token}`;

    if (state.securityConfig.captchaEnabled && window.turnstile && state.captchaWidgetId !== null) {
      window.turnstile.reset(state.captchaWidgetId);
      state.captchaToken = '';
    }

    return true;
  } catch (err) {
    return false;
  }
}

export async function refreshHumanProofSession(state) {
  if (!restoreHumanProof(state)) return false;
  const proofUser = getFirebaseServices().auth?.currentUser;
  if (!proofUser) {
    clearHumanProof(state);
    return false;
  }

  try {
    const idToken = await proofUser.getIdToken();
    if (getFirebaseServices().auth?.currentUser?.uid !== proofUser.uid) return false;
    const response = await fetch('/api/human/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
        [HUMAN_PROOF_HEADER]: state.humanProofToken
      },
      body: JSON.stringify({})
    });
    if (getFirebaseServices().auth?.currentUser?.uid !== proofUser.uid) return false;

    if (!response.ok) {
      clearHumanProof(state);
      return false;
    }

    const data = await response.json();
    if (getFirebaseServices().auth?.currentUser?.uid !== proofUser.uid) return false;
    const token = typeof data?.humanToken === 'string' ? data.humanToken : '';
    const expiresAt = Number.parseInt(data?.expiresAt, 10);

    if (!token || !Number.isFinite(expiresAt)) {
      clearHumanProof(state);
      return false;
    }

    persistHumanProof(state, token, expiresAt);
    state.humanProofSession = `${proofUser.uid}:${token}`;
    return true;
  } catch (err) {
    if (getFirebaseServices().auth?.currentUser?.uid === proofUser.uid) clearHumanProof(state);
    return false;
  }
}

export async function fetchGeminiPayload(state, payload) {
  return fetchCounsellorPayload(state, payload);
}

export async function fetchCounsellorPayload(state, payload) {
  let lastError = null;

  for (let attempt = 0; attempt <= AI_CLIENT_MAX_RETRIES; attempt += 1) {
    try {
      const idToken = await getFirebaseIdToken();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      };
      if (state.humanProofToken) headers[HUMAN_PROOF_HEADER] = state.humanProofToken;

      const response = await fetch('/api/counsellor', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let apiError = '';
        let retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));

        try {
          const errorData = await response.json();
          apiError = typeof errorData?.error === 'string' ? errorData.error : '';
          retryAfterMs = Number.parseInt(errorData?.retryAfterMs, 10) || retryAfterMs;
        } catch (err) {
          apiError = '';
        }

        if (response.status === 403) {
          clearHumanProof(state);
        }

        const error = new Error(apiError || 'AI is unavailable right now. Please try again.');
        error.status = response.status;
        error.retryAfterMs = retryAfterMs;

        if (AI_RETRYABLE_STATUSES.has(response.status) && attempt < AI_CLIENT_MAX_RETRIES) {
          lastError = error;
          await sleep(getRetryDelayMs(error, attempt));
          continue;
        }

        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error?.status || attempt >= AI_CLIENT_MAX_RETRIES) {
        throw error;
      }

      lastError = error;
      await sleep(getRetryDelayMs(error, attempt));
    }
  }

  throw lastError || new Error('AI request failed');
}
