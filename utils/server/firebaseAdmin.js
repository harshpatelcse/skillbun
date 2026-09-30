import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { assertAccountActive } from './accountLifecycle.mjs'
// getAuth loaded dynamically on-demand

import {
  getFirebaseAdminClientEmail,
  getFirebaseAdminPrivateKey,
  getFirebaseAdminProjectId,
} from '@/utils/server/env'

const ADMIN_APP_NAME = 'skillbun-admin'

function getAdminApp() {
  try {
    const existingApp = getApps().find((app) => app.name === ADMIN_APP_NAME)
    if (existingApp) {
      return existingApp
    }

    const projectId = getFirebaseAdminProjectId()
    const clientEmail = getFirebaseAdminClientEmail()
    const privateKey = getFirebaseAdminPrivateKey()

    if (!projectId || !clientEmail || !privateKey) {
      return null
    }

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    }, ADMIN_APP_NAME)
  } catch (err) {
    console.error('[Firebase Admin App Init Error]:', err?.message || err)
    return null
  }
}

/**
 * Returns Firebase Admin Auth instance with full capabilities:
 * verifyIdToken, createUser, updateUser, deleteUser, revokeRefreshTokens, getUser, listUsers.
 * Token verification requires verified email and checks disabled users and revoked sessions.
 */
export function getFirebaseAdminAuth() {
  return {
    async verifyIdToken(token, { allowDeleting = false } = {}) {
      if (!token || typeof token !== 'string') {
        throw new Error('Decoding Firebase ID token failed. Invalid token.')
      }

      const app = getAdminApp()
      if (!app) throw new Error('Firebase Admin service credentials required for token verification.')
      const { getAuth } = await import('firebase-admin/auth')
      let decodedToken
      try {
        decodedToken = await getAuth(app).verifyIdToken(token, true)
      } catch (error) {
        // A lost response can occur after Auth removal but before the erasure
        // marker is finalized. Only that missing account may resume cleanup.
        if (!allowDeleting || error?.code !== 'auth/user-not-found') throw error
        decodedToken = await getAuth(app).verifyIdToken(token, false)
        const marker = await getFirestore(app).collection('accountDeletions').doc(decodedToken.uid).get()
        const state = marker.data() || {}
        if (!marker.exists || (state.phase !== 'auth' && state.status !== 'complete')) throw error
        const stillMissing = await getAuth(app).getUser(decodedToken.uid).then(
          () => false,
          lookupError => {
            if (lookupError?.code === 'auth/user-not-found') return true
            throw lookupError
          },
        )
        if (!stillMissing) throw error
      }
      if (decodedToken.email_verified !== true) {
        const error = new Error('Verify your email before accessing your SkillBun account.')
        error.code = 'auth/email-not-verified'
        throw error
      }
      if (!allowDeleting) await assertAccountActive(getFirestore(app), decodedToken.uid)
      return decodedToken
    },

    async createUser(properties) {
      const app = getAdminApp()
      if (!app) throw new Error('Firebase Admin service credentials required for createUser.')
      const { getAuth } = await import('firebase-admin/auth')
      return getAuth(app).createUser(properties)
    },

    async updateUser(uid, properties) {
      const app = getAdminApp()
      if (!app) throw new Error('Firebase Admin service credentials required for updateUser.')
      const { getAuth } = await import('firebase-admin/auth')
      return getAuth(app).updateUser(uid, properties)
    },

    async listUsers(maxResults, pageToken) {
      const app = getAdminApp()
      if (!app) throw new Error('Firebase Admin service credentials required for listUsers.')
      const { getAuth } = await import('firebase-admin/auth')
      return getAuth(app).listUsers(maxResults, pageToken)
    },

    async deleteUser(uid) {
      const app = getAdminApp()
      if (app) {
        try {
          const { getAuth } = await import('firebase-admin/auth')
          return await getAuth(app).deleteUser(uid)
        } catch (err) {
          console.warn('[Firebase Admin Auth deleteUser error]:', err?.message || err)
          throw err
        }
      }
      throw new Error('Firebase Admin service credentials required for deleteUser.')
    },

    async revokeRefreshTokens(uid) {
      const app = getAdminApp()
      if (app) {
        try {
          const { getAuth } = await import('firebase-admin/auth')
          return await getAuth(app).revokeRefreshTokens(uid)
        } catch (err) {
          console.warn('[Firebase Admin Auth revokeRefreshTokens error]:', err?.message || err)
          throw err
        }
      }
      throw new Error('Firebase Admin service credentials required for revokeRefreshTokens.')
    },

    async getUserByEmail(email) {
      const app = getAdminApp()
      if (app) {
        try {
          const { getAuth } = await import('firebase-admin/auth')
          return await getAuth(app).getUserByEmail(email)
        } catch (err) {
          console.warn('[Firebase Admin Auth getUserByEmail error]:', err?.message || err)
          throw err
        }
      }
      throw new Error('Firebase Admin service credentials required for getUserByEmail.')
    },

    async generatePasswordResetLink(email, actionCodeSettings) {
      const app = getAdminApp()
      if (app) {
        try {
          const { getAuth } = await import('firebase-admin/auth')
          return await getAuth(app).generatePasswordResetLink(email, actionCodeSettings)
        } catch (err) {
          console.warn('[Firebase Admin Auth generatePasswordResetLink error]:', err?.message || err)
          throw err
        }
      }
      throw new Error('Firebase Admin service credentials required for generatePasswordResetLink.')
    },

    async getUser(uid) {
      const app = getAdminApp()
      if (app) {
        try {
          const { getAuth } = await import('firebase-admin/auth')
          return await getAuth(app).getUser(uid)
        } catch (err) {
          console.warn('[Firebase Admin Auth getUser error]:', err?.message || err)
          throw err
        }
      }
      throw new Error('Firebase Admin service credentials required for getUser.')
    },
  }
}

export function getFirebaseAdminFirestore() {
  try {
    const app = getAdminApp()
    if (!app) return null

    const db = getFirestore(app)
    try {
      db.settings({ preferRest: true })
    } catch {
      // Ignore if already configured
    }

    return db
  } catch (err) {
    console.warn('[Firebase Admin Firestore Init Warning]:', err.message)
    return null
  }
}

