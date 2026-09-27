import { NextResponse } from 'next/server';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import {
  authenticateMilestoneCaller,
  serializeMilestone,
  validateMilestonePayload,
} from '@/utils/server/workforceMilestones';
import {
  getOrSetCache,
  invalidateCacheTag,
  createCachedJsonResponse,
} from '@/utils/server/redisCache';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const caller = await authenticateMilestoneCaller(request);
    if (caller.response) return caller.response;

    const url = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId');

    if (caller.isAdmin && employeeId) {
      const idCheck = validateEmployeeId(employeeId);
      if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');
    }

    const cacheScope = caller.isAdmin ? (employeeId || 'all') : caller.email;
    const cacheKey = `admin:milestones:${cacheScope}`;

    const data = await getOrSetCache(
      cacheKey,
      60,
      async () => {
        const db = getFirebaseAdminFirestore();
        const milestones = db.collection('milestones');
        let query = milestones;

        if (caller.isAdmin) {
          if (employeeId) {
            query = query.where('employee_id', '==', employeeId);
          }
        } else if (caller.isIntern) {
          query = query.where('employee_email', '==', caller.email);
        } else {
          return null;
        }

        const snapshot = await query.get();
        const list = snapshot.docs.map((doc) => serializeMilestone(doc.id, doc.data()));

        list.sort((a, b) => {
          if (a.due_date && b.due_date) {
            const cmp = a.due_date.localeCompare(b.due_date);
            if (cmp !== 0) return cmp;
          }
          return (b.created_at || '').localeCompare(a.created_at || '');
        });

        return {
          success: true,
          milestones: list,
          count: list.length,
        };
      },
      { tags: ['admin:workforce:milestones', 'admin:workforce'], swr: true }
    );

    if (!data) return apiError('Access forbidden.', 403, 'FORBIDDEN');
    return createCachedJsonResponse(request, data);
  } catch (error) {
    console.error('[Milestones GET]', error);
    return apiError('Unable to fetch milestone records.', 500, 'INTERNAL_ERROR');
  }
}

export async function POST(request) {
  try {
    const caller = await authenticateMilestoneCaller(request);
    if (caller.response) return caller.response;

    if (!caller.isAdmin) {
      return apiError('Only administrators can create milestones.', 403, 'FORBIDDEN');
    }

    const limited = await enforceEmployeeRateLimit(request, caller.uid);
    if (limited) return limited;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return apiError('Payload must be valid JSON.', 400, 'BAD_REQUEST');
    }

    const validation = validateMilestonePayload(body, { partial: false, isIntern: false });
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR');

    const db = getFirebaseAdminFirestore();
    const employeeDoc = await db.collection('employees').doc(validation.value.employee_id).get();

    if (!employeeDoc.exists) {
      return apiError('Referenced employee record does not exist.', 404, 'NOT_FOUND');
    }

    const employeeData = employeeDoc.data();
    const employeeEmail = (employeeData.personal_email || '').toLowerCase().trim();

    const now = new Date();
    const milestoneRef = db.collection('milestones').doc();

    const milestoneData = {
      id: milestoneRef.id,
      ...validation.value,
      employee_email: employeeEmail,
      created_at: now,
      updated_at: now,
    };

    await milestoneRef.set(milestoneData);
    await Promise.all([
      invalidateCacheTag('admin:workforce:milestones'),
      invalidateCacheTag('admin:workforce'),
    ]);

    return NextResponse.json(
      {
        success: true,
        id: milestoneRef.id,
        milestone: serializeMilestone(milestoneRef.id, milestoneData),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Milestones POST]', error);
    return apiError('Unable to create milestone.', 500, 'INTERNAL_ERROR');
  }
}
