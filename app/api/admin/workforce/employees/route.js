import { FieldPath } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'

import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin'
import {
  apiError,
  EMPLOYEE_STATUSES,
  enforceEmployeeRateLimit,
  prepareEmployeeData,
  requireWorkforceAdmin,
  serializeEmployee,
  validateEmployeeId,
  validateEmployeePayload,
} from '@/utils/server/workforceEmployees'
import { generateWorkforceId, WORKFORCE_PREFIXES } from '@/utils/server/workforceId'
import { generateOfferLetterPdf } from '@/utils/server/pdf/offerLetterGenerator'
import { buildOfferDispatchEmail } from '@/utils/server/workforceEmailTemplates'
import { sendMailWithAttachment } from '@/utils/server/zohoMailer'
import { getActiveTemplateVersion, DOCUMENT_CATEGORIES } from '@/utils/common/docTemplateRegistry'
import { getOrSetCache, createCachedJsonResponse, invalidateCacheTag } from '@/utils/server/redisCache'

export const runtime = 'nodejs'

function parsePageSize(value) {
  if (value === null) return { isValid: true, value: 50 }
  if (!/^\d+$/.test(value)) return { isValid: false, error: 'limit must be an integer between 1 and 50.' }
  const parsed = Number(value)
  if (parsed < 1 || parsed > 50) return { isValid: false, error: 'limit must be between 1 and 50.' }
  return { isValid: true, value: parsed }
}

export async function GET(request) {
  try {
    const admin = await requireWorkforceAdmin(request)
    if (admin.response) return admin.response

    const limited = await enforceEmployeeRateLimit(request, admin.uid)
    if (limited) return limited

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const department = url.searchParams.get('department')
    const pageToken = url.searchParams.get('pageToken')
    const pageSize = parsePageSize(url.searchParams.get('limit'))

    if (!pageSize.isValid) return apiError(pageSize.error, 400, 'BAD_REQUEST')
    if (status && !EMPLOYEE_STATUSES.includes(status)) {
      return apiError('status must be a valid employee status.', 400, 'VALIDATION_ERROR')
    }
    if (department) {
      const departmentCheck = validateEmployeePayload({ department }, { partial: true })
      if (!departmentCheck.isValid) return apiError(departmentCheck.error, 400, 'VALIDATION_ERROR')
    }
    if (pageToken) {
      const tokenCheck = validateEmployeeId(pageToken)
      if (!tokenCheck.isValid) return apiError(tokenCheck.error, 400, 'VALIDATION_ERROR')
    }

    const db = getFirebaseAdminFirestore()
    const cacheKey = `admin:workforce:employees:${status || 'ALL'}:${department || 'ALL'}:${pageToken || 'FIRST'}:${pageSize.value}`

    const result = await getOrSetCache(
      cacheKey,
      60,
      async () => {
        const employees = db.collection('employees')
        let query = employees
        if (status) query = query.where('status', '==', status)
        if (department) query = query.where('department', '==', department.trim())
        query = query.orderBy(FieldPath.documentId())

        if (pageToken) {
          const cursor = await employees.doc(pageToken).get()
          if (!cursor.exists) return null
          query = query.startAfter(cursor)
        }

        const snapshot = await query.limit(pageSize.value + 1).get()
        const hasMore = snapshot.docs.length > pageSize.value
        const visibleDocs = hasMore ? snapshot.docs.slice(0, pageSize.value) : snapshot.docs

        return {
          success: true,
          employees: visibleDocs.map((doc) => serializeEmployee(doc.id, doc.data())),
          pagination: {
            limit: pageSize.value,
            has_more: hasMore,
            next_page_token: hasMore ? visibleDocs.at(-1).id : null,
          },
        }
      },
      { tags: ['admin:workforce'], swr: true }
    )

    if (!result) return apiError('pageToken does not reference an employee.', 400, 'VALIDATION_ERROR')

    return createCachedJsonResponse(request, result)
  } catch (error) {
    console.error('[Workforce Employees GET]', error)
    return apiError('Unable to load employee records.', 500, 'INTERNAL_ERROR')
  }
}

