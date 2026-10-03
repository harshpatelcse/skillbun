import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { apiError, requireWorkforceAdmin } from '@/utils/server/workforceEmployees';
import { formatWorkforceDisplayId } from '@/utils/server/workforceId';
import { validateWorkforceDocumentId } from '@/utils/server/workforceDocumentPagination.mjs';

export const runtime = 'nodejs';

function serializeTimestamp(ts) {
  if (!ts) return null;
  if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (ts._seconds) return new Date(ts._seconds * 1000).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === 'string') return ts;
  return null;
}

/**
 * GET /api/admin/workforce/documents/[id]
 * Fetch a single workforce document by its Firestore document ID,
 * including the full pdf_base64 payload if available.
 */
export async function GET(request, { params }) {
  try {
    const admin = await requireWorkforceAdmin(request);
    if (admin.response) return admin.response;

    const { id } = await params;
    const idCheck = validateWorkforceDocumentId(id);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const db = getFirebaseAdminFirestore();
    const docRef = db.collection('workforce_docs').doc(idCheck.value);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      // Try uppercase variant
      const altRef = db.collection('workforce_docs').doc(idCheck.value.toUpperCase());
      const altSnap = await altRef.get();
      if (!altSnap.exists) {
        return apiError(`Document "${id}" not found.`, 404, 'NOT_FOUND');
      }
      return buildResponse(altSnap);
    }

    return buildResponse(docSnap);
  } catch (error) {
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to retrieve document.', 500, 'INTERNAL_ERROR');
  }
}

function buildResponse(docSnap) {
  const data = docSnap.data();
  const meta = data.metadata_snapshot || {};

  return NextResponse.json({
    success: true,
    document: {
      id: docSnap.id,
      display_id: data.display_id || formatWorkforceDisplayId(docSnap.id),
      doc_type: data.doc_type || 'UNKNOWN',
      title: data.title || 'Workforce Document',
      status: data.status || 'DISPATCHED',
      dispatched_to: data.dispatched_to || meta.personal_email || data.employee_email || '',
      issued_by: data.issued_by || data.dispatched_by || '',
      issued_at: serializeTimestamp(data.issued_at || data.dispatched_at || data.created_at),
      is_revoked: Boolean(data.is_revoked),
      has_pdf: Boolean(data.pdf_base64),
      pdf_base64: data.pdf_base64 || null,
      employee_id: data.employee_id || '',
      metadata_snapshot: meta,
      // Activation-specific fields
      employee_name: data.employee_name || meta.full_name || '',
      employee_email: data.employee_email || '',
      work_email: data.work_email || '',
      has_credentials: data.has_credentials || false,
      subject: data.subject || '',
      revoked_at: serializeTimestamp(data.revoked_at),
      revoked_by: data.revoked_by || null,
    },
  });
}
