import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadAiRoute } from '../fixtures/aiRouteHarness.mjs';
import { fetchTokenRouterCompletion } from '../../utils/server/tokenRouter.js';

const contents = [{ role: 'user', parts: [{ text: 'Help me choose a frontend learning path. Return JSON if this is a quiz.' }] }];
const question = JSON.stringify({ type: 'question', question: 'Which college project interests you?', options: ['Design a page', 'Build an API', 'Explore data', 'Test security'] });
const request = (headers = {}, body = { contents }) => new Request('http://localhost/api/ai', {
  method: 'POST', headers: { Authorization: 'Bearer test-student', 'x-skillbun-human': 'signed-test-proof', ...headers }, body: JSON.stringify(body),
});
const completion = (text, reason = 'stop') => Response.json({ choices: [{ finish_reason: reason, message: { content: text } }] });

for (const route of ['gemini', 'counsellor']) {
  test(`${route}: available Groq model produces a complete answer in the existing response shape`, async () => {
    const calls = [];
    const handler = await loadAiRoute(route, { fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body });
      if (body.model === 'llama-3.3-70b-versatile') return Response.json({}, { status: 404 });
      if (body.max_tokens < 4096 || body.reasoning_effort !== 'low') return completion('', 'length');
      return completion(question);
    } });
    const response = await handler.POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).candidates[0].content.parts[0].text, question);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, 'openai/gpt-oss-20b');
    if (route === 'gemini') assert.equal(calls[0].body.response_format.type, 'json_object');
  });

  test(`${route}: unavailable Groq fails over to the free router with a complete response`, async () => {
    const handler = await loadAiRoute(route, { fetch: async (url, options) => {
      if (url.includes('groq.com')) return Response.json({}, { status: 404 });
      const body = JSON.parse(options.body);
      if (body.model !== 'openrouter/free') return Response.json({}, { status: 404 });
      if (body.reasoning?.enabled !== false) return completion('', 'length');
      return completion(question);
    } });
    const response = await handler.POST(request());
    assert.equal((await response.json()).candidates[0].content.parts[0].text, question);
  });

  test(`${route}: incomplete and malformed provider responses trigger fallback`, async () => {
    for (const invalid of [completion('cut off', 'length'), completion('   '), completion({ bad: true })]) {
      let calls = 0;
      const handler = await loadAiRoute(route, { fetch: async () => ++calls === 1 ? invalid : completion(question) });
      const response = await handler.POST(request());
      assert.equal((await response.json()).candidates[0].content.parts[0].text, question);
      assert.equal(calls, 2);
    }
  });

  test(`${route}: auth, human proof, payload and rate limits stop provider calls`, async () => {
    let calls = 0;
    const handler = await loadAiRoute(route, { fetch: async () => { calls++; return completion(question); } });
    assert.equal((await handler.POST(request({ Authorization: '' }))).status, 401);
    assert.equal((await handler.POST(request({ 'x-skillbun-human': 'dev-human-proof-token' }))).status, 403);
    assert.equal((await handler.POST(request({}, { contents: [{ role: 'system', parts: [{ text: 'bad' }] }] }))).status, 400);
    const limited = await loadAiRoute(route, { checkServerRateLimit: async () => ({ allowed: false, retryAfterMs: 5000 }), fetch: async () => { calls++; } });
    assert.equal((await limited.POST(request())).status, 429);
    assert.equal(calls, 0);
  });

  test(`${route}: provider outages still reach the existing fallback`, async () => {
    const delays = [];
    const handler = await loadAiRoute(route, {
      getHuggingFaceApiKey: () => 'test-hf',
      getGeminiTimeoutMs: () => 60000,
      setTimeout: (callback, ms) => { delays.push(ms); return setTimeout(callback, ms); },
      fetch: async () => Response.json({}, { status: 503 }),
    });
    const response = await handler.POST(request());
    assert.equal(response.status, 200);
    const text = (await response.json()).candidates[0].content.parts[0].text;
    assert.match(text, route === 'gemini' ? /Based on your responses/ : /Offline career guidance/);
    assert.ok(delays.reduce((sum, ms) => sum + ms, 0) < handler.maxDuration * 1000);
  });

  test(`${route}: optional TokenRouter backup succeeds, and its failure resumes existing providers`, async () => {
    for (const tokenRouterFails of [false, true]) {
      const calls = [];
      const handler = await loadAiRoute(route, {
        getTokenRouterApiKey: () => 'test-tokenrouter',
        fetch: async (url, options) => {
          calls.push(url);
          if (url.includes('groq.com')) return Response.json({}, { status: 404 });
          if (url.includes('tokenrouter.com')) {
            const body = JSON.parse(options.body);
            assert.equal(body.model, 'z-ai/glm-5.3-free');
            assert.equal(body.thinking, undefined);
            assert.equal(body.reasoning, undefined);
            assert.equal(body.reasoning_effort, undefined);
            if (route === 'gemini') assert.equal(body.response_format.type, 'json_object');
            if (tokenRouterFails) return Response.json({}, { status: 429 });
          }
          return completion(question);
        },
      });
      const response = await handler.POST(request());
      assert.equal((await response.json()).candidates[0].content.parts[0].text, question);
      assert.equal(calls.length, tokenRouterFails ? 3 : 2);
      assert.equal(calls[1], 'https://api.tokenrouter.com/v1/chat/completions');
    }
  });
}

