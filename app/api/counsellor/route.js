import { assertAdultStudent, StudentEligibilityError } from '@/utils/server/studentEligibility.mjs'
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs'
import {
  getCounsellorAiProvider,
  getGroqApiKey,
  getHuggingFaceApiKey,
  getOpenRouterApiKey,
  getTokenRouterApiKey,
  getOllamaBaseUrl,
  getGeminiRateLimitPerMinute,
  getGeminiRateLimitPerHour,
  getGeminiTimeoutMs,
} from '@/utils/server/env'
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin'
import { verifyHumanProofToken, isHumanProofBoundTo } from '@/utils/server/humanProof'
import { checkServerRateLimit } from '@/utils/server/rateLimitStore'
import { generateOfflineCounsellorResponse } from '@/utils/server/counsellor/offlineEngine'
import { getClientAddress } from '@/utils/server/requestUtils'
import { fetchTokenRouterCompletion } from '@/utils/server/tokenRouter'
import { prepareCounsellorKnowledge, correctCounsellorAnswer, groundedCounsellorFallback } from '@/utils/server/rag/counsellor'

// Allow the bounded provider chain and optional web lookups to reach offline fallback.
export const maxDuration = 90

const MAX_BODY_CHARS = 100_000
const MAX_CONTENT_ITEMS = 60
const MAX_PARTS_PER_MESSAGE = 12
const MAX_PART_TEXT_CHARS = 18_000

const RATE_LIMIT_BUCKETS = [
  { name: 'minute', windowMs: 60 * 1000, getLimit: getGeminiRateLimitPerMinute, getSubject: s => `uid:${s.uid}` },
  { name: 'hour', windowMs: 60 * 60 * 1000, getLimit: getGeminiRateLimitPerHour, getSubject: s => `uid:${s.uid}` },
  { name: 'ipHour', windowMs: 60 * 60 * 1000, getLimit: () => getGeminiRateLimitPerHour() * 3, getSubject: s => `ip:${s.address}` },
]

function getBearerToken(request) {
  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

async function verifyAuthenticatedUser(request) {
  const idToken = getBearerToken(request)

  if (!idToken) {
    return { error: NextResponse.json({ error: 'Login required.' }, { status: 401 }) }
  }

  try {
    const user = await getFirebaseAdminAuth().verifyIdToken(idToken)
    await assertAdultStudent(getFirebaseAdminFirestore(), user.uid)
    return { user }
  } catch (error) {
    if (error instanceof StudentEligibilityError) return { error: NextResponse.json({ error: error.message, code: error.code }, { status: error.status }) }
    return { error: NextResponse.json({ error: 'Login required.' }, { status: 401 }) }
  }
}

function getRateLimitSubject(request, uid) {
  return { uid, address: getClientAddress(request) }
}

function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Payload must be a valid JSON object.'
  }

  if (!Array.isArray(body.contents) || body.contents.length === 0) {
    return 'Conversation payload must include at least one message.'
  }

  if (body.contents.length > MAX_CONTENT_ITEMS) {
    return 'Conversation payload is too large.'
  }

  for (let i = 0; i < body.contents.length; i++) {
    const entry = body.contents[i]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return `Conversation payload contains an invalid message at index ${i}.`
    }

    if (entry.role !== 'user' && entry.role !== 'model') {
      return `Conversation message at index ${i} contains an invalid role.`
    }

    if (!Array.isArray(entry.parts) || entry.parts.length === 0 || entry.parts.length > MAX_PARTS_PER_MESSAGE) {
      return `Conversation message at index ${i} contains an invalid parts list.`
    }

    for (let j = 0; j < entry.parts.length; j++) {
      const part = entry.parts[j]
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        return `Message part at [${i}][${j}] must be an object.`
      }

      if (typeof part.text !== 'string' || !part.text.trim()) {
        return `Message part at [${i}][${j}] must contain non-empty text.`
      }

      if (part.text.length > MAX_PART_TEXT_CHARS) {
        return `Message part at [${i}][${j}] text exceeds maximum length.`
      }
    }
  }

  return ''
}

