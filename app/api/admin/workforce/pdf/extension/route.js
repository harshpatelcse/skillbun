import { assertWorkforceAction, transitionWorkforceEmployee, finishWorkforceAction, WorkforcePolicyError } from '@/utils/server/workforcePolicy.mjs';
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  requireWorkforceAdmin,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import { generateExtensionLetterPdf } from '@/utils/server/pdf/extensionLetterGenerator';
import { getActiveTemplateVersion, DOCUMENT_CATEGORIES } from '@/utils/common/docTemplateRegistry';
import { generateWorkforceId, normalizeWorkforceDbId, WORKFORCE_PREFIXES } from '@/utils/server/workforceId';
import { validateWorkforceAction } from '@/utils/server/workforceActionValidation.mjs';

export const runtime = 'nodejs';
export const maxDuration = 30;

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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

    const validation = validateWorkforceAction(body, 'extension');
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR');
    const { employeeId, new_contract_end_date, original_reference_id } = validation.value;
    if (!employeeId || typeof employeeId !== 'string') {
      return apiError('employeeId is required.', 400, 'VALIDATION_ERROR');
    }

    const idCheck = validateEmployeeId(employeeId);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');
    if (!isValidDateOnly(new_contract_end_date)) {
      return apiError('new_contract_end_date must be a valid YYYY-MM-DD date.', 400, 'VALIDATION_ERROR');
    }

    const db = getFirebaseAdminFirestore();
    const doc = await db.collection('employees').doc(employeeId).get();

    if (!doc.exists) {
      return apiError('Employee record not found.', 404, 'NOT_FOUND');
    }

    const employeeData = doc.data();
    assertWorkforceAction(employeeData, 'extension', new_contract_end_date);
    const activeVersion = getActiveTemplateVersion(DOCUMENT_CATEGORIES.EXTENSION_LETTER);
    const now = new Date();

    const { buffer, filename, referenceId, metadataSnapshot } = await generateExtensionLetterPdf(
      {
        ...employeeData,
        // Issuing a new extension must not reuse an employee-held legacy offer
        // snapshot, including its reference, old role, or original issue date.
        metadata_snapshot: undefined,
        issued_at: now.toISOString(),
        id: doc.id,
      },
      {
        referenceId: generateWorkforceId(WORKFORCE_PREFIXES.EXTENSION),
        templateVersion: activeVersion,
        newContractEndDate: new_contract_end_date,
        originalReferenceId: original_reference_id || employeeData.offer_reference_id || employeeData.original_offer_id || employeeData.metadata_snapshot?.original_reference_id,
      }
    );

    // An extension is an issued legal document, not merely a preview download.
    // Keep the immutable render snapshot in the workforce audit trail and align
    // the active contract record with the letter that was issued.
    const documentId = normalizeWorkforceDbId(referenceId);
    await transitionWorkforceEmployee(db, doc.ref, {
      action: 'extension', nextStatus: 'EXTENDED', expectedStatus: employeeData.status, newEndDate: new_contract_end_date,
      patch: { contract_end_date: new Date(`${new_contract_end_date}T00:00:00.000Z`), extension_reference_id: documentId },
      document: { ref: db.collection('workforce_docs').doc(documentId), data: {
        id: documentId, display_id: referenceId, employee_id: doc.id, doc_type: 'EXTENSION_LETTER', template_version: activeVersion,
        title: 'Extension of Internship Tenure', metadata_snapshot: metadataSnapshot, issued_by: admin.email || admin.uid, issued_at: now,
      } },
    });
    await finishWorkforceAction(db, doc.ref, 'extension');

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
    if (error instanceof WorkforcePolicyError) return apiError(error.message, error.status, error.code);
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to generate Extension Letter PDF.', 500, 'INTERNAL_ERROR');
  }
}
