import { NextResponse } from 'next/server';
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

    const { employeeId, credentials_data } = body;
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
          await employeeRef.update({
            encrypted_credentials: encrypted,
            work_email: workEmail || employeeData.work_email || null,
            updated_at: new Date(),
          });
        } catch (encErr) {
          console.warn('[Offer Dispatch] Could not persist new credentials:', encErr.message);
        }
      }
    }

    if (!credentials && employeeData.encrypted_credentials) {
      try {
        credentials = decryptCredentials(employeeData.encrypted_credentials);
      } catch (decErr) {
        console.warn('[Offer Dispatch] Could not decrypt credentials for email inclusion:', decErr.message);
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

      // 5. Successful Dispatch -> Record in /workforce_docs and update /employees
      const workforceDocs = db.collection('workforce_docs');
      const docRef = workforceDocs.doc(referenceId);

      const batch = db.batch();

      batch.create(docRef, {
        id: referenceId,
        employee_id: employeeId,
        doc_type: 'OFFER_PACK',
        template_version: activeVersion,
        title: 'Internship Offer Letter & Terms of Engagement',
        status: 'DISPATCHED',
        metadata_snapshot: metadataSnapshot,
        dispatched_to: employeeData.personal_email,
        issued_by: admin.email || admin.uid,
        issued_at: now,
      });

      batch.update(employeeRef, {
        status: 'OFFER_SENT',
        offer_reference_id: referenceId,
        offer_dispatched_at: now,
        updated_at: now,
      });

      await batch.commit();

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
      console.error('[Zoho SMTP Dispatch Failed]', smtpError);

      // Record dispatch failure in employee status for admin visibility
      try {
        await employeeRef.update({
          status: 'DISPATCH_FAILED',
          last_dispatch_error: smtpError?.message || 'SMTP transmission failure',
          updated_at: now,
        });
      } catch (updateErr) {
        console.error('[Failed to update employee status to DISPATCH_FAILED]', updateErr);
      }

      // Return fallback download payload with base64 PDF
      return NextResponse.json(
        {
          success: false,
          fallbackDownload: true,
          referenceId,
          filename,
          pdfBase64: buffer.toString('base64'),
          recipient: employeeData.personal_email,
          subject: emailPayload.subject,
          error: `SMTP Dispatch failed: ${smtpError?.message || 'Unknown network error'}. Manual PDF download ready.`,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('[Workforce Offer Dispatch Error]', error);
    return apiError('Unable to process offer letter dispatch.', 500, 'INTERNAL_ERROR');
  }
}
