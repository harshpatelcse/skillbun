'use client';

export const HUMAN_PROOF_STORAGE_KEY = 'sb_human_proof';

export function createState(eventController) {
  return {
    conversationHistory: [],
    questionCount: 0,
    totalQuestions: 10,
    quizQuestions: null,
    pillarScores: {
      systems: 0,
      data_ai: 0,
      design_product: 0,
      cloud_infra: 0,
      security: 0,
      operations: 0,
    },
    tagScores: {},
    usedQuestionIds: [],
    identifiedPillar: null,
    userAnswers: [],
    lastSelectedOption: null,
    retryCount: 0,
    userProfile: {},
    quizResults: null,
    humanProofToken: '',
    humanProofExpiresAt: 0,
    captchaWidgetId: null,
    captchaToken: '',
    captchaInitPromise: null,
    securityConfig: {
      captchaEnabled: false,
      captchaSiteKey: ''
    },
    eventController,
    signal: eventController.signal,
  };
}

export function hasFreshHumanProof(state) {
  return Boolean(state.humanProofToken) && state.humanProofExpiresAt > Date.now() + 10_000;
}

export function persistHumanProof(state, token, expiresAt) {
  state.humanProofToken = token;
  state.humanProofExpiresAt = expiresAt;

  try {
    localStorage.setItem(HUMAN_PROOF_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
  } catch (err) {
    console.warn('Could not persist human proof token:', err.message);
  }
}

export function clearHumanProof(state) {
  state.humanProofToken = '';
  state.humanProofExpiresAt = 0;
  state.humanProofSession = '';

  try {
    localStorage.removeItem(HUMAN_PROOF_STORAGE_KEY);
  } catch (err) {
    console.warn('Could not clear human proof token:', err.message);
  }
}

export function restoreHumanProof(state) {
  try {
    const raw = localStorage.getItem(HUMAN_PROOF_STORAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    const token = typeof parsed?.token === 'string' ? parsed.token : '';
    const expiresAt = Number.parseInt(parsed?.expiresAt, 10);

    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 10_000) {
      clearHumanProof(state);
      return false;
    }

    state.humanProofToken = token;
    state.humanProofExpiresAt = expiresAt;
    return true;
  } catch (err) {
    clearHumanProof(state);
    return false;
  }
}