export async function POST(request) {
  try {
    const admin = await requireWorkforceAdmin(request)
    if (admin.response) return admin.response

    const limited = await enforceEmployeeRateLimit(request, admin.uid)
    if (limited) return limited

    let body
    try {
      body = await request.json()
    } catch {
      return apiError('Payload must be valid JSON.', 400, 'BAD_REQUEST')
    }

    const validation = validateEmployeePayload(body)
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR')
    if (validation.value.contract_end_date < validation.value.joining_date) {
      return apiError('Contract end date must be on or after joining date.', 400, 'VALIDATION_ERROR')
    }

    const prepared = prepareEmployeeData(validation.value)
    if (!prepared.isValid) return apiError(prepared.error, 400, 'VALIDATION_ERROR')

    const db = getFirebaseAdminFirestore()
    const employees = db.collection('employees')
    const employeeRef = employees.doc()
    const now = new Date()
    const isExistingEmployee = Boolean(prepared.skipOfferEmail)

    await db.runTransaction(async (transaction) => {
      const duplicate = await transaction.get(
        employees.where('personal_email', '==', prepared.value.personal_email).limit(1)
      )
      if (!duplicate.empty) {
        const error = new Error('DUPLICATE_EMAIL')
        error.code = 'DUPLICATE_EMAIL'
        throw error
      }

      transaction.set(employeeRef, {
        id: employeeRef.id,
        ...prepared.value,
        status: isExistingEmployee ? 'ACTIVE' : 'OFFER_SENT',
        created_at: now,
        updated_at: now,
      })
    })

    try {
      const { invalidateCacheTag } = await import('@/utils/server/redisCache')
      await Promise.all([
        invalidateCacheTag('admin:workforce'),
        invalidateCacheTag('admin:workforce_docs'),
      ])
    } catch {}

    // If existing employee checkbox was marked, skip PDF creation & email dispatch
    if (isExistingEmployee) {
      return NextResponse.json({
        success: true,
        id: employeeRef.id,
        skipOfferEmail: true,
        message: 'Candidate added as existing employee (Offer email skipped).',
      }, { status: 201 })
    }

    // Auto-generate formal Offer Letter PDF and dispatch email
    const referenceId = generateWorkforceId(WORKFORCE_PREFIXES.OFFER)
    const activeOfferVersion = getActiveTemplateVersion(DOCUMENT_CATEGORIES.OFFER_LETTER)

    try {
      const { buffer, filename, metadataSnapshot } = await generateOfferLetterPdf(
        {
          ...prepared.value,
          id: employeeRef.id,
        },
        { referenceId, templateVersion: activeOfferVersion }
      )

      const emailPayload = buildOfferDispatchEmail({
        employee: prepared.value,
        referenceId,
        credentials: prepared.credentials,
      })

      // Attempt Email Dispatch via Zoho SMTP
      try {
        await sendMailWithAttachment({
          to: prepared.value.personal_email,
          from: emailPayload.from,
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
        })

        // Record in workforce_docs collection & update employee
        const workforceDocs = db.collection('workforce_docs')
        const docRef = workforceDocs.doc(referenceId)

        const batch = db.batch()
        batch.create(docRef, {
          id: referenceId,
          employee_id: employeeRef.id,
          doc_type: 'OFFER_PACK',
          template_version: activeOfferVersion,
          title: 'Internship Offer Letter & Terms of Engagement',
          status: 'DISPATCHED',
          metadata_snapshot: metadataSnapshot,
          dispatched_to: prepared.value.personal_email,
          issued_by: admin.email || admin.uid,
          issued_at: now,
        })

        batch.update(employeeRef, {
          status: 'OFFER_SENT',
          offer_reference_id: referenceId,
          offer_dispatched_at: now,
          updated_at: now,
        })

        await batch.commit()

        return NextResponse.json({
          success: true,
          id: employeeRef.id,
          offerDispatched: true,
          referenceId,
          filename,
          message: `Candidate added & Offer letter (${referenceId}) dispatched to ${prepared.value.personal_email}!`,
        }, { status: 201 })
      } catch (smtpError) {
        console.error('[Workforce Employee POST - Zoho SMTP Failed]', smtpError)

        try {
          await employeeRef.update({
            status: 'DISPATCH_FAILED',
            offer_reference_id: referenceId,
            last_dispatch_error: smtpError?.message || 'SMTP transmission failure',
            updated_at: now,
          })
        } catch (updateErr) {
          console.error('[Failed to update employee status to DISPATCH_FAILED]', updateErr)
        }

        return NextResponse.json({
          success: true,
          id: employeeRef.id,
          offerDispatched: false,
          fallbackDownload: true,
          referenceId,
          filename,
          pdfBase64: buffer.toString('base64'),
          recipient: prepared.value.personal_email,
          subject: emailPayload.subject,
          error: `Candidate created, but SMTP Dispatch failed: ${smtpError?.message || 'Network error'}. Manual PDF download ready.`,
          message: `Candidate created, but email dispatch failed. Manual PDF download is ready.`,
        }, { status: 201 })
      }
    } catch (pdfGenError) {
      console.error('[Workforce Employee POST - PDF Generation Failed]', pdfGenError)
      return NextResponse.json({
        success: true,
        id: employeeRef.id,
        offerDispatched: false,
        message: 'Candidate created, but offer letter generation encountered an error.',
      }, { status: 201 })
    }
  } catch (error) {
    if (error?.code === 'DUPLICATE_EMAIL') {
      return apiError('An employee with this personal email already exists.', 409, 'DUPLICATE_EMAIL')
    }
    console.error('[Workforce Employees POST]', error)
    return apiError('Unable to create the employee record.', 500, 'INTERNAL_ERROR')
  }
}
