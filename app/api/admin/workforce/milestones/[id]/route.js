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
    const milestoneRef = db.collection('milestones').doc(id);
    const milestoneDoc = await milestoneRef.get();

    if (!milestoneDoc.exists) {
      return apiError('Milestone not found.', 404, 'NOT_FOUND');
    }

    const currentData = milestoneDoc.data();

    // If caller is intern, ensure they own the milestone
    if (caller.isIntern) {
      const assignedEmail = (currentData.employee_email || '').toLowerCase().trim();
      if (!assignedEmail || assignedEmail !== caller.email) {
        return apiError('You are not authorized to update this milestone.', 403, 'FORBIDDEN');
      }
    }

    const updateData = {
      ...validation.value,
      updated_at: new Date(),
    };

    // If admin is reassigning employee_id, update denormalized employee_email
    if (caller.isAdmin && validation.value.employee_id && validation.value.employee_id !== currentData.employee_id) {
      const empDoc = await db.collection('employees').doc(validation.value.employee_id).get();
      if (!empDoc.exists) {
        return apiError('Reassigned employee record does not exist.', 404, 'NOT_FOUND');
      }
      updateData.employee_email = (empDoc.data().personal_email || '').toLowerCase().trim();
    }

    await milestoneRef.update(updateData);
    await Promise.all([
      invalidateCacheTag('admin:workforce:milestones'),
      invalidateCacheTag('admin:workforce'),
    ]);

    const merged = { ...currentData, ...updateData };
    return NextResponse.json({
      success: true,
      id,
      milestone: serializeMilestone(id, merged),
    });
  } catch (error) {
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
    const milestoneRef = db.collection('milestones').doc(id);
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
