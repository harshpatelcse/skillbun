import { NextResponse } from 'next/server';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { apiError, requireWorkforceAdmin } from '@/utils/server/workforceEmployees';
import { formatWorkforceDisplayId } from '@/utils/server/workforceId';
import { getOrSetCache, createCachedJsonResponse, invalidateCacheTag } from '@/utils/server/redisCache';

export const runtime = 'nodejs';

const VALID_DOC_TYPES = ['OFFER_PACK', 'EXTENSION_LETTER', 'TERMINATION_NOTICE', 'ACTIVATION_WELCOME'];

function serializeTimestamp(ts) {
  if (!ts) return null;
  if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (ts._seconds) return new Date(ts._seconds * 1000).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === 'string') return ts;
  return null;
}

/**
 * GET /api/admin/workforce/documents
 * Lists all workforce documents with optional filtering by doc_type.
 * Does NOT include pdf_base64 to keep payloads small.
 */
export async function GET(request) {
  try {
    const admin = await requireWorkforceAdmin(request);
    if (admin.response) return admin.response;

    const url = new URL(request.url);
    const docType = url.searchParams.get('doc_type');
    const limitParam = url.searchParams.get('limit');
    const pageToken = url.searchParams.get('pageToken');

    // Validate doc_type filter
    if (docType && !VALID_DOC_TYPES.includes(docType)) {
      return apiError(`Invalid doc_type. Must be one of: ${VALID_DOC_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    // Validate limit
    let limit = 50;
    if (limitParam) {
      limit = parseInt(limitParam, 10);
      if (Number.isNaN(limit) || limit < 1 || limit > 100) {
        return apiError('limit must be an integer between 1 and 100.', 400, 'VALIDATION_ERROR');
      }
    }

    const db = getFirebaseAdminFirestore();
    const cacheKey = `admin:workforce_docs:${docType || 'ALL'}:${pageToken || 'FIRST'}:${limit}`;

    const result = await getOrSetCache(
      cacheKey,
      60,
      async () => {
        let query = db.collection('workforce_docs').orderBy('issued_at', 'desc');

        // Apply doc_type filter
        if (docType) {
          query = query.where('doc_type', '==', docType);
        }

        // Apply cursor-based pagination
        if (pageToken) {
          try {
            const cursorDate = new Date(pageToken);
            if (!Number.isNaN(cursorDate.getTime())) {
              query = query.startAfter(cursorDate);
            }
          } catch {
            // Ignore invalid pageToken, start from beginning
          }
        }

        // Fetch limit + 1 to determine if there are more results
        const snapshot = await query.limit(limit + 1).get();

    const documents = [];
    const docs = snapshot.docs.slice(0, limit);

    for (const doc of docs) {
      const data = doc.data();
      const meta = data.metadata_snapshot || {};

      documents.push({
        id: doc.id,
        display_id: data.display_id || formatWorkforceDisplayId(doc.id),
        doc_type: data.doc_type || 'UNKNOWN',
        title: data.title || 'Workforce Document',
        status: data.status || 'DISPATCHED',
        dispatched_to: data.dispatched_to || meta.personal_email || data.employee_email || '',
        issued_by: data.issued_by || data.dispatched_by || '',
        issued_at: serializeTimestamp(data.issued_at || data.dispatched_at || data.created_at),
        is_revoked: Boolean(data.is_revoked),
        has_pdf: Boolean(data.pdf_base64),
        employee_id: data.employee_id || '',
        metadata_snapshot: {
          full_name: meta.full_name || data.employee_name || '',
          department: meta.department || '',
          designation: meta.designation || '',
          joining_date: meta.joining_date || '',
          contract_end_date: meta.extended_contract_end_date || meta.contract_end_date || '',
          reason_code: meta.reason_code || '',
          reason: meta.reason || '',
          granted_credentials: meta.granted_credentials || [],
          effective_date: meta.effective_date || '',
          personal_email: meta.personal_email || '',
          stipend_amount: meta.stipend_amount || '',
          stipend_currency: meta.stipend_currency || '',
          course_degree: meta.course_degree || '',
          college_name: meta.college_name || '',
        },
      });
    }

        const hasMore = snapshot.docs.length > limit;
        const nextPageToken = hasMore && documents.length > 0
          ? documents[documents.length - 1].issued_at
          : null;

        return {
          success: true,
          documents,
          count: documents.length,
          nextPageToken,
          has_more: hasMore,
        };
      },
      { tags: ['admin:workforce_docs'], swr: true }
    );

    return createCachedJsonResponse(request, result);
  } catch (error) {
    console.error('[Workforce Documents GET Error]', error);
    return apiError(error?.message || 'Unable to retrieve workforce documents.', 500, 'INTERNAL_ERROR');
  }
}

/**
 * PATCH /api/admin/workforce/documents
 * Toggle is_revoked on a workforce document.
 */
export async function PATCH(request) {
  try {
    const admin = await requireWorkforceAdmin(request);
    if (admin.response) return admin.response;

    let body;
    try {
      body = await request.json();
    } catch {
      return apiError('Invalid JSON body.', 400, 'BAD_REQUEST');
    }

    const { docId, is_revoked } = body || {};

    if (!docId || typeof docId !== 'string') {
      return apiError('docId is required and must be a string.', 400, 'VALIDATION_ERROR');
    }
    if (typeof is_revoked !== 'boolean') {
      return apiError('is_revoked must be a boolean.', 400, 'VALIDATION_ERROR');
    }

    const db = getFirebaseAdminFirestore();
    const docRef = db.collection('workforce_docs').doc(docId.trim());
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return apiError(`Document "${docId}" not found.`, 404, 'NOT_FOUND');
    }

    await docRef.update({
      is_revoked,
      revoked_at: is_revoked ? new Date() : null,
      revoked_by: is_revoked ? (admin.email || admin.uid) : null,
    });

    try {
      const { invalidateCacheTag } = await import('@/utils/server/redisCache');
      await invalidateCacheTag('admin:workforce_docs');
    } catch {}

    return NextResponse.json({
      success: true,
      docId,
      is_revoked,
      message: is_revoked ? 'Document has been revoked.' : 'Document has been restored.',
    });
  } catch (error) {
    console.error('[Workforce Documents PATCH Error]', error);
    return apiError(error?.message || 'Unable to update document.', 500, 'INTERNAL_ERROR');
  }
}
