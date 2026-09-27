import { NextResponse } from 'next/server';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { apiError, requireWorkforceAdmin } from '@/utils/server/workforceEmployees';
import { invalidateCacheTag } from '@/utils/server/redisCache';

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

    if (body.is_revoked === undefined || typeof body.is_revoked !== 'boolean') {
      return apiError('is_revoked must be a boolean.', 400, 'VALIDATION_ERROR');
    }

    const db = getFirebaseAdminFirestore();
    const certRef = db.collection('certificates').doc(id.trim());
    const certDoc = await certRef.get();

    if (!certDoc.exists) {
      return apiError('Certificate credential not found.', 404, 'NOT_FOUND');
    }

    await certRef.update({
      is_revoked: body.is_revoked,
      revoked_at: body.is_revoked ? new Date() : null,
      revoked_by: body.is_revoked ? adminCheck.email : null,
      updatedAt: new Date(),
    });

    await Promise.all([
      invalidateCacheTag('admin:workforce:credentials'),
      invalidateCacheTag('admin:certs'),
      invalidateCacheTag('admin:analytics'),
    ]);

    return NextResponse.json({
      success: true,
      id,
      is_revoked: body.is_revoked,
      message: body.is_revoked ? 'Credential revoked successfully.' : 'Credential reinstated successfully.',
    });
  } catch (error) {
    console.error('[Credential PATCH Error]:', error);
    return apiError('Unable to update credential status.', 500, 'INTERNAL_ERROR');
  }
}