test('TokenRouter ignores reasoning-only, incomplete and invalid responses without exposing provider errors', async () => {
  for (const response of [completion('', 'stop'), completion('partial', 'length'), completion({ invalid: true }),
    Response.json({ choices: [{ message: { reasoning_content: 'private reasoning' } }] })]) {
    assert.equal(await fetchTokenRouterCompletion('test-key', [], {}, async () => response), '');
  }
  await assert.rejects(fetchTokenRouterCompletion('test-key', [], {}, async () => Response.json({ error: 'sensitive provider details' }, { status: 401 })), /^Error: TokenRouter HTTP 401$/);
  assert.equal(await fetchTokenRouterCompletion('', [], {}, async () => { throw new Error('Must not call unconfigured provider'); }), '');
});

test('Bun-Bot accepts explicit TokenRouter preference', async () => {
  const handler = await loadAiRoute('counsellor', {
    getCounsellorAiProvider: () => 'tokenrouter', getTokenRouterApiKey: () => 'test-key',
    fetch: async url => { assert.equal(url, 'https://api.tokenrouter.com/v1/chat/completions'); return completion('Career guidance'); },
  });
  const response = await handler.POST(request());
  assert.equal((await response.json()).candidates[0].content.parts[0].text, 'Career guidance');
});

test('Hugging Face fallback uses its supported chat endpoint with an explicit model', async () => {
  const handler = await loadAiRoute('counsellor', { fetch: async (url, options) => {
    if (url !== 'https://router.huggingface.co/v1/chat/completions') throw new Error('Legacy endpoint is unavailable');
    assert.equal(JSON.parse(options.body).model, 'Qwen/Qwen2.5-Coder-32B-Instruct');
    return completion('Start with a small frontend project.');
  } });
  assert.equal(await handler.fetchHuggingFaceResponse('test-hf', contents), 'Start with a small frontend project.');
});

