import { assertAdultStudent, StudentEligibilityError } from '../../utils/server/studentEligibility.mjs';
import { applyStrictBrandMasking } from '../../utils/server/brandMasking.mjs';
import fs from 'node:fs/promises';
import { fetchTokenRouterCompletion } from '../../utils/server/tokenRouter.js';

// Execute the actual route with explicit service doubles, without Next's import aliases.
export async function loadAiRoute(route, overrides = {}) {
  const deps = {
    NextResponse: { json: Response.json },
    applyStrictBrandMasking, assertAdultStudent, StudentEligibilityError,
    getFirebaseAdminFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ ageBand: '18-plus' }) }) }) }) }),
    getGroqApiKey: () => 'test-groq',
    getOpenRouterApiKey: () => 'test-openrouter',
    getTokenRouterApiKey: () => '',
    getHuggingFaceApiKey: () => '',
    getOllamaBaseUrl: () => '',
    getCounsellorAiProvider: () => 'auto',
    getGeminiTimeoutMs: () => 20000,
    getGeminiRateLimitPerMinute: () => 12,
    getGeminiRateLimitPerHour: () => 80,
    getFirebaseAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'test-student' }) }),
    verifyHumanProofToken: token => ({ valid: token === 'signed-test-proof', payload: token === 'signed-test-proof' ? { uid: 'test-student' } : {} }),
    isHumanProofBoundTo: (verification, uid) => Boolean(verification?.valid) && (verification.payload?.uid ?? '') === uid,
    checkServerRateLimit: async () => ({ allowed: true }),
    getClientAddress: () => '127.0.0.1',
    generateOfflineCounsellorResponse: () => 'Offline career guidance',
    prepareCounsellorKnowledge: async () => ({ query: '', context: 'Synthetic public catalog evidence.', evidence: { sources: [], catalogComplete: false } }),
    correctCounsellorAnswer: text => text,
    groundedCounsellorFallback: () => '',
    console: { warn() {}, error() {} },
    fetch: async () => { throw new Error('Unexpected network request in unit test'); },
    ...overrides,
  };
  deps.fetchTokenRouterCompletion ||= (key, messages, options) => fetchTokenRouterCompletion(key, messages, options, deps.fetch);
  let source = await fs.readFile(new URL(`../../app/api/${route}/route.js`, import.meta.url), 'utf8');
  source = source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replace(/export /g, '');
  const names = route === 'gemini'
    ? 'fetchGroqQuizResponse, fetchOpenRouterQuizResponse, fetchPollinationsQuizResponse'
    : 'fetchGroqResponse, fetchTokenRouterResponse, fetchOpenRouterResponse, fetchHuggingFaceResponse, fetchFreeOpenSourceLlamaResponse';
  return new Function(...Object.keys(deps), `${source}; return { POST, maxDuration, ${names} };`)(...Object.values(deps));
}
