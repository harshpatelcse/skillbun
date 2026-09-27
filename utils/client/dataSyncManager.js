'use client';

/**
 * SkillBun Universal Cross-Tab & Real-Time Data Sync Manager
 * Bridges multi-tab browser contexts using BroadcastChannel and local CustomEvents.
 */

const SYNC_CHANNEL_NAME = 'skillbun_data_sync_channel';
const SYNC_EVENT_NAME = 'skillbun_data_sync_event';

let channelInstance = null;

function getSyncChannel() {
  if (typeof window === 'undefined') return null;
  if (!channelInstance && typeof BroadcastChannel !== 'undefined') {
    try {
      channelInstance = new BroadcastChannel(SYNC_CHANNEL_NAME);
    } catch {
      channelInstance = null;
    }
  }
  return channelInstance;
}

/**
 * Broadcasts a sync event across all open browser tabs and local window listeners
 */
export function broadcastDataSync(payload) {
  if (typeof window === 'undefined') return;

  const eventPayload = {
    ...payload,
    timestamp: Date.now(),
  };

  // 1. Cross-tab Broadcast
  const channel = getSyncChannel();
  if (channel) {
    try {
      channel.postMessage(eventPayload);
    } catch (err) {
      console.warn('[Sync BroadcastChannel Warning]:', err?.message);
    }
  }

  // 2. Same-window CustomEvent dispatch
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME, { detail: eventPayload }));
  } catch {}
}

/**
 * Subscribes to sync events from other tabs or the current tab
 * @param {Function} callback - handler(eventPayload)
 * @returns {Function} unsubscribe function
 */
export function subscribeDataSync(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {};
  }

  const channel = getSyncChannel();

  // Handler for cross-tab BroadcastChannel messages
  const channelHandler = (event) => {
    if (event?.data) {
      callback(event.data);
    }
  };

  // Handler for same-tab CustomEvents
  const windowHandler = (event) => {
    if (event?.detail) {
      callback(event.detail);
    }
  };

  if (channel) {
    channel.addEventListener('message', channelHandler);
  }
  window.addEventListener(SYNC_EVENT_NAME, windowHandler);

  return () => {
    if (channel) {
      channel.removeEventListener('message', channelHandler);
    }
    window.removeEventListener(SYNC_EVENT_NAME, windowHandler);
  };
}

/**
 * Helper to notify that an entity or cache tag has been mutated
 */
export function notifyDataMutated(tag, metadata = {}) {
  broadcastDataSync({
    type: 'DATA_MUTATED',
    tag,
    ...metadata,
  });
}

/**
 * Helper to notify that a student profile has been synced
 */
export function notifyProfileUpdated(uid) {
  broadcastDataSync({
    type: 'PROFILE_UPDATED',
    tag: 'user:profile',
    uid,
  });
}

/**
 * Helper to notify that roadmap progress has updated
 */
export function notifyProgressUpdated(slug) {
  broadcastDataSync({
    type: 'PROGRESS_UPDATED',
    tag: 'user:progress',
    slug,
  });
}

/**
 * Helper to notify that certificate credentials changed
 */
export function notifyCertificateMutated(certId) {
  broadcastDataSync({
    type: 'CERTIFICATE_MUTATED',
    tag: 'admin:certs',
    certId,
  });
}

/**
 * Helper to notify that workforce or document data changed
 */
export function notifyWorkforceMutated(employeeId) {
  broadcastDataSync({
    type: 'WORKFORCE_MUTATED',
    tag: 'admin:workforce',
    employeeId,
  });
}
