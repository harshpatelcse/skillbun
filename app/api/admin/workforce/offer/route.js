import { assertWorkforceAction, transitionWorkforceEmployee, finishWorkforceAction, WorkforcePolicyError } from '@/utils/server/workforcePolicy.mjs';
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  requireWorkforceAdmin,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import { generateOfferLetterPdf } from '@/utils/server/pdf/offerLetterGenerator';
import { generateWorkforceId, WORKFORCE_PREFIXES } from '@/utils/server/workforceId';
import { sendMailWithAttachment } from '@/utils/server/zohoMailer';
import { buildOfferDispatchEmail } from '@/utils/server/workforceEmailTemplates';
import { decryptCredentials, encryptCredentials } from '@/utils/server/workforceCrypto';
import { getActiveTemplateVersion, DOCUMENT_CATEGORIES } from '@/utils/common/docTemplateRegistry';
import { invalidateCacheTag } from '@/utils/server/redisCache';
import { validateWorkforceAction } from '@/utils/server/workforceActionValidation.mjs';

export const runtime = 'nodejs';

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

    const validation = validateWorkforceAction(body, 'offer');
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR');
    const { employeeId, credentials_data } = validation.value;
    if (!employeeId || typeof employeeId !== 'string') {
      return apiError('employeeId is required.', 400, 'VALIDATION_ERROR');
    }

    const idCheck = validateEmployeeId(employeeId);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const db = getFirebaseAdminFirestore();
    const employeeRef = db.collection('employees').doc(employeeId);
    const employeeDoc = await employeeRef.get();

    if (!employeeDoc.exists) {
      return apiError('Employee record not found.', 404, 'NOT_FOUND');
    }

    const employeeData = employeeDoc.data();
    assertWorkforceAction(employeeData, 'offer');
    let credentialPatch = {};

    // 1. Generate unique reference ID & active template version
    const referenceId = generateWorkforceId(WORKFORCE_PREFIXES.OFFER);
    const activeVersion = getActiveTemplateVersion(DOCUMENT_CATEGORIES.OFFER_LETTER);

    // 2. Generate 4-page Offer Letter PDF in-memory buffer
    const { buffer, filename, metadataSnapshot } = await generateOfferLetterPdf(
      {
        ...employeeData,
        id: employeeDoc.id,
      },
      { referenceId, templateVersion: activeVersion }
    );

    // 3. Save or decrypt credentials
    let credentials = null;
    if (credentials_data && typeof credentials_data === 'object') {
      const workEmail = (credentials_data.work_email || '').trim();
      const password = credentials_data.password || '';
      const accessNotes = (credentials_data.access_notes || '').trim();
      if (workEmail || password) {
        credentials = {
          work_email: workEmail,
          password: password,
          access_notes: accessNotes,
        };
        try {
          const encrypted = encryptCredentials(credentials);
          credentialPatch = { encrypted_credentials: encrypted, work_email: workEmail || employeeData.work_email || null };
        } catch (encErr) {
          console.warn('[SkillBun server operation]', { code: encErr?.code || 'INTERNAL_ERROR' });
          return apiError('Workspace credentials could not be saved. Please try again after checking the server encryption configuration.', 503, 'INTERNAL_ERROR');
        }
      }
    }

    if (!credentials && employeeData.encrypted_credentials) {
      try {
        credentials = decryptCredentials(employeeData.encrypted_credentials);
      } catch (decErr) {
        console.warn('[SkillBun server operation]', { code: decErr?.code || 'INTERNAL_ERROR' });
      }
    }

    // 4. Build email payload
    const emailPayload = buildOfferDispatchEmail({
      employee: {
        ...employeeData,
        work_email: credentials?.work_email || employeeData.work_email || '',
      },
      referenceId,
      credentials,
    });

    const now = new Date();

    const docRef = db.collection('workforce_docs').doc(referenceId);
    await transitionWorkforceEmployee(db, employeeRef, {
      action: 'offer', nextStatus: 'OFFER_SENT', expectedStatus: employeeData.status,
      patch: { ...credentialPatch, offer_reference_id: referenceId },
      document: { ref: docRef, data: { id: referenceId, employee_id: employeeId, doc_type: 'OFFER_PACK', template_version: activeVersion, title: 'Internship Offer Letter & Terms of Engagement', status: 'ISSUED', metadata_snapshot: metadataSnapshot, issued_by: admin.email || admin.uid, issued_at: now } },
    });

    // 4. Attempt Email Dispatch via Zoho SMTP
    try {
      await sendMailWithAttachment({
        to: employeeData.personal_email,
        cc: emailPayload.cc,
        replyTo: emailPayload.replyTo,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text,
        attachments: [
          {
            filename,
            content: buffer,
            contentType: 'application/pdf',
          },
        ],
      });

      await docRef.update({ status: 'DISPATCHED', dispatched_to: employeeData.personal_email, dispatched_at: now });
      await finishWorkforceAction(db, employeeRef, 'offer', { offer_dispatched_at: now });

      await Promise.all([
        invalidateCacheTag('admin:workforce'),
        invalidateCacheTag('admin:workforce_docs'),
      ]);

      return NextResponse.json({
        success: true,
        referenceId,
        filename,
        message: `Offer Letter (${referenceId}) dispatched successfully to ${employeeData.personal_email}.`,
      });
    } catch (smtpError) {
      console.error('[SkillBun server operation]', { code: smtpError?.code || 'INTERNAL_ERROR' });

      await docRef.update({ status: 'DELIVERY_UNKNOWN' });
      await finishWorkforceAction(db, employeeRef, 'offer', { status: 'DISPATCH_FAILED', delivery_uncertain: true, last_dispatch_error: 'SMTP delivery could not be confirmed.' });
      await invalidateCacheTag('admin:workforce');

      // Return fallback download payload with base64 PDF
      return NextResponse.json(
        {
          success: false,
          fallbackDownload: true,
          deliveryUncertain: true,
          referenceId,
          filename,
          pdfBase64: buffer.toString('base64'),
          recipient: employeeData.personal_email,
          subject: emailPayload.subject,
          error: 'SMTP delivery could not be confirmed. Review the dispatch before retrying. Manual PDF download ready.',
        },
        { status: 200 }
      );
    }
  } catch (error) {
    if (error instanceof WorkforcePolicyError) return apiError(error.message, error.status, error.code);
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to process offer letter dispatch.', 500, 'INTERNAL_ERROR');
  }
}
