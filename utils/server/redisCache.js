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
const cacheSourceKeys = new Map()
const localTagVersions = new Map()
const pendingTagInvalidations = new Map()
const pendingCacheDeletes = new Set()
let invalidationFlush = null

async function redisCommand(command) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch(getUpstashRedisRestUrl().replace(/\/+$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${getUpstashRedisRestToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Redis returned ${response.status}`)
    const payload = await response.json()
    if (payload.error) throw new Error(payload.error)
    return payload.result
  } finally {
    clearTimeout(timeout)
  }
}

function tagVersionKey(tag) {
  return `cache:v2:tag:${crypto.createHash('sha256').update(tag).digest('hex')}`
}

function sourceKeyTag(key) {
  return `cache-key:${crypto.createHash('sha256').update(String(key)).digest('hex')}`
}

async function flushPendingInvalidations() {
  if (!pendingTagInvalidations.size && !pendingCacheDeletes.size) return
  if (invalidationFlush) return invalidationFlush
  invalidationFlush = (async () => {
    while (pendingTagInvalidations.size || pendingCacheDeletes.size) {
      if (pendingTagInvalidations.size) {
        const [tag, version] = pendingTagInvalidations.entries().next().value
        await redisCommand(['INCR', tagVersionKey(tag)])
        if (pendingTagInvalidations.get(tag) === version) pendingTagInvalidations.delete(tag)
      } else {
        const keys = [...pendingCacheDeletes]
        await redisCommand(['DEL', ...keys])
        keys.forEach(key => pendingCacheDeletes.delete(key))
      }
    }
  })()
  try {
    await invalidationFlush
  } finally {
    invalidationFlush = null
  }
}

async function resolveCacheKey(key, tags) {
  let versions = tags.map(tag => localTagVersions.get(tag) || 0)
  if (tags.length && isRedisConfigured()) {
    try {
      await flushPendingInvalidations()
      versions = await redisCommand(['MGET', ...tags.map(tagVersionKey)])
      if (!Array.isArray(versions) || versions.length !== tags.length) throw new Error('Invalid cache tag versions')
    } catch (error) {
      // A missed shared revision must never revive a stale local payload.
      // Reads remain available from the authoritative source during an outage.
      console.warn('[Cache Tag Read Warning]:', error?.message)
      return null
    }
  }
  // A new namespace also prevents pre-fix Redis values from being reused.
  return `cache:v2:${crypto.createHash('sha256').update(JSON.stringify([key, tags, versions])).digest('hex')}`
}

function forgetMemoryEntry(key) {
  const entry = memoryL1Cache.get(key)
  for (const tag of entry?.tags || []) {
    const keys = tagRegistry.get(tag)
    keys?.delete(key)
    if (!keys?.size) tagRegistry.delete(tag)
  }
  memoryL1Cache.delete(key)
  cacheSourceKeys.delete(key)
}

function pruneL1Cache() {
  const now = Date.now()
  // Clean expired entries first
  for (const [key, entry] of memoryL1Cache.entries()) {
    if (entry.swrUntil && entry.swrUntil < now) {
      forgetMemoryEntry(key)
    } else if (!entry.swrUntil && entry.expiresAt < now) {
      forgetMemoryEntry(key)
    }
  }

  // If still above capacity, evict oldest entries (FIFO/LRU insertion order)
  if (memoryL1Cache.size >= MAX_L1_ENTRIES) {
    const toRemove = memoryL1Cache.size - MAX_L1_ENTRIES + 1
    const keys = memoryL1Cache.keys()
    for (let i = 0; i < toRemove; i++) {
      const nextKey = keys.next().value
      if (nextKey) forgetMemoryEntry(nextKey)
    }
  }
}

/**
 * Multi-layer Cache Manager (L1 Instance Memory -> L2 Upstash Redis -> L3 Source Data)
 */
export async function getCache(key, { allowStale = false } = {}) {
  const safeKey = sanitizeCacheKey(key)
  const now = Date.now()

  // 1. Check L1 In-Memory Cache
  const l1Hit = memoryL1Cache.get(safeKey)
  if (l1Hit) {
    if (l1Hit.expiresAt > now) {
      return l1Hit.value
    }
    // If within SWR grace window, still return stale data
    if (allowStale && l1Hit.swrUntil && l1Hit.swrUntil > now) {
      return l1Hit.value
    }
  }

  // 2. Check L2 Upstash Redis
  if (isRedisConfigured()) {
    const restUrl = getUpstashRedisRestUrl()
    const restToken = getUpstashRedisRestToken()

    if (restUrl && restToken) {
      try {
        const result = await redisCommand(['GET', safeKey])
        if (result !== null && result !== undefined) {
          const entry = JSON.parse(result)
          if (entry?.cacheVersion !== 2 || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) return null
          if (!memoryL1Cache.has(safeKey) && memoryL1Cache.size >= MAX_L1_ENTRIES) pruneL1Cache()
          const tags = Array.isArray(entry.tags) ? entry.tags : []
          memoryL1Cache.set(safeKey, {
            value: entry.value,
            // L2 hydration must not extend the source's original freshness.
            expiresAt: Math.min(entry.expiresAt, now + 30_000),
            swrUntil: entry.expiresAt,
            tags,
          })
          for (const tag of tags) {
            if (!tagRegistry.has(tag)) tagRegistry.set(tag, new Set())
            tagRegistry.get(tag).add(safeKey)
          }
          return entry.value
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
  if (!memoryL1Cache.has(safeKey) && memoryL1Cache.size >= MAX_L1_ENTRIES) {
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
        const stringVal = JSON.stringify({ cacheVersion: 2, value, expiresAt: now + ttlSeconds * 1000, tags: Array.isArray(tags) ? tags : [] })
        await redisCommand(['SETEX', safeKey, ttlSeconds, stringVal])
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
  await invalidateCacheTag(sourceKeyTag(key))
  const safeKey = sanitizeCacheKey(key)
  forgetMemoryEntry(safeKey)
  inFlightRequests.delete(safeKey)

  // Remove from tag registry
  for (const [tag, set] of tagRegistry) {
    set.delete(safeKey)
    if (!set.size) tagRegistry.delete(tag)
  }

  if (isRedisConfigured()) {
    const restUrl = getUpstashRedisRestUrl()
    const restToken = getUpstashRedisRestToken()
    if (restUrl && restToken) {
      try {
        await redisCommand(['DEL', safeKey])
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
  localTagVersions.set(safeTag, (localTagVersions.get(safeTag) || 0) + 1)
  if (isRedisConfigured()) {
    pendingTagInvalidations.set(safeTag, localTagVersions.get(safeTag))
  }
  const keys = tagRegistry.get(safeTag)

  if (keys && keys.size > 0) {
    const keyArray = Array.from(keys)
    tagRegistry.delete(safeTag)

    for (const k of keyArray) {
      // Direct setCache/getCache callers use a fixed key rather than a revisioned
      // read-through key, so preserve physical deletion for those entries.
      if (isRedisConfigured() && !cacheSourceKeys.has(k)) pendingCacheDeletes.add(k)
      forgetMemoryEntry(k)
      inFlightRequests.delete(k)
    }

    // Old Redis generations expire naturally; readers cannot address them again.
  }
  // Increment even on workers that never cached this tag. If Redis is offline,
  // retain the invalidation for recovery. Cache outages must not make a completed
  // database mutation or mail dispatch appear to have failed to the user.
  if (isRedisConfigured()) {
    try {
      await flushPendingInvalidations()
    } catch (error) {
      console.warn('[Cache Tag Invalidation Pending]:', error?.message)
      return false
    }
  }
  return true
}

/**
 * Invalidate all keys matching a prefix pattern
 */
export async function invalidateCachePattern(prefix) {
  if (!prefix) return
  const safePrefix = String(prefix)

  const sourceKeys = new Set()
  for (const k of memoryL1Cache.keys()) {
    const sourceKey = cacheSourceKeys.get(k) || k
    if (sourceKey.startsWith(safePrefix)) sourceKeys.add(sourceKey)
  }
  await Promise.all([...sourceKeys].map(deleteCache))
}

/**
 * Read-through Cache Helper with Single-Flight Promise Coalescing & SWR
 * Ensures concurrent requests for the same key do NOT cause cache stampedes.
 */
export async function getOrSetCache(key, ttlSeconds, fetcherFn, options = {}) {
  const tags = [...new Set([sourceKeyTag(key), ...(options.tags || [])].map(tag => String(tag).trim()).filter(Boolean))].sort()
  const safeKey = await resolveCacheKey(key, tags)
  if (!safeKey) return fetcherFn()
  cacheSourceKeys.set(safeKey, String(key))
  const now = Date.now()
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
            if (!memoryL1Cache.has(safeKey)) cacheSourceKeys.delete(safeKey)
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
      if (!memoryL1Cache.has(safeKey)) cacheSourceKeys.delete(safeKey)
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