test('quiz obtains a server-issued human proof for real tokens, disabled CAPTCHA, and cached legacy tokens', async () => {
  let source = await fs.readFile(new URL('../../utils/client/quiz/quizApi.js', import.meta.url), 'utf8');
  source = source.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace(/export /g, '');
  for (const scenario of [
    { captchaEnabled: false, hostname: 'skillbun.tech' },
    { captchaEnabled: true, hostname: 'skillbun.tech', captchaToken: 'cf-turnstile-token' },
    { captchaEnabled: true, hostname: 'localhost', humanProofToken: 'dev-human-proof-token', captchaToken: 'cf-turnstile-token' },
  ]) {
    const state = { ...scenario, securityConfig: { captchaEnabled: scenario.captchaEnabled } };
    let calls = 0;
    const deps = {
      window: { location: { hostname: scenario.hostname }, localStorage: { getItem: () => null } },
      getFirebaseServices: () => ({ auth: { currentUser: { uid: 'test-student', getIdToken: async () => 'test-id-token' } } }),
      restoreHumanProof() {},
      hasFreshHumanProof: s => Boolean(s.humanProofToken),
      clearHumanProof: s => { s.humanProofToken = ''; },
      persistHumanProof: (s, token) => { s.humanProofToken = token; },
      fetch: async (url, options) => {
        calls++;
        assert.equal(url, '/api/human/verify');
        assert.equal(options.headers.Authorization, 'Bearer test-id-token');
        if (scenario.captchaEnabled) assert.equal(JSON.parse(options.body).token, scenario.captchaToken);
        return Response.json({ humanToken: 'server-signed-proof', expiresAt: Date.now() + 60000 });
      },
    };
    const verify = new Function(...Object.keys(deps), `${source}; return verifyHumanProof;`)(...Object.values(deps));
    assert.equal(await verify(state), true);
    assert.equal(state.humanProofToken, 'server-signed-proof');
    assert.equal(calls, 1);
  }

  // With the client bypass removed, a captcha-enabled session with no token and no
  // widget renderer must fail fast without hitting the verify endpoint.
  {
    const state = { securityConfig: { captchaEnabled: true }, captchaToken: '' };
    let calls = 0;
    const deps = {
      window: { location: { hostname: 'localhost' }, localStorage: { getItem: () => null } },
      restoreHumanProof() {}, hasFreshHumanProof: () => false, clearHumanProof() {}, persistHumanProof() {},
      fetch: async () => { calls++; return Response.json({}); },
    };
    const verify = new Function(...Object.keys(deps), `${source}; return verifyHumanProof;`)(...Object.values(deps));
    assert.equal(await verify(state), false);
    assert.equal(calls, 0);
  }
});

test('quiz accepts a valid four-second AI answer and still falls back on timeout', async t => {
  const source = await fs.readFile(new URL('../../utils/client/quizRuntime.js', import.meta.url), 'utf8');
  const advance = source.slice(source.indexOf('  async function advanceQuestion()'), source.indexOf('  function selectOption('));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const questionCount of [7, 10]) {
    for (const timedOut of [false, true]) {
      let shown;
      const helperStart = source.indexOf('  async function callGeminiWithTimeout(');
      const helper = helperStart < 0 ? '' : source.slice(helperStart, source.indexOf('  const fallbackCatalog', helperStart));
      const deps = {
        state: { questionCount, userAnswers: [] },
        document: { getElementById: () => ({ style: {}, querySelector: () => ({}) }) },
        callGemini: () => timedOut ? new Promise(() => {}) : new Promise(resolve => setTimeout(() => resolve({ question: 'AI question', careers: ['AI result'] }), 4000)),
        getAiCall1Prompt: () => 'Question prompt', getAiCall2Prompt: () => 'Result prompt',
        showQuestion: (_state, data) => { shown = data.question; },
        showResults: (_state, data) => { shown = data.careers[0]; },
        pickQuestionForStep: () => ({ question: 'Local question', options: [] }),
        getLocalFallbackResults: () => ({ careers: ['Local result'] }),
        getDominantPillar: () => 'systems', selectOption() {},
        posthog: { capture() {} }, console: { warn() {} },
      };
      const run = new Function(...Object.keys(deps), `let nextInsight = ''; ${helper} ${advance}; return advanceQuestion;`)(...Object.values(deps));
      const pending = run();
      t.mock.timers.tick(timedOut ? 90000 : 4000);
      await pending;
      assert.equal(shown, `${timedOut ? 'Local' : 'AI'} ${questionCount === 7 ? 'question' : 'result'}`);
    }
  }
});
