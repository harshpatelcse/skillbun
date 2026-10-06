'use client';

const PROGRESS_PREFIX = 'skillbun_progress_';
const PROGRESS_CHANGE_EVENT = 'sb_progress_change';
const sessionProgress = new Map();
let ignoreStoredProgress = false;

export function notifyProgressChanged(slug) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROGRESS_CHANGE_EVENT));
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('skillbun_data_sync_channel');
        channel.postMessage({ type: 'PROGRESS_UPDATED', tag: 'user:progress', slug, timestamp: Date.now() });
        channel.close();
      }
    } catch {}
  }
}

export function getProgressStorageKey(slug) {
  return `${PROGRESS_PREFIX}${slug}`;
}

function sanitizeCompletedNodeIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item) => typeof item === 'string' && item.trim())));
}

export function readStoredRoadmapProgress(slug) {
  if (typeof window === 'undefined' || !slug) {
    return [];
  }

  if (sessionProgress.has(slug)) return [...sessionProgress.get(slug)];
  if (ignoreStoredProgress) return [];

  try {
    const raw = window.localStorage.getItem(getProgressStorageKey(slug));
    const parsed = raw ? JSON.parse(raw) : [];
    return sanitizeCompletedNodeIds(parsed);
  } catch {
    return [];
  }
}

export function saveStoredRoadmapProgress(slug, completedNodeIds) {
  if (typeof window === 'undefined' || !slug) {
    return;
  }

  const cleanIds = sanitizeCompletedNodeIds(completedNodeIds);
  sessionProgress.set(slug, cleanIds);
  try {
    window.localStorage.setItem(getProgressStorageKey(slug), JSON.stringify(cleanIds));
    if (!ignoreStoredProgress) sessionProgress.delete(slug);
  } catch {
    // Cloud progress remains available in this tab if browser caching fails.
  }
  notifyProgressChanged();
}

export function readAllStoredRoadmapProgress() {
  if (typeof window === 'undefined') {
    return [];
  }

  const progress = new Map();
  try {
    if (!ignoreStoredProgress) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(PROGRESS_PREFIX)) continue;
        const slug = key.slice(PROGRESS_PREFIX.length);
        if (slug) progress.set(slug, readStoredRoadmapProgress(slug));
      }
    }
  } catch {
    // Enumeration is blocked in some private/embedded browser sessions.
  }
  for (const [slug, completedNodeIds] of sessionProgress) progress.set(slug, [...completedNodeIds]);
  return Array.from(progress, ([slug, completedNodeIds]) => ({ slug, completedNodeIds }));
}

export function clearStoredRoadmapProgress() {
  if (typeof window === 'undefined') {
    return;
  }

  sessionProgress.clear();
  // If removal fails, never expose the previous account's persisted progress.
  ignoreStoredProgress = true;
  let removed = true;
  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PROGRESS_PREFIX)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      try { window.localStorage.removeItem(key); } catch { removed = false; }
    }
  } catch {
    removed = false;
  }
  if (removed) ignoreStoredProgress = false;
  notifyProgressChanged();
}
