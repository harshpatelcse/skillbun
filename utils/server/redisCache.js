import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getUpstashRedisRestToken, getUpstashRedisRestUrl, isRedisConfigured } from './env.js'
import { sanitizeCacheKey } from './inputValidator.js'

// Maximum in-memory entries to prevent serverless process heap growth
const MAX_L1_ENTRIES = 1000

// In-memory L1 cache: key -> { value, expiresAt, swrUntil, tags }
const memoryL1Cache = new Map()

// Map for single-flight in-flight promise deduplication: key -> Promise
const inFlightRequests = new Map()

// Tag registry for deterministic multi-key invalidation: tag -> Set<safeKey>
const tagRegistry = new Map()

function pruneL1Cache() {
  const now = Date.now()
  // Clean expired entries first
  for (const [key, entry] of memoryL1Cache.entries()) {
    if (entry.swrUntil && entry.swrUntil < now) {
      memoryL1Cache.delete(key)
    } else if (!entry.swrUntil && entry.expiresAt < now) {
      memoryL1Cache.delete(key)
    }
  }

  // If still above capacity, evict oldest entries (FIFO/LRU insertion order)
  if (memoryL1Cache.size > MAX_L1_ENTRIES) {
    const toRemove = memoryL1Cache.size - MAX_L1_ENTRIES
    const keys = memoryL1Cache.keys()
    for (let i = 0; i < toRemove; i++) {
      const nextKey = keys.next().value
      if (nextKey) memoryL1Cache.delete(nextKey)
    }
  }
}

/**
 * Multi-layer Cache Manager (L1 Instance Memory -> L2 Upstash Redis -> L3 Source Data)
 */
export async function getCache(key) {
  const safeKey = sanitizeCacheKey(key)
  const now = Date.now()

  // 1. Check L1 In-Memory Cache
  const l1Hit = memoryL1Cache.get(safeKey)
  if (l1Hit) {
    if (l1Hit.expiresAt > now) {
      return l1Hit.value
    }
    // If within SWR grace window, still return stale data
    if (l1Hit.swrUntil && l1Hit.swrUntil > now) {
      return l1Hit.value
    }
  }

  // 2. Check L2 Upstash Redis
  if (isRedisConfigured()) {
    const restUrl = getUpstashRedisRestUrl()
    const restToken = getUpstashRedisRestToken()

    if (restUrl && restToken) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 1500)

        const response = await fetch(`${restUrl.replace(/\/+$/, '')}/get/${encodeURIComponent(safeKey)}`, {
          headers: { Authorization: `Bearer ${restToken}` },
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (response.ok) {
          const data = await response.json()
          if (data?.result) {
            try {
              const parsed = JSON.parse(data.result)
              // Cache in L1 memory for 30 seconds to reduce Redis roundtrips
              memoryL1Cache.set(safeKey, {
                value: parsed,
                expiresAt: now + 30_000,
                swrUntil: now + 90_000,
                tags: [],
              })
              return parsed
            } catch {
              memoryL1Cache.set(safeKey, {
                value: data.result,
                expiresAt: now + 30_000,
                swrUntil: now + 90_000,
                tags: [],
              })
              return data.result
            }
          }
        }
      } catch (err) {
        console.warn('[Redis Cache Get Error]:', err?.message)
      }
    }
  }

  return null
}

export async function setCache(key, value, ttlSeconds = 300, tags = []) {
  const safeKey = sanitizeCacheKey(key)
  const now = Date.now()
  const swrGraceMs = Math.min(ttlSeconds * 1000 * 2, 600_000) // up to 10 min grace for SWR

  // Ensure L1 bounds
  if (memoryL1Cache.size >= MAX_L1_ENTRIES) {
    pruneL1Cache()
  }

  // 1. Save in L1 Memory
  memoryL1Cache.set(safeKey, {
    value,
    expiresAt: now + ttlSeconds * 1000,
    swrUntil: now + ttlSeconds * 1000 + swrGraceMs,
    tags: Array.isArray(tags) ? tags : [],
  })

  // Index tags
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (!tagRegistry.has(tag)) {
        tagRegistry.set(tag, new Set())
      }
      tagRegistry.get(tag).add(safeKey)
    }
  }

  // 2. Save in L2 Upstash Redis
  if (isRedisConfigured()) {
    const restUrl = getUpstashRedisRestUrl()
    const restToken = getUpstashRedisRestToken()

    if (restUrl && restToken) {
      try {
        const stringVal = typeof value === 'string' ? value : JSON.stringify(value)
        fetch(`${restUrl.replace(/\/+$/, '')}/setex/${encodeURIComponent(safeKey)}/${ttlSeconds}/${encodeURIComponent(stringVal)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${restToken}` },
        }).catch(() => {})
      } catch (err) {
        console.warn('[Redis Cache Set Error]:', err?.message)
      }
    }
  }
}

/**
 * Remove specific key from L1 and L2 cache
 */
