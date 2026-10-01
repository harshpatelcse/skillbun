import { NextResponse } from 'next/server';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { apiError, requireWorkforceAdmin } from '@/utils/server/workforceEmployees';
import { invalidateCacheTag } from '@/utils/server/redisCache';
import { CertificateMutationError, changeCertificateRevocation } from '@/utils/server/certificateIntegrity.mjs';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    const adminCheck = await requireWorkforceAdmin(request);
    if (adminCheck.response) return adminCheck.response;

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return apiError('Credential ID is required.', 400, 'VALIDATION_ERROR');
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return apiError('Payload must be valid JSON.', 400, 'BAD_REQUEST');
    }

    const db = getFirebaseAdminFirestore();
    const updates = await changeCertificateRevocation(db, {
      id,
      body,
      adminEmail: adminCheck.email,
    });

    await Promise.all([
      invalidateCacheTag('admin:workforce:credentials'),
      invalidateCacheTag('admin:certs'),
      invalidateCacheTag('admin:analytics'),
    ]);

    return NextResponse.json({
      success: true,
      id,
      is_revoked: updates.is_revoked,
      message: updates.is_revoked ? 'Credential revoked successfully.' : 'Credential reinstated successfully.',
    });
  } catch (error) {
    if (error instanceof CertificateMutationError) {
      return apiError(error.message, error.status, error.code);
    }
    console.error('[Credential PATCH Error]:', error);
    return apiError('Unable to update credential status.', 500, 'INTERNAL_ERROR');
  }
}
