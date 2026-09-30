// Cancellation covers both the network response and delayed JSON decoding.
export function startSearchRequest({ query, onResult, onError, fetchImpl = fetch, delay = 300 }) {
  const controller = new AbortController();
  let cancelled = false;
  const timer = setTimeout(async () => {
    try {
      const response = await fetchImpl(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Search unavailable');
      const data = await response.json();
      if (!Array.isArray(data?.pages) || !Array.isArray(data?.roadmaps)) {
        throw new Error('Invalid search response');
      }
      if (!cancelled) onResult(data);
    } catch (error) {
      if (!cancelled) onError(error);
    }
  }, delay);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    controller.abort();
  };
}

export function nextSearchIndex(key, current, count) {
  if (!count) return -1;
  if (key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  return current;
}