export async function deleteCache(key) {
  const safeKey = sanitizeCacheKey(key)
  memoryL1Cache.delete(safeKey)
  inFlightRequests.delete(safeKey)

  // Remove from tag registry
  for (const set of tagRegistry.values()) {
    set.delete(safeKey)
  }

  if (isRedisConfigured()) {
    const restUrl = getUpstashRedisRestUrl()
    const restToken = getUpstashRedisRestToken()
    if (restUrl && restToken) {
      try {
        fetch(`${restUrl.replace(/\/+$/, '')}/del/${encodeURIComponent(safeKey)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${restToken}` },
        }).catch(() => {})
      } catch (err) {
        console.warn('[Redis Cache Del Error]:', err?.message)
      }
    }
  }
}

/**
 * Deterministically invalidate all cache keys associated with a given tag
 */
export async function invalidateCacheTag(tag) {
  if (!tag) return
  const safeTag = String(tag).trim()
  const keys = tagRegistry.get(safeTag)

  if (keys && keys.size > 0) {
    const keyArray = Array.from(keys)
    tagRegistry.delete(safeTag)

    for (const k of keyArray) {
      memoryL1Cache.delete(k)
      inFlightRequests.delete(k)
    }

    if (isRedisConfigured() && keyArray.length > 0) {
      const restUrl = getUpstashRedisRestUrl()
      const restToken = getUpstashRedisRestToken()
      if (restUrl && restToken) {
        // Purge keys in Redis
        for (const k of keyArray) {
          fetch(`${restUrl.replace(/\/+$/, '')}/del/${encodeURIComponent(k)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${restToken}` },
          }).catch(() => {})
        }
      }
    }
  }
}

/**
 * Invalidate all keys matching a prefix pattern
 */
export async function invalidateCachePattern(prefix) {
  if (!prefix) return
  const safePrefix = String(prefix)

  for (const k of Array.from(memoryL1Cache.keys())) {
    if (k.startsWith(safePrefix)) {
      memoryL1Cache.delete(k)
      inFlightRequests.delete(k)
    }
  }
}

/**
 * Read-through Cache Helper with Single-Flight Promise Coalescing & SWR
 * Ensures concurrent requests for the same key do NOT cause cache stampedes.
 */
export async function getOrSetCache(key, ttlSeconds, fetcherFn, options = {}) {
  const safeKey = sanitizeCacheKey(key)
  const now = Date.now()
  const tags = options.tags || []
  const swrEnabled = options.swr !== false

  // 1. Check L1 memory cache
  const l1Hit = memoryL1Cache.get(safeKey)
  if (l1Hit) {
    // If strictly fresh, return immediately (0ms)
    if (l1Hit.expiresAt > now) {
      return l1Hit.value
    }
    // If SWR is enabled and within grace window, return stale value and revalidate in background
    if (swrEnabled && l1Hit.swrUntil && l1Hit.swrUntil > now) {
      // Background revalidation without blocking caller
      if (!inFlightRequests.has(safeKey)) {
        const bgPromise = (async () => {
          try {
            const fresh = await fetcherFn()
            if (fresh !== null && fresh !== undefined) {
              await setCache(safeKey, fresh, ttlSeconds, tags)
            }
          } catch (err) {
            console.warn('[Cache SWR Background Revalidation Warning]:', err?.message)
          } finally {
            inFlightRequests.delete(safeKey)
          }
        })()
        inFlightRequests.set(safeKey, bgPromise)
      }
      return l1Hit.value
    }
  }

  // 2. Check L2 Redis cache
  const redisHit = await getCache(safeKey)
  if (redisHit !== null && redisHit !== undefined) {
    return redisHit
  }

  // 3. Single-Flight Coalescing: If a fetch for this key is already running, wait for it
  if (inFlightRequests.has(safeKey)) {
    return inFlightRequests.get(safeKey)
  }

  // 4. Execute fetcherFn with single-flight protection
  const fetchPromise = (async () => {
    try {
      const freshData = await fetcherFn()
      if (freshData !== null && freshData !== undefined) {
        await setCache(safeKey, freshData, ttlSeconds, tags)
      }
      return freshData
    } finally {
      inFlightRequests.delete(safeKey)
    }
  })()

  inFlightRequests.set(safeKey, fetchPromise)
  return fetchPromise
}

/**
 * Deterministic ETag generator for zero-byte HTTP 304 conditional revalidation
 */
export function generateETag(data) {
  if (data === null || data === undefined) return '"0"'
  const str = typeof data === 'string' ? data : JSON.stringify(data)
  const hash = crypto.createHash('md5').update(str).digest('hex').slice(0, 16)
  return `W/"${hash}"`
}

/**
 * Creates an optimized HTTP response with ETag and conditional 304 handling.
 * If the client's If-None-Match matches the payload ETag, returns 304 Not Modified
 * with zero body payload, saving transit and parsing overhead.
 */
export function createCachedJsonResponse(request, data, options = {}) {
  const etag = options.etag || generateETag(data)
  const clientEtag = request?.headers?.get?.('if-none-match')
  const swr = options.swr ?? 60

  const headers = {
    ETag: etag,
    'Cache-Control': `private, no-cache, stale-while-revalidate=${swr}`,
    ...(options.headers || {}),
  }

  if (clientEtag && clientEtag === etag) {
    return new Response(null, { status: 304, headers })
  }

  return NextResponse.json(data, {
    status: options.status || 200,
    headers,
  })
}

