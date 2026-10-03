import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { apiError, requireWorkforceAdmin, validateEmployeeId } from '@/utils/server/workforceEmployees';
import { getOrSetCache, createCachedJsonResponse } from '@/utils/server/redisCache';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const adminCheck = await requireWorkforceAdmin(request);
    if (adminCheck.response) return adminCheck.response;

    const url = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId');

    if (!employeeId) {
      return apiError('employeeId query parameter is required.', 400, 'VALIDATION_ERROR');
    }

    const idCheck = validateEmployeeId(employeeId);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const cacheKey = `admin:workforce:credentials:${employeeId.trim()}`;
    const result = await getOrSetCache(
      cacheKey,
      60,
      async () => {
        const db = getFirebaseAdminFirestore();
        const snapshot = await db.collection('certificates')
          .where('employee_id', '==', employeeId.trim())
          .get();

        const credentials = snapshot.docs.map((doc) => {
          const data = doc.data();
          const toIso = (val) => {
            if (!val) return null;
            if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
            if (val instanceof Date) return val.toISOString();
            if (typeof val === 'string') return val;
            return null;
          };

          return {
            id: doc.id,
            cert_type: data.cert_type || 'ROADMAP',
            employee_id: data.employee_id || '',
            name: data.name || '',
            email: data.email || '',
            department: data.department || '',
            designation: data.designation || '',
            stream_or_track: data.stream_or_track || data.roadmapTitle || '',
            start_date: data.start_date || '',
            end_date: data.end_date || '',
            recommendation_text: data.recommendation_text || '',
            issued_by: data.issued_by || '',
            is_revoked: Boolean(data.is_revoked),
            created_at: toIso(data.createdAt),
          };
        });

        credentials.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        return {
          success: true,
          credentials,
          count: credentials.length,
        };
      },
      { tags: ['admin:workforce:credentials', 'admin:certs'], swr: true }
    );

    return createCachedJsonResponse(request, result);
  } catch (error) {
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to fetch workforce credentials.', 500, 'INTERNAL_ERROR');
  }
}
