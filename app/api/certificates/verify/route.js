import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { createPublicCertificateHandler } from '@/utils/server/publicCertificate.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export const GET = createPublicCertificateHandler({
  getDb: getFirebaseAdminFirestore,
  checkRateLimit: checkServerRateLimit,
  getAddress: getClientAddress,
});
