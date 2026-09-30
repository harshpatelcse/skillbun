import { NextResponse } from 'next/server'

import { getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin'
import {
  apiError,
  enforceEmployeeRateLimit,
  isStatusTransitionAllowed,
  prepareEmployeeData,
  requireWorkforceAdmin,
  validateEmployeeId,
  validateEmployeePayload,
} from '@/utils/server/workforceEmployees'
import { invalidateCacheTag } from '@/utils/server/redisCache'

export const runtime = 'nodejs'

function toTimestampMilliseconds(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  return Number.NaN
}

function hasConflictingEmployee(data, employeeId) {
  return data.employee_id !== undefined && data.employee_id !== null
    && data.employee_id !== '' && data.employee_id !== employeeId
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const idCheck = validateEmployeeId(id)
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR')

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

    const validation = validateEmployeePayload(body, { partial: true })
    if (!validation.isValid) return apiError(validation.error, 400, 'VALIDATION_ERROR')

    const prepared = prepareEmployeeData(validation.value)
    if (!prepared.isValid) return apiError(prepared.error, 400, 'VALIDATION_ERROR')

    const db = getFirebaseAdminFirestore()
    const employees = db.collection('employees')
    const employeeRef = employees.doc(idCheck.value)
    const now = new Date()

    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(employeeRef)
      if (!current.exists) {
        const error = new Error('NOT_FOUND')
        error.code = 'NOT_FOUND'
        throw error
      }

      const currentData = current.data()
      if (prepared.value.status && !isStatusTransitionAllowed(currentData.status, prepared.value.status)) {
        const error = new Error('INVALID_STATUS_TRANSITION')
        error.code = 'INVALID_STATUS_TRANSITION'
        throw error
      }

      if (prepared.value.personal_email && prepared.value.personal_email !== currentData.personal_email) {
        const duplicate = await transaction.get(
          employees.where('personal_email', '==', prepared.value.personal_email).limit(1)
        )
        if (!duplicate.empty && duplicate.docs.some((doc) => doc.id !== employeeRef.id)) {
          const error = new Error('DUPLICATE_EMAIL')
          error.code = 'DUPLICATE_EMAIL'
          throw error
        }
      }

      const nextJoiningDate = prepared.value.joining_date || currentData.joining_date
      const nextContractEndDate = prepared.value.contract_end_date || currentData.contract_end_date
      if (
        nextJoiningDate &&
        nextContractEndDate &&
        toTimestampMilliseconds(nextContractEndDate) < toTimestampMilliseconds(nextJoiningDate)
      ) {
        const error = new Error('INVALID_CONTRACT_DATES')
        error.code = 'INVALID_CONTRACT_DATES'
        throw error
      }

      transaction.update(employeeRef, { ...prepared.value, updated_at: now })
    })

    await Promise.all([
      invalidateCacheTag('admin:workforce'),
      invalidateCacheTag('admin:analytics'),
    ])

    return NextResponse.json({ success: true, id: employeeRef.id })
  } catch (error) {
    if (error?.code === 'NOT_FOUND') return apiError('Employee record not found.', 404, 'NOT_FOUND')
    if (error?.code === 'DUPLICATE_EMAIL') return apiError('An employee with this personal email already exists.', 409, 'DUPLICATE_EMAIL')
    if (error?.code === 'INVALID_STATUS_TRANSITION') return apiError('This employee status transition is not allowed.', 400, 'VALIDATION_ERROR')
    if (error?.code === 'INVALID_CONTRACT_DATES') return apiError('Contract end date must be on or after joining date.', 400, 'VALIDATION_ERROR')
    console.error('[Workforce Employee PATCH]', error)
    return apiError('Unable to update the employee record.', 500, 'INTERNAL_ERROR')
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params
    const idCheck = validateEmployeeId(id)
    if (!idCheck.isValid) return apiError(idCheck.error, 400, 'VALIDATION_ERROR')

    const admin = await requireWorkforceAdmin(request)
    if (admin.response) return admin.response

    const limited = await enforceEmployeeRateLimit(request, admin.uid)
    if (limited) return limited

    const url = new URL(request.url)
    const hardParam = url.searchParams.get('hard')

    const db = getFirebaseAdminFirestore()
    const employeeRef = db.collection('employees').doc(idCheck.value)
    const employeeSnap = await employeeRef.get()
    if (!employeeSnap.exists) return apiError('Employee record not found.', 404, 'NOT_FOUND')

    const employeeData = employeeSnap.data()
    const employeeEmail = (employeeData.personal_email || '').trim().toLowerCase()

    // Soft delete if explicitly requested with hard=false
    if (hardParam === 'false') {
      const now = new Date()
      await employeeRef.update({ status: 'ARCHIVED', archived_at: now, updated_at: now })
      await Promise.all([
        invalidateCacheTag('admin:workforce'),
        invalidateCacheTag('admin:analytics'),
      ])
      return NextResponse.json({ success: true, id: employeeRef.id, status: 'ARCHIVED' })
    }

    // Cascade deletion of all linked certificates, milestones, workforce_docs, and the employee

    // 1. Certificates linked to this employee
    const [certByEmpSnap, certByEmailSnap] = await Promise.all([
      db.collection('certificates').where('employee_id', '==', employeeRef.id).get(),
      employeeEmail ? db.collection('certificates').where('email', '==', employeeEmail).get() : { docs: [] },
    ])
    const certDocRefs = new Map()
    certByEmpSnap.docs.forEach((d) => certDocRefs.set(d.id, d.ref))
    certByEmailSnap.docs.forEach((d) => {
      const data = d.data()
      if (hasConflictingEmployee(data, employeeRef.id)) {
        certDocRefs.delete(d.id)
        return
      }
      const certType = typeof data.cert_type === 'string' ? data.cert_type.trim().toUpperCase() : ''
      // Email alone cannot establish that an untyped legacy credential belongs
      // to this employment. Preserve academic and unidentified certificates.
      if (['INTERNSHIP', 'TRAINING', 'LOR'].includes(certType) || data.employee_id === employeeRef.id) {
        certDocRefs.set(d.id, d.ref)
      }
    })

    // 2. Milestones linked to this employee
    const milestoneSnap = await db.collection('milestones').where('employee_id', '==', employeeRef.id).get()

    // 3. Workforce docs linked to this employee
    const [docsByEmpSnap, docsByEmailSnap] = await Promise.all([
      db.collection('workforce_docs').where('employee_id', '==', employeeRef.id).get(),
      employeeEmail ? db.collection('workforce_docs').where('dispatched_to', '==', employeeEmail).get() : { docs: [] },
    ])
    const workforceDocRefs = new Map()
    docsByEmpSnap.docs.forEach((d) => workforceDocRefs.set(d.id, d.ref))
    docsByEmailSnap.docs.forEach((d) => {
      if (hasConflictingEmployee(d.data(), employeeRef.id)) {
        workforceDocRefs.delete(d.id)
        return
      }
      workforceDocRefs.set(d.id, d.ref)
    })
    const deleteRefs = [...certDocRefs.values(), ...milestoneSnap.docs.map((doc) => doc.ref), ...workforceDocRefs.values(), employeeRef]
    // Preserve the atomic cascade contract. Splitting this into committed chunks
    // could leave a partially deleted employee if a later chunk fails.
    if (deleteRefs.length > 500) {
      return apiError('This employee has too many linked records for one atomic deletion. No records were deleted; archive the employee and arrange a maintenance deletion.', 409, 'CASCADE_TOO_LARGE')
    }

    const batch = db.batch()
    deleteRefs.forEach((ref) => batch.delete(ref))
    await batch.commit()

    await Promise.all([
      invalidateCacheTag('admin:workforce'),
      invalidateCacheTag('admin:certs'),
      invalidateCacheTag('admin:workforce_docs'),
      invalidateCacheTag('admin:workforce:milestones'),
      invalidateCacheTag('admin:analytics'),
    ])

    return NextResponse.json({
      success: true,
      id: employeeRef.id,
      deleted: true,
      cascadeCount: {
        certificates: certDocRefs.size,
        milestones: milestoneSnap.size,
        workforceDocs: workforceDocRefs.size,
      },
    })
  } catch (error) {
    if (error?.code === 'NOT_FOUND') return apiError('Employee record not found.', 404, 'NOT_FOUND')
    console.error('[Workforce Employee DELETE]', error)
    return apiError('Unable to delete the employee record.', 500, 'INTERNAL_ERROR')
  }
}
