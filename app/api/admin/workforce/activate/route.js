import { assertWorkforceAction, transitionWorkforceEmployee, finishWorkforceAction, WorkforcePolicyError } from '@/utils/server/workforcePolicy.mjs';
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  requireWorkforceAdmin,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import { sendMailWithAttachment } from '@/utils/server/zohoMailer';
import { buildActivationWelcomeEmail } from '@/utils/server/workforceEmailTemplates';
import { decryptCredentials, encryptCredentials } from '@/utils/server/workforceCrypto';
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

    const validation = validateWorkforceAction(body, 'activate');
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR');
    const { employeeId, credentials_data, skipEmail = false } = validation.value;
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
    assertWorkforceAction(employeeData, 'activate');
    let credentialPatch = {};
    const now = new Date();

    // 1. Process and save any provided Zoho credentials
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

    // If credentials were not passed in payload, decrypt existing credentials
    if (!credentials && employeeData.encrypted_credentials) {
      try {
        credentials = decryptCredentials(employeeData.encrypted_credentials);
      } catch (decErr) {
        console.warn('[SkillBun server operation]', { code: decErr?.code || 'INTERNAL_ERROR' });
      }
    }

    await transitionWorkforceEmployee(db, employeeRef, { action: 'activate', nextStatus: 'ACTIVE', expectedStatus: employeeData.status, patch: { ...credentialPatch, activated_at: now } });

    // 2. Dispatch Welcome & Workspace Access Email if not skipped
    let emailSent = false;
    let emailError = null;

    if (!skipEmail && employeeData.personal_email) {
      try {
        const emailPayload = buildActivationWelcomeEmail({
          employee: {
            ...employeeData,
            work_email: credentials?.work_email || employeeData.work_email || '',
          },
          credentials,
        });

        await sendMailWithAttachment({
          to: employeeData.personal_email,
          from: emailPayload.from,
          cc: emailPayload.cc,
          replyTo: emailPayload.replyTo,
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        });

        emailSent = true;

        // Record log in workforce_docs
        await db.collection('workforce_docs').add({
          doc_type: 'ACTIVATION_WELCOME',
          employee_id: employeeId,
          employee_name: employeeData.full_name,
          employee_email: employeeData.personal_email,
          work_email: credentials?.work_email || employeeData.work_email || null,
          has_credentials: Boolean(credentials?.work_email && credentials?.password),
          subject: emailPayload.subject,
          title: 'Welcome & Workspace Access',
          status: 'DISPATCHED',
          issued_at: now,
          dispatched_at: now,
          dispatched_by: admin.email,
          created_at: now,
        });
      } catch (mailErr) {
        console.error('[SkillBun server operation]', { code: mailErr?.code || 'INTERNAL_ERROR' });
        emailError = 'Email delivery failed. Review server configuration before retrying.';
      }
    }

    await finishWorkforceAction(db, employeeRef, 'activate', { delivery_uncertain: Boolean(emailError) });

    await Promise.all([
      invalidateCacheTag('admin:workforce'),
      invalidateCacheTag('admin:workforce_docs'),
    ]);

    return NextResponse.json({
      success: true,
      status: 'ACTIVE',
      emailSent,
      emailError,
      deliveryUncertain: Boolean(emailError),
      message: emailSent
        ? `Employee activated & Welcome / Workspace access email dispatched to ${employeeData.personal_email}!`
        : `Employee activated successfully.${emailError ? ' (Note: Email delivery failed: ' + emailError + ')' : ''}`,
    });
  } catch (err) {
    if (err instanceof WorkforcePolicyError) return apiError(err.message, err.status, err.code);
    console.error('[SkillBun server operation]', { code: err?.code || 'INTERNAL_ERROR' });
    return apiError('Failed to activate employee. Please try again.', 500, 'INTERNAL_ERROR');
  }
}
