'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseServices } from '@/utils/client/firebaseClient';
import { requestAccountDeletion } from '@/utils/client/accountDeletion';
import { clearStoredProfile, isProfileCacheForUser, notifyProfileChanged, readProfileSnapshot, saveStoredProfile } from '@/utils/shared/profileStore';
import {
  clearStoredRoadmapProgress,
  readAllStoredRoadmapProgress,
  saveStoredRoadmapProgress,
} from '@/utils/shared/progressStore';

const AuthContext = createContext(null);
const EMAIL_VERIFICATION_REQUIRED = 'Verify your email before logging in. Choose Sign Up with this email to receive a code and finish setting your password.';

function assertVerifiedEmail(user) {
  if (!user?.emailVerified) {
    const error = new Error(EMAIL_VERIFICATION_REQUIRED);
    error.code = 'auth/email-not-verified';
    throw error;
  }
}

function responseRetryAfterMs(response, data) {
  const retryAfter = response.headers.get('Retry-After');
  const headerDelay = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)
    ? Number(retryAfter) * 1000
    : Math.max(0, Date.parse(retryAfter || '') - Date.now());
  const bodyDelay = Number(data?.retryAfterMs || data?.error?.retryAfterMs || 0);
  return Math.max(Number.isFinite(headerDelay) ? headerDelay : 0, Number.isFinite(bodyDelay) ? bodyDelay : 0);
}

async function emailSignupRequest(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  const retryAfterMs = responseRetryAfterMs(response, data);

  if (!response.ok || data.ok !== true) {
    const error = new Error(typeof data.error === 'string' ? data.error : data?.error?.message || 'Could not complete email verification. Please try again.');
    error.code = data?.code || data?.error?.code || 'auth/email-verification-failed';
    error.retryAfterMs = retryAfterMs;
    throw error;
  }

  return { ...data, retryAfterMs };
}

function getProviders(user) {
  return user?.providerData?.map((provider) => provider.providerId).filter(Boolean) || [];
}

function fallbackNameFromUser(user) {
  if (user?.displayName?.trim()) {
    return user.displayName.trim();
  }

  if (user?.email?.includes('@')) {
    return user.email.split('@')[0];
  }

  return '';
}

function normalizeProfileDoc(user, data = {}) {
  const name = String(data.name || data.fullName || fallbackNameFromUser(user) || '').trim();

  return {
    hydrated: true,
    uid: user?.uid || '',
    email: data.email || user?.email || '',
    displayName: data.displayName || user?.displayName || '',
    photoURL: data.photoURL || user?.photoURL || '',
    name: name || 'Student',
    hasName: Boolean(name),
    degree: data.degree || '',
    year: data.year || data.current_year || '',
    interest: data.interest || data.interest_area || '',
    ageBand: data.ageBand || '',
    emailVerified: Boolean(user?.emailVerified || data.emailVerified),
    providers: Array.isArray(data.providers) ? data.providers : getProviders(user),
  };
}

function localProfileForMigration(user) {
  const localProfile = readProfileSnapshot();
  if (!isProfileCacheForUser(localProfile, user)) {
    return { name: fallbackNameFromUser(user), degree: '', year: '', interest: '' };
  }
  const name = localProfile.hasName ? localProfile.name : fallbackNameFromUser(user);

  return {
    name: name || '',
    degree: localProfile.degree || '',
    year: localProfile.year || '',
    interest: localProfile.interest || '',
  };
}

function profileNeedsSetup(profile) {
  return !profile?.degree || !profile?.year || profile?.ageBand !== '18-plus';
}

async function ensureUserProfile(db, user) {
  const profileRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(profileRef);
  const localProfile = localProfileForMigration(user);
  const existing = snapshot.exists() ? snapshot.data() : {};

  const profilePatch = {
    uid: user.uid,
    email: user.email || existing.email || '',
    displayName: user.displayName || existing.displayName || '',
    photoURL: user.photoURL || existing.photoURL || '',
    emailVerified: Boolean(user.emailVerified),
    providers: getProviders(user),
    updatedAt: serverTimestamp(),
  };

  if (!snapshot.exists()) {
    Object.assign(profilePatch, {
      name: localProfile.name || fallbackNameFromUser(user) || '',
      degree: localProfile.degree || '',
      year: localProfile.year || '',
      interest: localProfile.interest || '',
      createdAt: serverTimestamp(),
    });
  } else {
    if (!existing.name) {
      profilePatch.name = localProfile.name || fallbackNameFromUser(user) || '';
    }
    if (!existing.degree && localProfile.degree) profilePatch.degree = localProfile.degree;
    if (!existing.year && localProfile.year) profilePatch.year = localProfile.year;
    if (!existing.interest && localProfile.interest) profilePatch.interest = localProfile.interest;
  }

  await setDoc(profileRef, profilePatch, { merge: true });
}

