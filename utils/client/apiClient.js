'use client'

/**
 * Custom Error class with rich API error context
 */
export class ApiError extends Error {
  constructor({ message, status = 500, code = 'INTERNAL_ERROR', details = null, retryAfterMs = null, isNetwork = false }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfterMs = retryAfterMs
    this.retryAfterSeconds = retryAfterMs ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : null
    this.isRateLimited = status === 429 || code === 'RATE_LIMIT_EXCEEDED'
    this.isUnauthorized = status === 401 || code === 'UNAUTHORIZED'
    this.isForbidden = status === 403 || code === 'FORBIDDEN'
    this.isNotFound = status === 404 || code === 'NOT_FOUND'
    this.isNetworkError = isNetwork
  }
}

/**
 * Extract human-friendly error message from any error source
 */
export function formatApiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error.isRateLimited && error.retryAfterSeconds) {
    return `Too many requests. Please wait ${error.retryAfterSeconds} seconds before trying again.`
  }
  if (error.isNetworkError) {
    return 'Unable to reach the server. Please check your internet connection.'
  }
  return error.message || fallback
}

/**
 * Universal Client API Fetch wrapper.
 * Standardizes request configuration, JSON parsing, error interception, and retry info.
 */
export async function apiFetch(url, options = {}) {
  const {
    headers = {},
    body,
    token = null,
    retries = 0,
    retryDelayMs = 1000,
    ...restOptions
  } = options

  const resolvedHeaders = {
    Accept: 'application/json',
    ...headers,
  }

  // Include Content-Type if body is an object
  let resolvedBody = body
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    resolvedHeaders['Content-Type'] = 'application/json'
    resolvedBody = JSON.stringify(body)
  }

  // Attach Firebase Auth bearer token if provided
  if (token) {
    resolvedHeaders.Authorization = `Bearer ${token}`
  }

  let attempt = 0
  const maxAttempts = Math.max(1, retries + 1)

  while (attempt < maxAttempts) {
    attempt += 1

    try {
      const response = await fetch(url, {
        headers: resolvedHeaders,
        body: resolvedBody,
        ...restOptions,
      })

      // Parse response body safely
      let data = null
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        try {
          data = await response.json()
        } catch {
          data = null
        }
      } else {
        try {
          const rawText = await response.text()
          data = { message: rawText }
        } catch {
          data = null
        }
      }

      // Successful HTTP status (200 - 299)
      if (response.ok) {
        return data
      }

      // Extract error details from standardized or legacy schemas
      const errorObj = data?.error
      const errorMessage =
        (typeof errorObj === 'string' ? errorObj : errorObj?.message) ||
        data?.message ||
        `Request failed with status ${response.status}`

      const errorCode = errorObj?.code || (response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'API_ERROR')
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterMs = errorObj?.retryAfterMs || (retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) * 1000 : null)

      const apiErr = new ApiError({
        message: errorMessage,
        status: response.status,
        code: errorCode,
        details: errorObj?.details || null,
        retryAfterMs,
      })

      // If status is a transient server error (502, 503, 504) and retries remain, retry
      if ([502, 503, 504].includes(response.status) && attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, retryDelayMs * attempt))
        continue
      }

      throw apiErr
    } catch (err) {
      if (err instanceof ApiError) {
        throw err
      }

      // Network drop / abort / connection failure
      const isNetwork = err?.name === 'TypeError' || err?.message?.includes('fetch')
      if (isNetwork && attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, retryDelayMs * attempt))
        continue
      }

      throw new ApiError({
        message: isNetwork ? 'Network connection lost. Please check your internet.' : (err?.message || 'Network request failed'),
        status: 0,
        code: 'NETWORK_ERROR',
        isNetwork: true,
      })
    }
  }
}
