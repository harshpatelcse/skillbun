'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeDataSync } from './dataSyncManager';

// Client-side in-memory cache: key -> { data, timestamp }
const clientCache = new Map();

// In-flight fetch deduplication: key -> Promise
const inFlightFetches = new Map();

/**
 * High-performance client-side data fetching hook with:
 * - Instant initial render from client memory cache (0ms perceived latency)
 * - Background stale-while-revalidate (SWR)
 * - In-flight promise deduplication
 * - Automatic multi-tab synchronization via dataSyncManager
 * - Optimistic mutation helper
 *
 * @param {string|null} url - Request URL (falsy value skips fetch)
 * @param {Object} options
 * @param {Function} [options.fetcher] - Custom fetcher function
 * @param {string|string[]} [options.syncTags] - Sync tag(s) to listen for mutations
 * @param {boolean} [options.revalidateOnFocus=true] - Revalidate on window focus
 * @param {number} [options.dedupingIntervalMs=2000] - Interval to deduplicate identical requests
 */
export function useFastQuery(url, options = {}) {
  const {
    fetcher,
    syncTags = [],
    revalidateOnFocus = true,
    dedupingIntervalMs = 2000,
    initialFallback = null,
  } = options;

  const tags = Array.isArray(syncTags) ? syncTags : [syncTags].filter(Boolean);
  const cacheKey = url || '';

  const [data, setData] = useState(() => {
    if (!cacheKey) return initialFallback;
    const cached = clientCache.get(cacheKey);
    return cached ? cached.data : initialFallback;
  });

  const [loading, setLoading] = useState(() => {
    if (!cacheKey) return false;
    return !clientCache.has(cacheKey);
  });

  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  const executeFetch = useCallback(async (isBackground = false) => {
    if (!cacheKey) return null;

    const now = Date.now();
    const cached = clientCache.get(cacheKey);

    // If fresh within deduping interval, avoid redundant network calls
    if (cached && now - cached.timestamp < dedupingIntervalMs && isBackground) {
      return cached.data;
    }

    if (!isBackground && !cached) {
      setLoading(true);
    }

    // Single-flight deduplication across multiple hook consumers
    if (inFlightFetches.has(cacheKey)) {
      try {
        const sharedData = await inFlightFetches.get(cacheKey);
        if (isMountedRef.current) {
          setData(sharedData);
          setLoading(false);
          setError(null);
        }
        return sharedData;
      } catch (err) {
        if (isMountedRef.current) {
          setError(err);
          setLoading(false);
        }
        throw err;
      }
    }

    const fetchPromise = (async () => {
      try {
        let resultData;
        if (typeof fetcher === 'function') {
          resultData = await fetcher(cacheKey);
        } else {
          const res = await fetch(cacheKey);
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Request failed with status ${res.status}`);
          }
          resultData = await res.json();
        }

        clientCache.set(cacheKey, { data: resultData, timestamp: Date.now() });

        if (isMountedRef.current) {
          setData(resultData);
          setError(null);
        }
        return resultData;
      } finally {
        inFlightFetches.delete(cacheKey);
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    })();

    inFlightFetches.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } catch (err) {
      if (isMountedRef.current) {
        setError(err);
      }
      return null;
    }
  }, [cacheKey, fetcher, dedupingIntervalMs]);

  // Initial fetch / SWR revalidation on mount
  useEffect(() => {
    isMountedRef.current = true;
    if (!cacheKey) return;

    const hasCache = clientCache.has(cacheKey);
    const fetchTimer = setTimeout(() => {
      if (isMountedRef.current) {
        executeFetch(hasCache);
      }
    }, 0);

    return () => {
      clearTimeout(fetchTimer);
      isMountedRef.current = false;
    };
  }, [cacheKey, executeFetch]);

  // Window Focus Revalidation
  useEffect(() => {
    if (!revalidateOnFocus || !cacheKey) return;

    const onFocus = () => {
      executeFetch(true);
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [cacheKey, executeFetch, revalidateOnFocus]);

  // Real-time Cross-Tab & Mutation Synchronization
  useEffect(() => {
    if (!cacheKey || tags.length === 0) return;

    const unsubscribe = subscribeDataSync((event) => {
      if (event.type === 'DATA_MUTATED' || event.tag) {
        const matchesTag = tags.includes(event.tag) || tags.includes('*');
        if (matchesTag) {
          // Invalidate client cache entry and revalidate
          clientCache.delete(cacheKey);
          executeFetch(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [cacheKey, tags, executeFetch]);

  /**
   * Optimistically updates local cache and component state
   */
  const mutate = useCallback((updater, shouldRevalidate = true) => {
    const currentData = clientCache.get(cacheKey)?.data;
    const nextData = typeof updater === 'function' ? updater(currentData) : updater;

    clientCache.set(cacheKey, { data: nextData, timestamp: Date.now() });
    setData(nextData);

    if (shouldRevalidate) {
      executeFetch(true);
    }
  }, [cacheKey, executeFetch]);

  return {
    data,
    loading,
    error,
    revalidate: () => executeFetch(false),
    mutate,
  };
}

/**
 * Clear all or specific keys from client cache
 */
export function clearClientCache(pattern) {
  if (!pattern) {
    clientCache.clear();
    return;
  }
  for (const key of clientCache.keys()) {
    if (key.includes(pattern)) {
      clientCache.delete(key);
    }
  }
}
