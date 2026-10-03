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
import { generateWorkforceId, WORKFORCE_PREFIXES } from '@/utils/server/workforceId';
import { sendMailWithAttachment } from '@/utils/server/zohoMailer';
import { buildExtensionDispatchEmail } from '@/utils/server/workforceEmailTemplates';
import { getActiveTemplateVersion, DOCUMENT_CATEGORIES } from '@/utils/common/docTemplateRegistry';
import { invalidateCacheTag } from '@/utils/server/redisCache';
import { validateWorkforceAction } from '@/utils/server/workforceActionValidation.mjs';

export const runtime = 'nodejs';

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

    const db = getFirebaseAdminFirestore();
    const employeeRef = db.collection('employees').doc(employeeId);
    const employeeDoc = await employeeRef.get();

    if (!employeeDoc.exists) {
      return apiError('Employee record not found.', 404, 'NOT_FOUND');
    }

    const employeeData = employeeDoc.data();

    // Determine target contract end date
    let targetEndDate = new_contract_end_date;
    if (!targetEndDate) {
      if (employeeData.contract_end_date) {
        const d = employeeData.contract_end_date.toDate
          ? employeeData.contract_end_date.toDate()
          : new Date(employeeData.contract_end_date);
        targetEndDate = d.toISOString().slice(0, 10);
      } else {
        return apiError('new_contract_end_date is required.', 400, 'VALIDATION_ERROR');
      }
    }

    if (!isValidDateOnly(targetEndDate)) {
      return apiError('new_contract_end_date must be a valid YYYY-MM-DD date.', 400, 'VALIDATION_ERROR');
    }

    assertWorkforceAction(employeeData, 'extension', targetEndDate);

    // 1. Generate unique reference ID & active template version
    const referenceId = generateWorkforceId(WORKFORCE_PREFIXES.EXTENSION);
    const activeVersion = getActiveTemplateVersion(DOCUMENT_CATEGORIES.EXTENSION_LETTER);

    // 2. Generate formal Extension Letter PDF
    const { buffer, filename, metadataSnapshot } = await generateExtensionLetterPdf(
      {
        ...employeeData,
        id: employeeDoc.id,
      },
      {
        referenceId,
        templateVersion: activeVersion,
        newContractEndDate: targetEndDate,
        originalReferenceId: original_reference_id || employeeData.offer_reference_id,
      }
    );

    // 3. Build email payload
    const emailPayload = buildExtensionDispatchEmail({
      employee: employeeData,
      referenceId,
      newContractEndDate: targetEndDate,
    });

    const now = new Date();

    const docRef = db.collection('workforce_docs').doc(referenceId);
    await transitionWorkforceEmployee(db, employeeRef, {
      action: 'extension', nextStatus: 'EXTENDED', expectedStatus: employeeData.status, newEndDate: targetEndDate,
      patch: { contract_end_date: new Date(`${targetEndDate}T00:00:00.000Z`), extension_reference_id: referenceId },
      document: { ref: docRef, data: { id: referenceId, employee_id: employeeId, doc_type: 'EXTENSION_LETTER', template_version: activeVersion, title: 'Extension of Internship Tenure', status: 'ISSUED', metadata_snapshot: metadataSnapshot, issued_by: admin.email || admin.uid, issued_at: now } },
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
      await finishWorkforceAction(db, employeeRef, 'extension', { extension_dispatched_at: now });

      await Promise.all([
        invalidateCacheTag('admin:workforce'),
        invalidateCacheTag('admin:workforce_docs'),
      ]);

      return NextResponse.json({
        success: true,
        referenceId,
        filename,
        pdfBase64: buffer.toString('base64'),
        message: `Extension Letter (${referenceId}) dispatched successfully to ${employeeData.personal_email}.`,
      });
    } catch (smtpError) {
      console.error('[SkillBun server operation]', { code: smtpError?.code || 'INTERNAL_ERROR' });

      await docRef.update({ status: 'DELIVERY_UNKNOWN' });
      await finishWorkforceAction(db, employeeRef, 'extension', { delivery_uncertain: true });

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
    return apiError('Unable to process extension letter dispatch.', 500, 'INTERNAL_ERROR');
  }
}
