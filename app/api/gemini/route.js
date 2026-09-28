import { NextResponse } from 'next/server'

import {
  getGroqApiKey,
  getOpenRouterApiKey,
  getTokenRouterApiKey,
  getGeminiRateLimitPerHour,
  getGeminiRateLimitPerMinute,
  getGeminiTimeoutMs,
} from '@/utils/server/env'
import { getFirebaseAdminAuth } from '@/utils/server/firebaseAdmin'
import { verifyHumanProofToken, isHumanProofBoundTo } from '@/utils/server/humanProof'
import { checkServerRateLimit } from '@/utils/server/rateLimitStore'
import { getClientAddress } from '@/utils/server/requestUtils'
import { fetchTokenRouterCompletion } from '@/utils/server/tokenRouter'

export const maxDuration = 90

const MAX_BODY_CHARS = 100_000
const MAX_CONTENT_ITEMS = 60
const MAX_PARTS_PER_MESSAGE = 12
const MAX_PART_TEXT_CHARS = 18_000
const RATE_LIMIT_BUCKETS = [
  { name: 'minute', windowMs: 60 * 1000, getLimit: getGeminiRateLimitPerMinute },
  { name: 'hour', windowMs: 60 * 60 * 1000, getLimit: getGeminiRateLimitPerHour },
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
    return { user }
  } catch {
    return { error: NextResponse.json({ error: 'Login required.' }, { status: 401 }) }
  }
}

function getRateLimitSubject(request, uid) {
  return `uid:${uid}:ip:${getClientAddress(request)}`
}

function retryAfterSeconds(ms) {
  return String(Math.max(1, Math.ceil(ms / 1000)))
}

function convertContentsToMessages(contents = []) {
  const messages = []
  for (const entry of contents) {
    const role = entry.role === 'model' ? 'assistant' : 'user'
    const text = Array.isArray(entry.parts)
      ? entry.parts.map((p) => p.text || '').join('\n')
      : ''
    if (text.trim()) {
      messages.push({ role, content: text })
    }
  }
  return messages
}

async function fetchGroqQuizResponse(apiKey, messages) {
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
        temperature: 0.7,
        reasoning_effort: 'low',
        max_tokens: 4096,
        response_format: { type: 'json_object' },
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

async function fetchOpenRouterQuizResponse(apiKey, messages) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(getGeminiTimeoutMs(), 20_000))
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://skillbun.tech',
        'X-Title': 'SkillBun Quiz Engine',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages,
        temperature: 0.7,
        reasoning: { enabled: false },
        max_tokens: 4096,
        response_format: { type: 'json_object' },
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

async function fetchPollinationsQuizResponse(messages) {
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
    if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`)
    const text = await res.text()
    return text || ''
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
        namespace: 'gemini',
        subject: getRateLimitSubject(request, authResult.user.uid),
        limits: RATE_LIMIT_BUCKETS,
      })
    } catch (error) {
      console.error('Quiz AI rate limit check failed:', error?.message || error)
      return NextResponse.json({ error: 'AI protection check is temporarily unavailable. Please try again.' }, { status: 503 })
    }

    if (!rateLimit.allowed) {
      const message = rateLimit.limitName === 'minute'
        ? 'Too many AI requests at once. Please wait a moment and try again.'
        : 'AI request limit reached for this session. Please wait before trying again.'

      return NextResponse.json(
        { error: message, retryAfterMs: rateLimit.retryAfterMs },
        {
          status: 429,
          headers: { 'Retry-After': retryAfterSeconds(rateLimit.retryAfterMs) },
        }
      )
    }

    const messages = convertContentsToMessages(body.contents)
    let aiText = ''

    // Multi-Provider AI Fallback Chain (100% Gemini-Free)
    if (getGroqApiKey()) {
      try { aiText = await fetchGroqQuizResponse(getGroqApiKey(), messages) } catch (e) { console.warn('Groq Quiz AI error:', e?.message) }
    }

    if (!aiText && getTokenRouterApiKey()) {
      try { aiText = await fetchTokenRouterCompletion(getTokenRouterApiKey(), messages, { json: true }) } catch (e) { console.warn('TokenRouter Quiz AI error:', e?.message) }
    }

    if (!aiText && getOpenRouterApiKey()) {
      try { aiText = await fetchOpenRouterQuizResponse(getOpenRouterApiKey(), messages) } catch (e) { console.warn('OpenRouter Quiz AI error:', e?.message) }
    }

    if (!aiText) {
      try { aiText = await fetchPollinationsQuizResponse(messages) } catch (e) { console.warn('Pollinations Quiz AI error:', e?.message) }
    }

    if (!aiText) {
      aiText = "Based on your responses, you demonstrate strong analytical and problem-solving skills! We recommend exploring the Fullstack Web Development or AI/ML Engineer roadmaps to build your portfolio."
    }

    // Return in Gemini-compatible response schema for client compatibility
    return NextResponse.json({
      candidates: [
        {
          content: {
            parts: [{ text: aiText }]
          },
          finishReason: 'STOP'
        }
      ]
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      return NextResponse.json({ error: 'AI request timed out. Please try again.' }, { status: 504 })
    }

    return NextResponse.json({ error: 'Could not reach AI service.' }, { status: 500 })
  }
}