async function convertContentsToOpenAiMessages(contents = [], prepared) {
  const ragContext = (prepared || await prepareCounsellorKnowledge(contents)).context

  const systemMessage = {
    role: 'system',
    content: `You are BunBot, SkillBun's senior AI Career Advisor specialized in helping computer science, software engineering, and tech students worldwide (BS CS, B.Tech, BCA, Self-Taught, Bootcamps).

RESPONSE QUALITY MANDATE:
- Provide RICH, DETAILED, COMPREHENSIVE, and HIGHLY STRUCTURED responses (300 to 600 words).
- Format your answers using clean Markdown with bold headings (###), bullet points, and numbered steps.
- For career & tech questions, structure your answer into clear sections:
  1. 🎯 **Overview & Core Concept**
  2. 🛠️ **Key Skills & Tech Stack**
  3. 💰 **Salary & Compensation Expectations (Global USD benchmarks and regional equivalents)**
  4. 🚀 **Step-by-Step Actionable Learning Path**
  5. 💡 **Pro Tips for Freshers & College Students**
- Always include relevant SkillBun roadmap markdown links provided in the context below.
- Always be encouraging, practical, and highly detailed. Never output lazy 1-2 sentence answers!

${ragContext}`
  }

  const messages = [systemMessage]

  for (let i = 0; i < contents.length; i += 1) {
    const entry = contents[i]
    if (!entry || typeof entry !== 'object') continue
    const role = entry.role === 'model' ? 'assistant' : entry.role === 'user' ? 'user' : 'system'
    const text = Array.isArray(entry.parts)
      ? entry.parts.map((p) => p?.text || '').join('\n')
      : ''

    if (text) {
      messages.push({ role, content: text })
    }
  }

  return messages
}

async function fetchGroqResponse(apiKey, contents, preparedMessages) {
  const messages = preparedMessages || await convertContentsToOpenAiMessages(contents)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(getGeminiTimeoutMs(), 8_500))

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages,
        temperature: 0.75,
        reasoning_effort: 'low',
        max_tokens: 4096,
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`)
    const data = await res.json()
    return getCompleteAiText(data)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchTokenRouterResponse(apiKey, contents, preparedMessages) {
  return fetchTokenRouterCompletion(apiKey, preparedMessages || await convertContentsToOpenAiMessages(contents))
}

async function fetchOpenRouterResponse(apiKey, contents, preparedMessages) {
  const messages = preparedMessages || await convertContentsToOpenAiMessages(contents)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(getGeminiTimeoutMs(), 8_500))

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages,
        temperature: 0.75,
        reasoning: { enabled: false },
        max_tokens: 4096,
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`)
    const data = await res.json()
    return getCompleteAiText(data)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchHuggingFaceResponse(apiKey, contents, preparedMessages) {
  const messages = preparedMessages || await convertContentsToOpenAiMessages(contents)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(getGeminiTimeoutMs(), 8_500))

  try {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        messages,
        temperature: 0.75,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`HuggingFace HTTP ${res.status}`)
    const data = await res.json()
    return getCompleteAiText(data)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchOllamaResponse(baseUrl, contents, preparedMessages) {
  const messages = preparedMessages || await convertContentsToOpenAiMessages(contents)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getGeminiTimeoutMs())

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',
        messages,
        temperature: 0.75,
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = await res.json()
    return getCompleteAiText(data)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchFreeOpenSourceLlamaResponse(contents, preparedMessages) {
  const messages = preparedMessages || await convertContentsToOpenAiMessages(contents)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(getGeminiTimeoutMs(), 10_000))

  try {
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model: 'openai',
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`Free OpenSource LLM HTTP ${res.status}`)
    const text = await res.text()
    if (!text || text.includes('"error":')) return ''
    return text.trim()
  } catch (err) {
    console.warn('Free OpenSource LLM endpoint failed, falling back:', err?.message)
    return ''
  } finally {
    clearTimeout(timeout)
  }
}


