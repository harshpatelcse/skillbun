import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { apiError, requireWorkforceAdmin } from '@/utils/server/workforceEmployees';
import { generateOfferLetterPdf } from '@/utils/server/pdf/offerLetterGenerator';
import { generateExtensionLetterPdf } from '@/utils/server/pdf/extensionLetterGenerator';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

    const { docType = 'OFFER_PACK', employee = {}, referenceId, newContractEndDate } = body;

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
