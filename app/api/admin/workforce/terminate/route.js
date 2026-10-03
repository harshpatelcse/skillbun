import { isWorkforceTransitionAllowed, assertWorkforceCertificate, WorkforcePolicyError } from '@/utils/server/workforcePolicy.mjs';
import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore, getFirebaseAdminAuth } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  requireWorkforceAdmin,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import { generateWorkforceId, formatWorkforceDisplayId, WORKFORCE_PREFIXES } from '@/utils/server/workforceId';
import { sendMailWithAttachment } from '@/utils/server/zohoMailer';
import { buildTerminationDispatchEmail } from '@/utils/server/workforceEmailTemplates';
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

    const validation = validateWorkforceAction(body, 'terminate');
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR');
    const {
      employeeId,
      reasonCode = 'COMPLETED',
      reason = '',
      grantInternshipCert = false,
      grantTrainingCert = false,
      grantLor = false,
      revokeAccess = true,
      sendEmail = true,
    } = validation.value;

    if (!employeeId || typeof employeeId !== 'string') {
      return apiError('employeeId is required.', 400, 'VALIDATION_ERROR');
    }

    const idCheck = validateEmployeeId(employeeId);
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

    const db = getFirebaseAdminFirestore();
    const adminAuth = getFirebaseAdminAuth();

    const employeeRef = db.collection('employees').doc(employeeId);
    const employeeDoc = await employeeRef.get();

    if (!employeeDoc.exists) {
      return apiError('Employee record not found.', 404, 'NOT_FOUND');
    }

    const employeeData = employeeDoc.data();
    if (employeeData.terminated_at || ['TERMINATED', 'ARCHIVED'].includes(employeeData.status)) throw new WorkforcePolicyError('This employee has already been offboarded. Review the existing record before taking another action.');
    if (grantInternshipCert) assertWorkforceCertificate(employeeData, 'INTERNSHIP');
    if (grantTrainingCert) assertWorkforceCertificate(employeeData, 'TRAINING');
    if (grantLor) assertWorkforceCertificate(employeeData, 'LOR');
    let recipientUid = null;
    if (grantInternshipCert || grantTrainingCert || grantLor) {
      try {
        const recipient = await adminAuth.getUserByEmail(employeeData.personal_email.trim().toLowerCase());
        if (recipient.emailVerified && !recipient.disabled) recipientUid = recipient.uid;
      } catch (lookupError) { if (lookupError?.code !== 'auth/user-not-found') throw lookupError; }
    }
    const now = new Date();
    const referenceId = generateWorkforceId(WORKFORCE_PREFIXES.TERMINATION);

    const grantedCredentials = [];

    // Helper date format
    const toIsoDate = (val) => {
      if (!val) return '';
      if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString().slice(0, 10);
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return String(val).slice(0, 10);
    };

    const startDate = toIsoDate(employeeData.joining_date);
    const endDate = toIsoDate(employeeData.contract_end_date) || now.toISOString().slice(0, 10);

    // 1. Grant requested verified credentials
    const credentialWrites = [];
    const certBatch = { set: (ref, data) => credentialWrites.push({ ref, data: { ...data, issued_by_uid: admin.uid, ...(recipientUid ? { uid: recipientUid } : {}) } }) };

    if (grantInternshipCert) {
      const certId = generateWorkforceId(WORKFORCE_PREFIXES.INTERNSHIP);
      const displayId = formatWorkforceDisplayId(certId);
      const certRef = db.collection('certificates').doc(certId);
      certBatch.set(certRef, {
        id: certId,
        display_id: displayId,
        cert_type: 'INTERNSHIP',
        template_version: getActiveTemplateVersion(DOCUMENT_CATEGORIES.INTERNSHIP_CERT),
        employee_id: employeeId,
        name: employeeData.full_name,
        email: (employeeData.personal_email || '').trim().toLowerCase(),
        department: employeeData.department,
        designation: employeeData.designation,
        stream_or_track: `${employeeData.designation} (${employeeData.department})`,
        start_date: startDate,
        end_date: endDate,
        issued_by: admin.email || admin.uid || 'SkillBun Admin',
        is_revoked: false,
        createdAt: now,
      });
      grantedCredentials.push(`Certificate of Internship Completion (${displayId})`);
    }

    if (grantTrainingCert) {
      const certId = generateWorkforceId(WORKFORCE_PREFIXES.TRAINING);
      const displayId = formatWorkforceDisplayId(certId);
      const certRef = db.collection('certificates').doc(certId);
      certBatch.set(certRef, {
        id: certId,
        display_id: displayId,
        cert_type: 'TRAINING',
        template_version: getActiveTemplateVersion(DOCUMENT_CATEGORIES.TRAINING_CERT),
        employee_id: employeeId,
        name: employeeData.full_name,
        email: (employeeData.personal_email || '').trim().toLowerCase(),
        department: employeeData.department,
        designation: employeeData.designation,
        stream_or_track: `Advanced Industry Training: ${employeeData.department}`,
        start_date: startDate,
        end_date: endDate,
        issued_by: admin.email || admin.uid || 'SkillBun Admin',
        is_revoked: false,
        createdAt: now,
      });
      grantedCredentials.push(`Practical Training Completion Certificate (${displayId})`);
    }

    if (grantLor) {
      const certId = generateWorkforceId(WORKFORCE_PREFIXES.LOR);
      const displayId = formatWorkforceDisplayId(certId);
      const certRef = db.collection('certificates').doc(certId);
      certBatch.set(certRef, {
        id: certId,
        display_id: displayId,
        cert_type: 'LOR',
        template_version: getActiveTemplateVersion(DOCUMENT_CATEGORIES.LOR),
        employee_id: employeeId,
        name: employeeData.full_name,
        email: (employeeData.personal_email || '').trim().toLowerCase(),
        department: employeeData.department,
        designation: employeeData.designation,
        stream_or_track: `Letter of Recommendation - ${employeeData.full_name}`,
        recommendation_text: `During their tenure at SkillBun as ${employeeData.designation}, ${employeeData.full_name} demonstrated exceptional dedication, technical agility, and collaborative problem-solving skills.`,
        start_date: startDate,
        end_date: endDate,
        issued_by: 'Harsh Patel',
        is_revoked: false,
        createdAt: now,
      });
      grantedCredentials.push(`Official Letter of Recommendation (${displayId})`);
    }

    await db.runTransaction(async tx => {
      const snapshot = await tx.get(employeeRef);
      if (!snapshot.exists) throw new WorkforcePolicyError('Employee record not found.', 404);
      const current = snapshot.data();
      // Completed employees keep their completion status, so the persisted
      // offboarding marker must also guard retries and concurrent requests.
      if (current.terminated_at || ['TERMINATED', 'ARCHIVED'].includes(current.status)) throw new WorkforcePolicyError('This employee has already been offboarded. Review the existing record before taking another action.');
      if (current.status !== employeeData.status || current.personal_email !== employeeData.personal_email || current.full_name !== employeeData.full_name) throw new WorkforcePolicyError('Employee record changed. Refresh before offboarding.');
      const nextStatus = current.status === 'COMPLETED' ? 'COMPLETED' : 'TERMINATED';
      if (!isWorkforceTransitionAllowed(current.status, nextStatus)) throw new WorkforcePolicyError('This status cannot be offboarded.');
      for (const credential of credentialWrites) {
        assertWorkforceCertificate(current, credential.data.cert_type);
        tx.create(credential.ref, credential.data);
      }
      tx.update(employeeRef, {
        status: nextStatus, terminated_at: now, terminated_by: admin.email || admin.uid,
        termination_reason_code: reasonCode, termination_reason: reason || '',
        granted_credentials: grantedCredentials, portal_access_revoked: Boolean(revokeAccess),
        portal_access_revoked_at: revokeAccess ? now : null, updated_at: now,
      });
    });

    // 3. Revoke Firebase Auth session tokens & user portal flags (if requested)
    let authRevoked = false;
    if (revokeAccess && employeeData.personal_email) {
      try {
        const userRecord = await adminAuth.getUserByEmail(employeeData.personal_email.trim().toLowerCase());
        if (userRecord?.uid) {
          await adminAuth.revokeRefreshTokens(userRecord.uid);
          const userDocRef = db.collection('users').doc(userRecord.uid);
          await userDocRef.update(
            {
              workforce_access: false,
              portal_access_revoked: true,
              portal_access_revoked_at: now,
              updated_at: now,
            }
          );
          authRevoked = true;
        }
      } catch (authErr) {
        console.log('[SkillBun server operation]', { code: authErr?.code || 'INTERNAL_ERROR' });
      }
    }

    // 4. Send Formal Offboarding & Documents Email Notice (if enabled)
    let emailDispatched = false;
    let emailError = null;

    if (sendEmail && employeeData.personal_email) {
      try {
        const emailPayload = buildTerminationDispatchEmail({
          employee: employeeData,
          reasonCode,
          reason,
          grantedCredentials,
          effectiveDate: now.toISOString().slice(0, 10),
        });

        await sendMailWithAttachment({
          to: employeeData.personal_email,
          cc: emailPayload.cc,
          replyTo: emailPayload.replyTo,
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        });

        emailDispatched = true;

        // Record in workforce_docs
        const termVersion = getActiveTemplateVersion(DOCUMENT_CATEGORIES.TERMINATION_NOTICE);
        await db.collection('workforce_docs').doc(referenceId).set({
          id: referenceId,
          employee_id: employeeId,
          doc_type: 'TERMINATION_NOTICE',
          template_version: termVersion,
          title: reasonCode === 'COMPLETED' ? 'Internship Completion & Offboarding Record' : 'Notice of Engagement Conclusion',
          status: 'DISPATCHED',
          metadata_snapshot: {
            template_version: termVersion,
            reference_id: referenceId,
            full_name: employeeData.full_name,
            personal_email: employeeData.personal_email,
            department: employeeData.department,
            designation: employeeData.designation,
            reason_code: reasonCode,
            reason: reason || '',
            granted_credentials: grantedCredentials,
            effective_date: now.toISOString().slice(0, 10),
          },
          dispatched_to: employeeData.personal_email,
          issued_by: admin.email || admin.uid || 'admin',
          issued_at: now,
        });
      } catch (smtpErr) {
        console.error('[SkillBun server operation]', { code: smtpErr?.code || 'INTERNAL_ERROR' });
        emailError = 'Email delivery could not be confirmed. Review the existing offboarding record and mail delivery before retrying.';
      }
    }

    await Promise.all([
      invalidateCacheTag('admin:workforce'),
      invalidateCacheTag('admin:workforce_docs'),
      invalidateCacheTag('admin:certs'),
      invalidateCacheTag('admin:analytics'),
    ]);

    return NextResponse.json({
      success: true,
      referenceId,
      employeeId,
      grantedCredentials,
      authRevoked,
      emailDispatched,
      emailError,
      message: `Offboarding processed successfully. ${grantedCredentials.length} credentials granted. ${emailDispatched ? 'Confirmation email dispatched to candidate.' : ''}`,
    });
  } catch (error) {
    if (error instanceof WorkforcePolicyError) return apiError(error.message, error.status, error.code);
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to process offboarding and access update.', 500, 'INTERNAL_ERROR');
  }
}
