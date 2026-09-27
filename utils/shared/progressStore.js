'use client';

const PROGRESS_PREFIX = 'skillbun_progress_';
const PROGRESS_CHANGE_EVENT = 'sb_progress_change';

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

  window.localStorage.setItem(getProgressStorageKey(slug), JSON.stringify(sanitizeCompletedNodeIds(completedNodeIds)));
  notifyProgressChanged();
}

export function readAllStoredRoadmapProgress() {
  if (typeof window === 'undefined') {
    return [];
  }

  const progress = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);

    if (!key?.startsWith(PROGRESS_PREFIX)) {
      continue;
    }

    const slug = key.slice(PROGRESS_PREFIX.length);
    const completedNodeIds = readStoredRoadmapProgress(slug);

    if (slug) {
      progress.push({ slug, completedNodeIds });
    }
  }

  return progress;
}

export function clearStoredRoadmapProgress() {
  if (typeof window === 'undefined') {
    return;
  }

  const keysToRemove = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);

    if (key?.startsWith(PROGRESS_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  notifyProgressChanged();
}
