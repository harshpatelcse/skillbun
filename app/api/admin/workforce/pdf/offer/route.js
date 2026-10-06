import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  requireWorkforceAdmin,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import { generateDocumentPdf } from '@/utils/server/pdf/documentPdfService';
import { formatWorkforceDisplayId, isValidWorkforceId, normalizeWorkforceDbId } from '@/utils/server/workforceId';
import { validateSchema, validatePlainObject } from '@/utils/server/inputValidator';
import { DOCUMENT_CATEGORIES, getActiveTemplateVersion, UnsupportedTemplateVersionError } from '@/utils/common/docTemplateRegistry';
import { invalidateCacheTag } from '@/utils/server/redisCache';

export const runtime = 'nodejs';
export const maxDuration = 30;

class OfferPdfError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

function savedReferenceKey(value) {
  const key = isValidWorkforceId(value) ? normalizeWorkforceDbId(value) : value;
  return validateEmployeeId(key).isValid ? key : null;
}

function sameReference(left, right) {
  if (isValidWorkforceId(left) && isValidWorkforceId(right)) {
    return formatWorkforceDisplayId(left) === formatWorkforceDisplayId(right);
  }
  return savedReferenceKey(left) !== null && savedReferenceKey(left) === savedReferenceKey(right);
}

function snapshotUnavailable() {
  return new OfferPdfError('The saved offer snapshot is unavailable. Please ask an administrator to review the original issued record.', 503, 'SNAPSHOT_UNAVAILABLE');
}

export async function POST(request) {
  try {
    const admin = await requireWorkforceAdmin(request);
    if (admin.response) return admin.response;

    const limited = await enforceEmployeeRateLimit(request, admin.uid);
    if (limited) return limited;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return apiError('Payload must be valid JSON.', 400, 'BAD_REQUEST');
    }

    const validation = validateSchema(body, {
      employeeId: { required: true, validator: validateEmployeeId },
    }, { fieldName: 'Offer PDF payload', allowUnknown: false, maxKeys: 1 });
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR');
    const { employeeId } = validation.value;
    if (!employeeId || typeof employeeId !== 'string') {
      return apiError('employeeId is required.', 400, 'VALIDATION_ERROR');
    }

    const idCheck = validateEmployeeId(employeeId);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const db = getFirebaseAdminFirestore();
    const employeeRef = db.collection('employees').doc(employeeId);
    // Rendering is local and side-effect free. A transaction retry either issues
    // one snapshot or reuses the offer committed by the concurrent request.
    const result = await db.runTransaction(async transaction => {
      const doc = await transaction.get(employeeRef);
      if (!doc.exists) throw new OfferPdfError('Employee record not found.', 404, 'NOT_FOUND');
      const employeeData = doc.data();
      const storedReferenceId = employeeData.offer_reference_id || employeeData.metadata_snapshot?.reference_id;

      if (storedReferenceId) {
        const documentId = savedReferenceKey(storedReferenceId);
        if (!documentId) throw snapshotUnavailable();
        let saved;
        try {
          saved = await transaction.get(db.collection('workforce_docs').doc(documentId));
        } catch {
          throw snapshotUnavailable();
        }
        const historical = saved.exists ? saved.data() : {};
        if (historical.employee_id && historical.employee_id !== doc.id) throw snapshotUnavailable();
        // Some legacy records stored the snapshot on the employee itself. Only
        // accept that fallback when it explicitly belongs to this reference.
        const legacy = employeeData.metadata_snapshot;
        const snapshot = historical.metadata_snapshot ||
          (legacy && sameReference(legacy.reference_id, documentId) ? legacy : null);
        const issuedAt = snapshot?.issued_at || historical.issued_at;
        if (!validatePlainObject(snapshot).isValid || !snapshot.full_name || !issuedAt ||
          (snapshot.reference_id && !sameReference(snapshot.reference_id, documentId))) {
          throw snapshotUnavailable();
        }
        return generateDocumentPdf(DOCUMENT_CATEGORIES.OFFER_LETTER, {
          ...snapshot, metadata_snapshot: snapshot, id: doc.id, issued_at: issuedAt,
        }, {
          referenceId: storedReferenceId,
          templateVersion: historical.template_version || snapshot.template_version,
        });
      }

      const now = new Date();
      const version = getActiveTemplateVersion(DOCUMENT_CATEGORIES.OFFER_LETTER);
      const generated = await generateDocumentPdf(DOCUMENT_CATEGORIES.OFFER_LETTER, {
        ...employeeData, metadata_snapshot: undefined, id: doc.id, issued_at: now,
      }, { templateVersion: version });
      const documentId = normalizeWorkforceDbId(generated.referenceId);
      transaction.create(db.collection('workforce_docs').doc(documentId), {
        id: documentId, display_id: generated.referenceId, employee_id: doc.id,
        doc_type: 'OFFER_PACK', template_version: version, status: 'ISSUED',
        title: 'Internship Offer Letter & Terms of Engagement',
        metadata_snapshot: generated.metadataSnapshot, issued_by: admin.email || admin.uid, issued_at: now,
      });
      transaction.update(employeeRef, { offer_reference_id: documentId, updated_at: now });
      return { ...generated, created: true };
    });

    if (result.created) {
      await Promise.all([invalidateCacheTag('admin:workforce'), invalidateCacheTag('admin:workforce_docs')]);
    }
    const { buffer, filename, referenceId, metadataSnapshot } = result;

    const url = new URL(request.url);
    const format = url.searchParams.get('format');

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        referenceId,
        filename,
        pdfBase64: buffer.toString('base64'),
        metadataSnapshot,
      });
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-SkillBun-Reference-Id': referenceId,
        'Cache-Control': 'private, no-store, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof OfferPdfError) return apiError(error.message, error.status, error.code);
    if (error instanceof UnsupportedTemplateVersionError) return apiError('The saved offer uses an unsupported document template.', 422, error.code);
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to generate Offer Letter PDF.', 500, 'INTERNAL_ERROR');
  }
}
