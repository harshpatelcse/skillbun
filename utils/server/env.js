function getFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function parseIntWithinRange(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value ?? '', 10)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(Math.max(parsed, minimum), maximum)
}

function parseBoolean(value, fallback = false) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()

  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
    return false
  }

  return fallback
}

export function getTurnstileSiteKey() {
  return getFirstNonEmpty(process.env.TURNSTILE_SITE_KEY)
}

export function getTurnstileSecretKey() {
  return getFirstNonEmpty(process.env.TURNSTILE_SECRET_KEY)
}

export function isCaptchaEnabled() {
  const hasKeys = Boolean(getTurnstileSiteKey() && getTurnstileSecretKey())
  return hasKeys && parseBoolean(process.env.TURNSTILE_ENABLED, false)
}

export function getGroqApiKey() {
  return getFirstNonEmpty(process.env.GROQ_API_KEY)
}

export function getHuggingFaceApiKey() {
  return getFirstNonEmpty(process.env.HUGGINGFACE_API_KEY)
}

export function getHuggingFaceModel() {
  return getFirstNonEmpty(process.env.HUGGINGFACE_MODEL, 'Qwen/Qwen2.5-Coder-32B-Instruct')
}

export function getOpenRouterApiKey() {
  return getFirstNonEmpty(process.env.OPENROUTER_API_KEY)
}

export function getTokenRouterApiKey() {
  return getFirstNonEmpty(process.env.TOKENROUTER_API_KEY)
}

export function getTokenRouterModel() {
  return getFirstNonEmpty(process.env.TOKENROUTER_MODEL, 'z-ai/glm-5.3-free')
}

export function getOllamaBaseUrl() {
  return getFirstNonEmpty(process.env.OLLAMA_BASE_URL)
}

export function getCounsellorAiProvider() {
  return (process.env.COUNSELLOR_AI_PROVIDER || 'auto').trim().toLowerCase()
}

export function getGeminiTimeoutMs() {
  return parseIntWithinRange(process.env.GEMINI_TIMEOUT_MS, 15_000, 5_000, 60_000)
}

export function getGeminiRateLimitPerMinute() {
  return parseIntWithinRange(process.env.GEMINI_RATE_LIMIT_PER_MINUTE, 10, 1, 120)
}

export function getGeminiRateLimitPerHour() {
  return parseIntWithinRange(process.env.GEMINI_RATE_LIMIT_PER_HOUR, 120, 5, 2000)
}

export function getGeminiMaxRetries() {
  return parseIntWithinRange(process.env.GEMINI_MAX_RETRIES, 2, 0, 4)
}

export function getGeminiRetryBaseDelayMs() {
  return parseIntWithinRange(process.env.GEMINI_RETRY_BASE_DELAY_MS, 800, 100, 5_000)
}

export function getHumanProofTtlMs() {
  return parseIntWithinRange(process.env.HUMAN_PROOF_TTL_MS, 30 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000)
}

export function getHumanProofSecret() {
  const configuredSecret = getFirstNonEmpty(process.env.HUMAN_PROOF_SECRET)

  if (configuredSecret) {
    return configuredSecret
  }

  const fallbackSeed = getFirstNonEmpty(
    process.env.GROQ_API_KEY,
    process.env.OPENROUTER_API_KEY
  )

  if (fallbackSeed) {
    return `skillbun-human-proof:${fallbackSeed}`
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'skillbun-human-proof:skillbun-local-dev'
  }

  return ''
}

export function getAppOrigin() {
  const origin = getFirstNonEmpty(process.env.APP_ORIGIN)
  if (origin) {
    return origin.replace(/\/+$/, '')
  }

  const vercelUrl = getFirstNonEmpty(process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL)
  if (vercelUrl) {
    const hasProtocol = vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')
    if (hasProtocol) {
      return vercelUrl.replace(/\/+$/, '')
    }
    const protocol = vercelUrl.includes('localhost') || vercelUrl.includes('127.0.0.1') ? 'http' : 'https'
    return `${protocol}://${vercelUrl}`.replace(/\/+$/, '')
  }

  return ''
}

export function getAllowedAppOrigins() {
  return getFirstNonEmpty(process.env.APP_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function getFirebaseAdminProjectId() {
  return getFirstNonEmpty(
    process.env.FIREBASE_ADMIN_PROJECT_ID,
    process.env.FIREBASE_PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  )
}

export function getFirebaseAdminClientEmail() {
  return getFirstNonEmpty(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    process.env.FIREBASE_CLIENT_EMAIL
  )
}

export function getFirebaseAdminPrivateKey() {
  const key = getFirstNonEmpty(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    process.env.FIREBASE_PRIVATE_KEY
  )
  if (!key) return ''
  let cleaned = key.trim()
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1)
  }
  return cleaned.replace(/\\n/g, '\n')
}

export function getZohoSmtpHost() {
  return getFirstNonEmpty(process.env.ZOHO_SMTP_HOST)
}

export function getZohoSmtpPort() {
  return parseIntWithinRange(process.env.ZOHO_SMTP_PORT, 465, 1, 65535)
}

export function getZohoSmtpUser() {
  return getFirstNonEmpty(process.env.ZOHO_SMTP_USER)
}

export function getZohoSmtpPass() {
  return getFirstNonEmpty(process.env.ZOHO_SMTP_PASS)
}

export function getPasswordResetFrom() {
  return getFirstNonEmpty(process.env.PASSWORD_RESET_FROM, process.env.ZOHO_SMTP_USER)
}

export function getAdminEmails() {
  const envEmails = getFirstNonEmpty(process.env.ADMIN_EMAILS)
  const defaultAdmins = ['harsh@skillbun.tech']
  if (!envEmails) return defaultAdmins
  const parsed = envEmails.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return Array.from(new Set([...defaultAdmins, ...parsed]))
}

export function isAuthorizedAdminEmail(email) {
  if (typeof email !== 'string' || !email.trim()) return false
  const normalized = email.trim().toLowerCase()
  return getAdminEmails().includes(normalized)
}

export function getUpstashRedisRestUrl() {
  return getFirstNonEmpty(process.env.UPSTASH_REDIS_REST_URL, process.env.KV_REST_API_URL)
}

export function getUpstashRedisRestToken() {
  return getFirstNonEmpty(process.env.UPSTASH_REDIS_REST_TOKEN, process.env.KV_REST_API_TOKEN)
}

export function getRedisUrl() {
  return getFirstNonEmpty(process.env.REDIS_URL, process.env.KV_URL)
}

export function isRedisConfigured() {
  const hasUpstash = Boolean(getUpstashRedisRestUrl() && getUpstashRedisRestToken())
  const hasRedisUrl = Boolean(getRedisUrl())
  return hasUpstash || hasRedisUrl
}

export function getWorkforceEncryptionKey() {
  return getFirstNonEmpty(process.env.WORKFORCE_ENCRYPTION_KEY)
}
