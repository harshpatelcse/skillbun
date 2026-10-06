import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { apiError, requireWorkforceAdmin } from '@/utils/server/workforceEmployees';
import { validateSchema, validatePlainObject } from '@/utils/server/inputValidator';
import { generateOfferLetterPdf } from '@/utils/server/pdf/offerLetterGenerator';
import { generateExtensionLetterPdf } from '@/utils/server/pdf/extensionLetterGenerator';

export const runtime = 'nodejs';
export const maxDuration = 30;

const previewText = maxLength => ({ type: 'string', maxLength, allowEmpty: true });
const employeeSchema = {
  salutation: { type: 'enum', allowedValues: ['Mr.', 'Ms.'] },
  full_name: previewText(100), parent_name: previewText(100),
  personal_email: previewText(254), current_address: previewText(300), permanent_address: previewText(300),
  course_degree: previewText(100), college_name: previewText(150),
  department: previewText(100), designation: previewText(100),
  // The studio intentionally accepts both ISO dates and readable date labels.
  joining_date: previewText(80), contract_end_date: previewText(80),
  stipend_amount: { validator: value => ({ isValid: typeof value === 'number' && Number.isFinite(value) && value >= 0, value, error: 'Stipend must be a non-negative number.' }) },
  stipend_currency: { type: 'enum', allowedValues: ['INR'] },
};

export async function POST(request) {
  try {
    const admin = await requireWorkforceAdmin(request);
    if (admin.response) return admin.response;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return apiError('Payload must be valid JSON.', 400, 'BAD_REQUEST');
    }

    const objectCheck = validatePlainObject(body, { fieldName: 'PDF preview payload', maxKeys: 4 });
    if (!objectCheck.isValid) return apiError(objectCheck.error, 400, 'VALIDATION_ERROR');
    if (Object.hasOwn(body, 'employee') && !validatePlainObject(body.employee).isValid) {
      return apiError('Employee must be a JSON object.', 400, 'VALIDATION_ERROR');
    }
    const checked = validateSchema(body, {
      docType: { type: 'enum', allowedValues: ['OFFER_PACK', 'EXTENSION_LETTER'], defaultValue: 'OFFER_PACK' },
      employee: { defaultValue: {}, validator: value => validateSchema(value, employeeSchema, { fieldName: 'Preview employee', allowUnknown: false }) },
      referenceId: { type: 'string', maxLength: 128, pattern: /^[A-Za-z0-9_/-]*$/, allowEmpty: true },
      newContractEndDate: previewText(80),
    }, { fieldName: 'PDF preview payload', allowUnknown: false, maxKeys: 4 });
    if (!checked.isValid) return apiError(checked.error, 400, 'VALIDATION_ERROR');

    const { docType, employee, referenceId, newContractEndDate } = checked.value;

    const mockEmployee = {
      salutation: employee.salutation || 'Mr.',
      full_name: employee.full_name || 'Alex Sharma',
      parent_name: employee.parent_name || 'R. K. Sharma',
      current_address: employee.current_address || '42 Tech Park Avenue, Bengaluru, Karnataka, 560001',
      permanent_address: employee.permanent_address || employee.current_address || '42 Tech Park Avenue, Bengaluru, Karnataka, 560001',
      course_degree: employee.course_degree || 'B.Tech in Computer Science',
      college_name: employee.college_name || 'National Institute of Technology',
      department: employee.department || 'Core Platform Engineering',
      designation: employee.designation || 'Software Engineering Intern',
      joining_date: employee.joining_date || new Date().toISOString().slice(0, 10),
      contract_end_date: employee.contract_end_date || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      stipend_amount: typeof employee.stipend_amount === 'number' ? employee.stipend_amount : 10000,
      stipend_currency: employee.stipend_currency || 'INR',
    };

    let result;

    if (docType === 'EXTENSION_LETTER') {
      result = await generateExtensionLetterPdf(mockEmployee, {
        referenceId: referenceId || 'SKB/2026/HR-EXT/8K29DF',
        newContractEndDate: newContractEndDate || mockEmployee.contract_end_date,
      });
    } else {
      // Default to 4-page Offer Letter
      result = await generateOfferLetterPdf(mockEmployee, {
        referenceId: referenceId || 'SKB/2026/HR-OFF/8K29DF',
      });
    }

    return NextResponse.json({
      success: true,
      referenceId: result.referenceId,
      filename: result.filename,
      pdfBase64: result.buffer.toString('base64'),
    });
  } catch (error) {
    console.error('[SkillBun server operation]', { code: error?.code || 'INTERNAL_ERROR' });
    return apiError('Failed to generate PDF preview.', 500, 'INTERNAL_ERROR');
  }
}