async function migrateLocalProgress(db, user) {
  const localProgress = readAllStoredRoadmapProgress();

  await Promise.all(localProgress.map(async ({ slug, completedNodeIds }) => {
    if (!slug || completedNodeIds.length === 0) {
      return;
    }

    const progressRef = doc(db, 'users', user.uid, 'roadmapProgress', slug);
    const snapshot = await getDoc(progressRef);
    const remoteIds = snapshot.exists() && Array.isArray(snapshot.data().completedNodeIds)
      ? snapshot.data().completedNodeIds.filter((item) => typeof item === 'string')
      : [];
    const mergedIds = Array.from(new Set([...remoteIds, ...completedNodeIds]));

    if (!snapshot.exists() || mergedIds.length !== remoteIds.length) {
      await setDoc(progressRef, {
        slug,
        completedNodeIds: mergedIds,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }));
}

function clearSessionCache() {
  clearStoredProfile();
  clearStoredRoadmapProgress();
  for (const key of ['sb_counsel_rl', 'sb_human_proof', 'sb_dest', 'sb_last_xp']) {
    try { window.localStorage.removeItem(key); } catch {}
  }
}

export function AuthProvider({ children }) {
  const services = useMemo(() => getFirebaseServices(), []);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(() => ({
    hydrated: !services.configured,
    name: 'Student',
    hasName: false,
    degree: '',
    year: '',
    interest: '',
  }));
  const [authLoading, setAuthLoading] = useState(services.configured);
  const [profileLoading, setProfileLoading] = useState(false);
  const [progressVersion, setProgressVersion] = useState(0);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!services.configured) {
      return undefined;
    }

    let profileUnsubscribe = null;
    let progressUnsubscribe = null;
    let cancelled = false;
    let authRevision = 0;

    const unsubscribeAuth = onAuthStateChanged(services.auth, async (nextUser) => {
      const revision = ++authRevision;
      profileUnsubscribe?.();
      progressUnsubscribe?.();
      profileUnsubscribe = null;
      progressUnsubscribe = null;

      setAuthLoading(false);

      if (!nextUser || !nextUser.emailVerified) {
        setUser(null);
        setProfile({ hydrated: true, name: 'Student', hasName: false, degree: '', year: '', interest: '' });
        setProfileLoading(false);
        setProgressVersion((current) => current + 1);
        const cachedProfile = readProfileSnapshot();
        if (nextUser || cachedProfile.uid || cachedProfile.email) {
          try {
            clearSessionCache();
          } catch (error) {
            console.warn('Could not clear cached account data:', error);
          }
        }
        if (nextUser) {
          setAuthError(EMAIL_VERIFICATION_REQUIRED);
          try {
            if (services.auth.currentUser?.uid === nextUser.uid) {
              await signOut(services.auth);
            }
          } catch (error) {
            console.warn('Could not clear the unverified Firebase session:', error);
          }
        }
        return;
      }

      setAuthError('');
      setUser(nextUser);
      setProfileLoading(true);

      // Browser caches are shared across accounts. Never migrate another
      // student's profile or progress when Firebase changes the signed-in user.
      const canMigrateCache = isProfileCacheForUser(readProfileSnapshot(), nextUser);
      if (!canMigrateCache) {
        try {
          clearSessionCache();
        } catch (error) {
          console.warn('Could not clear another account\'s cached data:', error);
        }
      }

      try {
        await ensureUserProfile(services.db, nextUser);
        if (cancelled || revision !== authRevision) return;
        if (canMigrateCache) await migrateLocalProgress(services.db, nextUser);

        if (cancelled || revision !== authRevision) {
          return;
        }

        const profileRef = doc(services.db, 'users', nextUser.uid);
        profileUnsubscribe = onSnapshot(profileRef, (snapshot) => {
          if (cancelled || revision !== authRevision) return;
          const normalized = normalizeProfileDoc(nextUser, snapshot.exists() ? snapshot.data() : {});
          setProfile(normalized);
          saveStoredProfile(normalized);
          setProfileLoading(false);
        }, (error) => {
          if (cancelled || revision !== authRevision) return;
          console.error('Failed to read Firebase profile:', error);
          const fallbackProfile = normalizeProfileDoc(nextUser);
          setProfile(fallbackProfile);
          saveStoredProfile(fallbackProfile);
          setAuthError('Could not load your cloud profile. Local cached profile is being used for now.');
          setProfileLoading(false);
        });

        const progressRef = collection(services.db, 'users', nextUser.uid, 'roadmapProgress');
        progressUnsubscribe = onSnapshot(progressRef, (snapshot) => {
          if (cancelled || revision !== authRevision) return;
          snapshot.forEach((progressDoc) => {
            const data = progressDoc.data();
            const slug = data.slug || progressDoc.id;
            const completedNodeIds = Array.isArray(data.completedNodeIds)
              ? data.completedNodeIds.filter((item) => typeof item === 'string')
              : [];

            saveStoredRoadmapProgress(slug, completedNodeIds);
          });
          setProgressVersion((current) => current + 1);
        }, (error) => {
          if (cancelled || revision !== authRevision) return;
          console.error('Failed to read Firebase roadmap progress:', error);
          setAuthError('Could not sync roadmap progress from Firestore.');
        });
      } catch (error) {
        if (cancelled || revision !== authRevision) return;
        console.error('Failed to initialize Firebase profile:', error);
        const fallbackProfile = normalizeProfileDoc(nextUser);
        setProfile(fallbackProfile);
        saveStoredProfile(fallbackProfile);
        setAuthError('Could not initialize your Firebase profile. Check your Firebase project settings.');
        setProfileLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      profileUnsubscribe?.();
      progressUnsubscribe?.();
    };
  }, [services]);

  const signInWithGoogle = useCallback(async () => {
    if (!services.configured) {
      throw new Error('Firebase is not configured yet.');
    }

    setAuthError('');
    const credential = await signInWithPopup(services.auth, services.googleProvider);
    assertVerifiedEmail(credential.user);
    return credential;
  }, [services]);

  const requestEmailSignup = useCallback(async ({ email, humanToken, ageBand }) => {
    if (!services.configured) {
      throw new Error('Firebase is not configured yet.');
    }

    setAuthError('');
    return emailSignupRequest('/api/auth/signup/request', { email, humanToken, ageBand });
  }, [services]);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!services.configured) {
      throw new Error('Firebase is not configured yet.');
    }

    setAuthError('');
    const credential = await signInWithEmailAndPassword(services.auth, email, password);
    if (!credential.user.emailVerified) {
      if (services.auth.currentUser?.uid === credential.user.uid) {
        await signOut(services.auth);
      }
      setAuthError(EMAIL_VERIFICATION_REQUIRED);
      assertVerifiedEmail(credential.user);
    }
    return credential;
  }, [services]);

  const completeEmailSignup = useCallback(async ({ email, password, code, challengeId }) => {
    if (!services.configured) {
      throw new Error('Firebase is not configured yet.');
    }

    setAuthError('');
    await emailSignupRequest('/api/auth/signup/verify', { email, password, code, challengeId });
    try {
      return await signInWithEmail(email, password);
    } catch (error) {
      error.signupCompleted = true;
      throw error;
    }
  }, [services, signInWithEmail]);

  const resetPassword = useCallback(async (email) => {
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data?.error || 'Could not send password reset email.');
      error.code = response.status === 429 ? 'auth/too-many-requests' : 'auth/password-reset-failed';
      error.retryAfterMs = responseRetryAfterMs(response, data);
      throw error;
    }

    return data;
  }, []);

  const resendVerification = useCallback(async () => {
    if (!services.configured || !services.auth.currentUser) {
      throw new Error('Sign in before requesting a verification email.');
    }

    return sendEmailVerification(services.auth.currentUser);
  }, [services]);

  const saveProfile = useCallback(async ({ name, degree, year, interest, ageBand }) => {
    if (!services.configured || !services.auth.currentUser) {
      throw new Error('Sign in before saving your SkillBun profile.');
    }

    const currentUser = services.auth.currentUser;
    assertVerifiedEmail(currentUser);
    if (ageBand !== '18-plus') throw new Error('Self-service SkillBun accounts are currently available to adults aged 18 or over.');
    const nextProfile = {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: currentUser.displayName || '',
      photoURL: currentUser.photoURL || '',
      name: name || fallbackNameFromUser(currentUser) || 'Student',
      degree: degree || '',
      year: year || '',
      interest: interest || '',
      ageBand,
      emailVerified: Boolean(currentUser.emailVerified),
      providers: getProviders(currentUser),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(services.db, 'users', currentUser.uid), nextProfile, { merge: true });
    if (services.auth.currentUser?.uid !== currentUser.uid) return;
    saveStoredProfile(nextProfile);
  }, [services]);

  const saveRoadmapProgress = useCallback(async (slug, completedNodeIds) => {
    const cleanIds = Array.from(new Set((completedNodeIds || []).filter((item) => typeof item === 'string')));

    if (!services.configured || !services.auth.currentUser) {
      throw new Error('Sign in before saving roadmap progress.');
    }
    const currentUser = services.auth.currentUser;
    assertVerifiedEmail(currentUser);

    await setDoc(doc(services.db, 'users', currentUser.uid, 'roadmapProgress', slug), {
      slug,
      completedNodeIds: cleanIds,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    if (services.auth.currentUser?.uid !== currentUser.uid) return;
    saveStoredRoadmapProgress(slug, cleanIds);
  }, [services]);

  const signOutUser = useCallback(async () => {
    if (services.configured) {
      await signOut(services.auth);
    }

    clearSessionCache();
    notifyProfileChanged();
  }, [services]);

  const deleteAccount = useCallback(async () => {
    if (!services.configured || !services.auth.currentUser) {
      throw new Error('Sign in before deleting your SkillBun account.');
    }

    const currentUser = services.auth.currentUser;
    const result = await requestAccountDeletion({
      user: currentUser,
      getCurrentUser: () => services.auth.currentUser,
    });

    // The server owns erasure. Local cleanup starts only after confirmed success
    // and must never sign out or clear the cache of a different account.
    if (services.auth.currentUser && services.auth.currentUser.uid !== currentUser.uid) return result;
    let cleanupFailed = false;
    if (services.auth.currentUser) {
      try {
        await signOut(services.auth);
      } catch (error) {
        cleanupFailed = true;
        console.warn('Account deleted, but local sign-out failed:', error);
      }
    }
    if (!services.auth.currentUser || services.auth.currentUser.uid === currentUser.uid) {
      try {
        clearSessionCache();
        notifyProfileChanged();
      } catch (error) {
        cleanupFailed = true;
        console.warn('Account deleted, but local cache cleanup failed:', error);
      }
    }

    return cleanupFailed ? {
      ...result,
      warning: 'Your account was deleted, but this browser could not finish clearing its session. Refresh this page and sign out if the old account still appears.',
    } : result;
  }, [services]);

  const value = useMemo(() => ({
    configured: services.configured,
    user,
    profile,
    authLoading,
    profileLoading,
    authError,
    progressVersion,
    isAuthenticated: Boolean(user),
    isProfileComplete: Boolean(user && !profileNeedsSetup(profile)),
    signInWithGoogle,
    requestEmailSignup,
    completeEmailSignup,
    signInWithEmail,
    resetPassword,
    resendVerification,
    saveProfile,
    saveRoadmapProgress,
    signOutUser,
    deleteAccount,
  }), [
    services.configured,
    user,
    profile,
    authLoading,
    profileLoading,
    authError,
    progressVersion,
    signInWithGoogle,
    requestEmailSignup,
    completeEmailSignup,
    signInWithEmail,
    resetPassword,
    resendVerification,
    saveProfile,
    saveRoadmapProgress,
    signOutUser,
    deleteAccount,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}
