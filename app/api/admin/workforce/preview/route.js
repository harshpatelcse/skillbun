import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import {
  apiError,
  enforceEmployeeRateLimit,
  requireWorkforceAdmin,
  validateEmployeeId,
} from '@/utils/server/workforceEmployees';
import {
  buildOfferDispatchEmail,
  buildExtensionDispatchEmail,
  buildTerminationDispatchEmail,
  buildActivationWelcomeEmail,
} from '@/utils/server/workforceEmailTemplates';
import { decryptCredentials } from '@/utils/server/workforceCrypto';

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

    const { employeeId, type, new_contract_end_date, reason, employeeOverride } = body;

    let employeeData = employeeOverride || null;

    if (!employeeData) {
      if (!employeeId || typeof employeeId !== 'string') {
        return apiError('employeeId or employeeOverride is required.', 400, 'VALIDATION_ERROR');
      }

      const idCheck = validateEmployeeId(employeeId);
      if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR');

      const db = getFirebaseAdminFirestore();
      const employeeDoc = await db.collection('employees').doc(employeeId).get();

      if (!employeeDoc.exists) {
        return apiError('Employee record not found.', 404, 'NOT_FOUND');
      }

      employeeData = { ...employeeDoc.data(), id: employeeDoc.id };
    }

    let payload = null;

    switch (type) {
      case 'OFFER_EMAIL': {
        const referenceId = employeeData.offer_reference_id || 'SKB/2026/HR-OFF/PREVIEW';
        let credentials = employeeData.credentials_data || null;
        if (!credentials && employeeData.encrypted_credentials) {
          try {
            credentials = decryptCredentials(employeeData.encrypted_credentials);
          } catch {}
        }
        payload = buildOfferDispatchEmail({ employee: employeeData, referenceId, credentials });
        break;
      }
      case 'ACTIVATION_EMAIL': {
        let credentials = employeeData.credentials_data || null;
        if (!credentials && employeeData.encrypted_credentials) {
          try {
            credentials = decryptCredentials(employeeData.encrypted_credentials);
          } catch {}
        }
        payload = buildActivationWelcomeEmail({ employee: employeeData, credentials });
        break;
      }
      case 'EXTENSION_EMAIL': {
        const referenceId = employeeData.extension_reference_id || 'SKB/2026/HR-EXT/PREVIEW';
        payload = buildExtensionDispatchEmail({
          employee: employeeData,
          referenceId,
          newContractEndDate: new_contract_end_date,
        });
        break;
      }
      case 'TERMINATION_EMAIL': {
        const { reasonCode = 'COMPLETED', grantedCredentials = [] } = body;
        payload = buildTerminationDispatchEmail({
          employee: employeeData,
          reasonCode,
          reason,
          grantedCredentials,
          effectiveDate: new Date().toISOString().slice(0, 10),
        });
        break;
      }
      default:
        return apiError('Invalid preview type. Must be OFFER_EMAIL, ACTIVATION_EMAIL, EXTENSION_EMAIL, or TERMINATION_EMAIL.', 400, 'VALIDATION_ERROR');
    }

    return NextResponse.json({
      success: true,
      type,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      recipient: employeeData.personal_email || 'candidate@example.com',
      cc: payload.cc || 'harsh@skillbun.tech',
      replyTo: payload.replyTo || 'harsh@skillbun.tech',
    });
  } catch (error) {
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Unable to generate email preview.', 500, 'INTERNAL_ERROR');
  }
}
