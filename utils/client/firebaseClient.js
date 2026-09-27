'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore';

function readFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
  };
}

let cachedDb = null;

function getOrInitFirestore(app) {
  if (cachedDb) return cachedDb;
  if (typeof window === 'undefined') {
    return getFirestore(app);
  }

  try {
    // Attempt persistent multi-tab IndexedDB cache for instant reads & offline sync
    cachedDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    try {
      cachedDb = getFirestore(app);
    } catch {
      try {
        cachedDb = initializeFirestore(app, {
          localCache: memoryLocalCache(),
        });
      } catch {
        cachedDb = getFirestore(app);
      }
    }
  }

  return cachedDb;
}

export function isFirebaseConfigured() {
  const config = readFirebaseConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

export function getFirebaseServices() {
  if (!isFirebaseConfigured()) {
    return {
      configured: false,
      app: null,
      auth: null,
      db: null,
      googleProvider: null,
    };
  }

  const app = getApps().length ? getApp() : initializeApp(readFirebaseConfig());
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });

  return {
    configured: true,
    app,
    auth: getAuth(app),
    db: getOrInitFirestore(app),
    googleProvider,
  };
}
