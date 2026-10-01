import { NextResponse } from 'next/server';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
} from '@/utils/server/workforceEmployees';
import {
  authenticateMilestoneCaller,
  serializeMilestone,
  validateMilestoneId,
  validateMilestonePayload,
} from '@/utils/server/workforceMilestones';
import { invalidateCacheTag } from '@/utils/server/redisCache';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    const caller = await authenticateMilestoneCaller(request);
    if (caller.response) return caller.response;

    const { id } = await params;
    const idCheck = validateMilestoneId(id);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const limited = await enforceEmployeeRateLimit(request, caller.uid);
    if (limited) return limited;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return apiError('Payload must be valid JSON.', 400, 'BAD_REQUEST');
    }

    const validation = validateMilestonePayload(body, {
      partial: true,
      isIntern: caller.isIntern,
    });
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR');

    const db = getFirebaseAdminFirestore();
    const milestoneRef = db.collection('milestones').doc(idCheck.value);
    const merged = await db.runTransaction(async (transaction) => {
      const milestoneDoc = await transaction.get(milestoneRef);
      if (!milestoneDoc.exists) {
        throw Object.assign(new Error('Milestone not found.'), { status: 404, code: 'NOT_FOUND' });
      }
      const currentData = milestoneDoc.data();

      // Keep ownership verification in the same transaction as the write so
      // an intern cannot update a milestone after a concurrent reassignment.
      if (caller.isIntern) {
        const assignedEmail = (currentData.employee_email || '').toLowerCase().trim();
        if (!assignedEmail || assignedEmail !== caller.email) {
          throw Object.assign(new Error('You are not authorized to update this milestone.'), { status: 403, code: 'FORBIDDEN' });
        }
      }

      const updateData = { ...validation.value, updated_at: new Date() };
      if (caller.isAdmin && validation.value.employee_id && validation.value.employee_id !== currentData.employee_id) {
        const empDoc = await transaction.get(db.collection('employees').doc(validation.value.employee_id));
        if (!empDoc.exists) {
          throw Object.assign(new Error('Reassigned employee record does not exist.'), { status: 404, code: 'NOT_FOUND' });
        }
        updateData.employee_email = (empDoc.data().personal_email || '').toLowerCase().trim();
      }
      transaction.update(milestoneRef, updateData);
      return { ...currentData, ...updateData };
    });
    await Promise.all([
      invalidateCacheTag('admin:workforce:milestones'),
      invalidateCacheTag('admin:workforce'),
    ]);

    return NextResponse.json({
      success: true,
      id: idCheck.value,
      milestone: serializeMilestone(idCheck.value, merged),
    });
  } catch (error) {
    if (error?.code === 'NOT_FOUND' || error?.code === 'FORBIDDEN') return apiError(error.message, error.status, error.code);
    console.error('[Milestone PATCH]', error);
    return apiError('Unable to update milestone.', 500, 'INTERNAL_ERROR');
  }
}

export async function DELETE(request, { params }) {
  try {
    const caller = await authenticateMilestoneCaller(request);
    if (caller.response) return caller.response;

    if (!caller.isAdmin) {
      return apiError('Only administrators can delete milestones.', 403, 'FORBIDDEN');
    }

    const { id } = await params;
    const idCheck = validateMilestoneId(id);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const limited = await enforceEmployeeRateLimit(request, caller.uid);
    if (limited) return limited;

    const db = getFirebaseAdminFirestore();
    const milestoneRef = db.collection('milestones').doc(idCheck.value);
    const milestoneDoc = await milestoneRef.get();

    if (!milestoneDoc.exists) {
      return apiError('Milestone not found.', 404, 'NOT_FOUND');
    }

    await milestoneRef.delete();
    await Promise.all([
      invalidateCacheTag('admin:workforce:milestones'),
      invalidateCacheTag('admin:workforce'),
    ]);

    return NextResponse.json({
      success: true,
      id,
      message: 'Milestone deleted successfully.',
    });
  } catch (error) {
    console.error('[Milestone DELETE]', error);
    return apiError('Unable to delete milestone.', 500, 'INTERNAL_ERROR');
  }
}
