'use client';



const PROFILE_CHANGE_EVENT = 'sb_profile_change';
const DEFAULT_PROFILE = Object.freeze({
  hydrated: false,
  name: 'Student',
  hasName: false,
  uid: '',
  email: '',
  degree: '',
  year: '',
  interest: '',
});
let lastSnapshot = DEFAULT_PROFILE;
let sessionProfile = null;

export function notifyProfileChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROFILE_CHANGE_EVENT));
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('skillbun_data_sync_channel');
        channel.postMessage({ type: 'PROFILE_UPDATED', tag: 'user:profile', timestamp: Date.now() });
        channel.close();
      }
    } catch {}
  }
}

export function readProfileSnapshot() {
  if (typeof window === 'undefined') {
    return DEFAULT_PROFILE;
  }

  if (sessionProfile) return sessionProfile;

  let nextSnapshot;
  try {
    const storedName = window.localStorage.getItem('sb_name') || '';
    nextSnapshot = {
      hydrated: true,
      name: storedName || 'Student',
      hasName: Boolean(storedName),
      uid: window.localStorage.getItem('sb_profile_uid') || '',
      email: window.localStorage.getItem('sb_email') || '',
      degree: window.localStorage.getItem('sb_degree') || '',
      year: window.localStorage.getItem('sb_year') || '',
      interest: window.localStorage.getItem('sb_interest') || '',
    };
  } catch {
    nextSnapshot = { ...DEFAULT_PROFILE, hydrated: true };
  }

  if (
    lastSnapshot.hydrated === nextSnapshot.hydrated &&
    lastSnapshot.name === nextSnapshot.name &&
    lastSnapshot.hasName === nextSnapshot.hasName &&
    lastSnapshot.uid === nextSnapshot.uid &&
    lastSnapshot.email === nextSnapshot.email &&
    lastSnapshot.degree === nextSnapshot.degree &&
    lastSnapshot.year === nextSnapshot.year &&
    lastSnapshot.interest === nextSnapshot.interest
  ) {
    return lastSnapshot;
  }

  lastSnapshot = nextSnapshot;
  return lastSnapshot;
}


function setOrRemove(key, value) {
  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }
}

export function isProfileCacheForUser(profile, user) {
  if (!user?.uid) return false;
  if (profile?.uid && profile.uid !== user.uid) return false;
  const cachedEmail = String(profile?.email || '').trim().toLowerCase();
  return !cachedEmail || cachedEmail === String(user.email || '').trim().toLowerCase();
}

export function saveStoredProfile({ uid, name, email, degree, year, interest }) {
  if (typeof window === 'undefined') return;
  // Browser caching must not turn a successful cloud profile read/save into
  // a failed session when storage is blocked or its quota is exhausted.
  sessionProfile = {
    hydrated: true, uid: uid || '', name: name || 'Student', hasName: Boolean(name),
    email: email || '', degree: degree || '', year: year || '', interest: interest || '',
  };
  try {
    setOrRemove('sb_profile_uid', uid || '');
    setOrRemove('sb_name', name || '');
    setOrRemove('sb_email', email || '');
    setOrRemove('sb_degree', degree || '');
    setOrRemove('sb_year', year || '');
    setOrRemove('sb_interest', interest || '');
    sessionProfile = null;
  } catch {
    // Keep only this tab's current account profile until storage works again.
  }
  notifyProfileChanged();
}

export function clearStoredProfile() {
  if (typeof window === 'undefined') {
    return;
  }

  // Mask stale persisted values even when this browser rejects their removal.
  sessionProfile = { ...DEFAULT_PROFILE, hydrated: true };
  let removed = true;
  for (const key of ['sb_name', 'sb_profile_uid', 'sb_email', 'sb_degree', 'sb_year', 'sb_interest']) {
    try { window.localStorage.removeItem(key); } catch { removed = false; }
  }
  if (removed) sessionProfile = null;
  notifyProfileChanged();
}
