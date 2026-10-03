import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  requireWorkforceAdmin,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import { generateOfferLetterPdf } from '@/utils/server/pdf/offerLetterGenerator';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

    const { employeeId } = body;
    if (!employeeId || typeof employeeId !== 'string') {
      return apiError('employeeId is required.', 400, 'VALIDATION_ERROR');
    }

    const idCheck = validateEmployeeId(employeeId);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const db = getFirebaseAdminFirestore();
    const doc = await db.collection('employees').doc(employeeId).get();

    if (!doc.exists) {
      return apiError('Employee record not found.', 404, 'NOT_FOUND');
    }

    const employeeData = doc.data();
    const storedReferenceId = employeeData.offer_reference_id || undefined;

    let storedSnapshot = null;
    let historicalVersion = undefined;
    if (storedReferenceId) {
      try {
        const existingWfDoc = await db.collection('workforce_docs').doc(storedReferenceId).get();
        if (existingWfDoc.exists) {
          const wfData = existingWfDoc.data();
          storedSnapshot = wfData.metadata_snapshot || null;
          historicalVersion = wfData.template_version || undefined;
        }
      } catch (wfErr) {
        console.warn('[PDF Offer] Historical snapshot unavailable.', { code: 'SNAPSHOT_UNAVAILABLE' });
      }
    }

    const { buffer, filename, referenceId, metadataSnapshot } = await generateOfferLetterPdf({
      ...employeeData,
      metadata_snapshot: storedSnapshot || employeeData.metadata_snapshot,
      id: doc.id,
    }, {
      referenceId: storedReferenceId,
      templateVersion: historicalVersion,
    });

    if (!storedReferenceId) {
      await doc.ref.update({ offer_reference_id: referenceId, updated_at: new Date() });
    }

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
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to generate Offer Letter PDF.', 500, 'INTERNAL_ERROR');
  }
}
