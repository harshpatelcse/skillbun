import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { getAllowedAppOrigins, getAppOrigin } from '@/utils/server/env';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { deleteStudentAccount } from '@/utils/server/accountDeletion.mjs';
import { createAccountDeletionHandler } from '@/utils/server/accountDeletionHttp.mjs';
import { invalidateCacheTag } from '@/utils/server/redisCache';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const DELETE = createAccountDeletionHandler({
  getAuth: getFirebaseAdminAuth,
  getDb: getFirebaseAdminFirestore,
  isAdmin: async () => false,
  checkRateLimit: checkServerRateLimit,
  allowedOrigins: () => [getAppOrigin(), ...getAllowedAppOrigins()],
  async deleteAccount(input) {
    const result = await deleteStudentAccount(input);
    await Promise.allSettled(['admin:analytics', 'admin:certs'].map(invalidateCacheTag));
    return result;
  },
});
