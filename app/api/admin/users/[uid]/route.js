import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { getAllowedAppOrigins, getAppOrigin } from '@/utils/server/env';
import { isUserAuthorizedAdmin } from '@/utils/server/workforceEmployees';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { deleteStudentAccount } from '@/utils/server/accountDeletion.mjs';
import { createAccountDeletionHandler } from '@/utils/server/accountDeletionHttp.mjs';
import { invalidateCacheTag } from '@/utils/server/redisCache';

export const runtime = 'nodejs';
export const maxDuration = 30;

const handleDelete = createAccountDeletionHandler({
  getAuth: getFirebaseAdminAuth,
  getDb: getFirebaseAdminFirestore,
  isAdmin: isUserAuthorizedAdmin,
  checkRateLimit: checkServerRateLimit,
  allowedOrigins: () => [getAppOrigin(), ...getAllowedAppOrigins()],
  async deleteAccount(input) {
    const result = await deleteStudentAccount(input);
    await Promise.allSettled(['admin:analytics', 'admin:certs'].map(invalidateCacheTag));
    return result;
  },
});

export async function DELETE(request, { params }) {
  const { uid } = await params;
  return handleDelete(request, { uid });
}