function getCompleteAiText(data) {
  const choice = data?.choices?.[0]
  if (choice?.finish_reason && choice.finish_reason !== 'stop') return ''
  const text = choice?.message?.content
  return typeof text === 'string' ? text.trim() : ''
}

function formatCounsellorResponse(text) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
        finishReason: 'STOP',
      },
    ],
  }
}

function applyStrictBrandMasking(text = '') {
  if (!text) return ''
  return text
    .replace(/\b(Gemini 2\.5|Gemini|ChatGPT|GPT-4o|GPT-4|GPT-3\.5|OpenAI|Llama 3\.3|Llama|Groq|Anthropic|Claude|Qwen|DeepSeek)\b/gi, 'BunBot')
    .replace(/\b(Google|Meta|Alibaba)\s+(AI|LLM|Model)\b/gi, 'BunBot Engine')
}

function stripUnsolicitedEmail(text = '', userQuery = '') {
  if (!text) return ''
  const isContactIntent = /contact|email|support|reach|helpdesk|owner|founder|harsh/i.test(userQuery)
  const isOffTopicRefusal = /outside my scope|outside my domain|take a screenshot/i.test(text)

  if (!isContactIntent && !isOffTopicRefusal) {
    return text
      .replace(/\n\n+###?\s*Next Steps[^\n]*\n+[^\n]*harsh@skillbun\.tech[^\n]*/gi, '')
      .replace(/\n\n+[^\n]*reach out[^\n]*harsh@skillbun\.tech[^\n]*/gi, '')
      .replace(/\n\n+[^\n]*contact[^\n]*harsh@skillbun\.tech[^\n]*/gi, '')
      .trim()
  }
  return text
}

export async function POST(request) {

  try {
    const authResult = await verifyAuthenticatedUser(request)
    if (authResult.error) {
      return authResult.error
    }

    const token = request.headers.get('x-skillbun-human') || ''
    const verification = verifyHumanProofToken(token)

    if (!isHumanProofBoundTo(verification, authResult.user.uid)) {
      return NextResponse.json({ error: 'Human verification required.' }, { status: 403 })
    }

    const rawBody = await request.text()
    if (rawBody.length > MAX_BODY_CHARS) {
      return NextResponse.json({ error: 'Conversation payload is too large.' }, { status: 400 })
    }

    let body
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 })
    }

    const validationError = validatePayload(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    let rateLimit
    try {
      rateLimit = await checkServerRateLimit({
        namespace: 'counsellor',
        subject: getRateLimitSubject(request, authResult.user.uid),
        limits: RATE_LIMIT_BUCKETS,
        requireDistributed: process.env.NODE_ENV === 'production',
      })
    } catch (error) {
      console.error('Counsellor rate limit check failed:', error?.message || error)
      return NextResponse.json({ error: 'AI protection check is temporarily unavailable.' }, { status: 503 })
    }

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many AI requests at once. Please wait a moment.' },
        { status: 429 }
      )
    }

    const preferredProvider = getCounsellorAiProvider()
    const contents = body.contents || []
    const prepared = await prepareCounsellorKnowledge(contents)
    const preparedMessages = await convertContentsToOpenAiMessages(contents, prepared)

    let textResponse = ''

    // Preferred provider check if specifically set
    if (!textResponse && preferredProvider !== 'auto' && preferredProvider !== 'free-opensource') {
      if (preferredProvider === 'groq' && getGroqApiKey()) {
        try { textResponse = await fetchGroqResponse(getGroqApiKey(), contents, preparedMessages) } catch (e) { console.warn('Groq provider error:', e?.message) }
      } else if (preferredProvider === 'tokenrouter' && getTokenRouterApiKey()) {
        try { textResponse = await fetchTokenRouterResponse(getTokenRouterApiKey(), contents, preparedMessages) } catch (e) { console.warn('TokenRouter provider error:', e?.message) }
      } else if (preferredProvider === 'openrouter' && getOpenRouterApiKey()) {
        try { textResponse = await fetchOpenRouterResponse(getOpenRouterApiKey(), contents, preparedMessages) } catch (e) { console.warn('OpenRouter provider error:', e?.message) }
      } else if (preferredProvider === 'huggingface' && getHuggingFaceApiKey()) {
        try { textResponse = await fetchHuggingFaceResponse(getHuggingFaceApiKey(), contents, preparedMessages) } catch (e) { console.warn('HuggingFace provider error:', e?.message) }
      } else if (preferredProvider === 'ollama' && getOllamaBaseUrl()) {
        try { textResponse = await fetchOllamaResponse(getOllamaBaseUrl(), contents, preparedMessages) } catch (e) { console.warn('Ollama provider error:', e?.message) }
      }
    }

    // Auto strategy: Strictly ordered by LLM Intelligence & Worthiness Rating
    if (!textResponse && (preferredProvider === 'auto' || preferredProvider === 'free-opensource')) {
      // 1. Primary Groq model, with a bounded reasoning and response budget.
      if (getGroqApiKey()) {
        try { textResponse = await fetchGroqResponse(getGroqApiKey(), contents, preparedMessages) } catch (e) { console.warn('Groq LPU error:', e?.message) }
      }

      // Optional TokenRouter backup; existing providers remain available after it.
      if (!textResponse && getTokenRouterApiKey()) {
        try { textResponse = await fetchTokenRouterResponse(getTokenRouterApiKey(), contents, preparedMessages) } catch (e) { console.warn('TokenRouter error:', e?.message) }
      }

      // 2. [Rank 2 - 9.5/10 Worthiness] Hugging Face Qwen 2.5 Coder 32B Instruct (Deep Coding & Tech Logic)
      if (!textResponse && getHuggingFaceApiKey()) {
        try { textResponse = await fetchHuggingFaceResponse(getHuggingFaceApiKey(), contents, preparedMessages) } catch (e) { console.warn('HuggingFace error:', e?.message) }
      }

      // 3. [Rank 3 - 8.5/10 Worthiness] OpenRouter Free Gateway (Multi-Model Free Router)
      if (!textResponse && getOpenRouterApiKey()) {
        try { textResponse = await fetchOpenRouterResponse(getOpenRouterApiKey(), contents, preparedMessages) } catch (e) { console.warn('OpenRouter free error:', e?.message) }
      }

      // 4. [Rank 4 - 8/10 Worthiness] Free Online Pollinations Serverless Llama
      if (!textResponse) {
        try { textResponse = await fetchFreeOpenSourceLlamaResponse(contents, preparedMessages) } catch (e) { console.warn('Free Pollinations Llama error:', e?.message) }
      }
    }

    // Ultimate Zero-Failure Fallback: Offline SkillBun Knowledge Engine
    if (!textResponse) {
      textResponse = groundedCounsellorFallback(prepared) || generateOfflineCounsellorResponse(contents)
    }

    // Ironclad Brand Masking & Sanitize Filter
    const lastUserQuery = prepared.query

    textResponse = correctCounsellorAnswer(textResponse, prepared.evidence)
    textResponse = applyStrictBrandMasking(textResponse)
    textResponse = stripUnsolicitedEmail(textResponse, lastUserQuery)

    return NextResponse.json(formatCounsellorResponse(textResponse))
  } catch (err) {
    console.error('Counsellor route error:', err?.message || err)
    // Always return valid offline knowledge response instead of 500 error
    const contents = []
    return NextResponse.json(formatCounsellorResponse(generateOfflineCounsellorResponse(contents)))
  }
}
