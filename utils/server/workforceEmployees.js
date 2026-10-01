import { NextResponse } from 'next/server'

import { isAuthorizedAdminEmail } from '@/utils/server/env'
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin'
import { validateFirestoreId, validateSchema, validateString } from '@/utils/server/inputValidator'
import { checkServerRateLimit } from '@/utils/server/rateLimitStore'
import { getClientAddress } from '@/utils/server/requestUtils'
import { encryptCredentials } from '@/utils/server/workforceCrypto'
import { validateWorkforceCredentials } from './workforceActionValidation.mjs'

export const EMPLOYEE_STATUSES = Object.freeze([
  'OFFER_SENT',
  'ACTIVE',
  'EXTENDED',
  'COMPLETED',
  'TERMINATED',
  'DISPATCH_FAILED',
  'ARCHIVED',
])

const STATUS_TRANSITIONS = Object.freeze({
  OFFER_SENT: new Set(['ACTIVE', 'TERMINATED', 'ARCHIVED']),
  ACTIVE: new Set(['EXTENDED', 'COMPLETED', 'TERMINATED', 'ARCHIVED']),
  EXTENDED: new Set(['COMPLETED', 'TERMINATED', 'ARCHIVED']),
  COMPLETED: new Set(['ARCHIVED']),
  TERMINATED: new Set(['ARCHIVED']),
  DISPATCH_FAILED: new Set(['OFFER_SENT', 'TERMINATED', 'ARCHIVED']),
  ARCHIVED: new Set(),
})

const EMPLOYEE_RATE_LIMITS = [
  { name: 'adminMinute', windowMs: 60 * 1000, maxRequests: 240, getSubject: ({ uid }) => `user:${uid}` },
  { name: 'ipHour', windowMs: 60 * 60 * 1000, maxRequests: 2000, getSubject: ({ address }) => `ip:${address}` },
]

function validateDate(value, fieldName) {
  const stringCheck = validateString(value, {
    fieldName,
    minLength: 10,
    maxLength: 10,
    pattern: /^\d{4}-\d{2}-\d{2}$/,
  })

  if (!stringCheck.isValid) return stringCheck

  const date = new Date(`${stringCheck.value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== stringCheck.value) {
    return { isValid: false, error: `${fieldName} must be a valid YYYY-MM-DD date.`, value: null }
  }

  return { isValid: true, error: null, value: date }
}

function validateStipend(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { isValid: false, error: 'Stipend amount must be a non-negative number.', value: null }
  }

  return { isValid: true, error: null, value }
}

const EMPLOYEE_FIELDS = Object.freeze({
  salutation: { type: 'enum', allowedValues: ['Mr.', 'Ms.'], label: 'Salutation' },
  full_name: { type: 'string', minLength: 2, maxLength: 100, label: 'Full name' },
  parent_name: { type: 'string', minLength: 2, maxLength: 100, label: 'Parent name' },
  personal_email: { type: 'email', label: 'Personal email' },
  phone: { type: 'string', minLength: 7, maxLength: 15, pattern: /^[+\d\s-]{7,15}$/, label: 'Phone' },
  course_degree: { type: 'string', minLength: 1, maxLength: 100, label: 'Course or degree' },
  college_name: { type: 'string', minLength: 1, maxLength: 150, label: 'College name' },
  current_address: { type: 'string', minLength: 1, maxLength: 300, label: 'Current address' },
  permanent_address: { type: 'string', minLength: 1, maxLength: 300, label: 'Permanent address' },
  employment_type: { type: 'enum', allowedValues: ['INTERN', 'FULL_TIME', 'CONTRACTOR'], label: 'Employment type' },
  department: { type: 'string', minLength: 1, maxLength: 100, label: 'Department' },
  designation: { type: 'string', minLength: 1, maxLength: 100, label: 'Designation' },
  joining_date: { validator: (value) => validateDate(value, 'Joining date') },
  contract_end_date: { validator: (value) => validateDate(value, 'Contract end date') },
  stipend_amount: { validator: validateStipend },
  stipend_currency: { type: 'enum', allowedValues: ['INR'], defaultValue: 'INR', label: 'Stipend currency' },
  work_email: { type: 'email', label: 'Work email' },
  credentials_data: { validator: validateWorkforceCredentials },
  skip_offer_email: { type: 'boolean', defaultValue: false, label: 'Skip offer email' },
})

function withRequiredFields(schema) {
  return Object.fromEntries(
    Object.entries(schema).map(([key, rule]) => [key, {
      ...rule,
      required: !['work_email', 'credentials_data', 'stipend_currency', 'skip_offer_email'].includes(key),
    }])
  )
}

export function apiError(message, status, code, options = {}) {
  const headers = options.retryAfterMs
    ? { 'Retry-After': String(Math.max(1, Math.ceil(options.retryAfterMs / 1000))) }
    : undefined

  return NextResponse.json({
    success: false,
    error: {
      code,
      message,
      ...(options.retryAfterMs ? { retryAfterMs: options.retryAfterMs } : {}),
    },
  }, { status, headers })
}

export async function isUserAuthorizedAdmin(decodedToken) {
  if (!decodedToken) return false
  if (decodedToken.admin === true) return true
  const email = (decodedToken.email || '').trim().toLowerCase()
  if (!email) return false

  // 1. Founder Master Admin: harsh@skillbun.tech
  if (email === 'harsh@skillbun.tech') {
    return true
  }

  // Email-based privileges require proof of mailbox ownership.
  if (decodedToken.email_verified !== true) return false

  // 2. Custom Claim
  if (decodedToken.admin === true) return true

  // 3. Environment Variable list
  if (isAuthorizedAdminEmail(email)) return true

  // 4. Dynamic Database-Driven Admin Lookup from Firestore /admins/{email}
  try {
    const db = getFirebaseAdminFirestore()
    if (db) {
      const adminDoc = await db.collection('admins').doc(email).get()
      if (adminDoc.exists && adminDoc.data()?.active !== false) {
        return true
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return false
}

export async function requireWorkforceAdmin(request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return { response: apiError('Authentication is required for workforce administration.', 401, 'UNAUTHORIZED') }
  }

  let adminAuth
  try {
    adminAuth = getFirebaseAdminAuth()
  } catch {
    return { response: apiError('Server authentication is not configured.', 500, 'INTERNAL_ERROR') }
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token)
    const email = (decodedToken.email || '').trim().toLowerCase()
    const isAdmin = await isUserAuthorizedAdmin(decodedToken)
    if (!isAdmin) {
      return { response: apiError('Admin privileges are required.', 403, 'FORBIDDEN') }
    }

    return { uid: decodedToken.uid, email }
  } catch {
    return { response: apiError('Invalid or expired authentication token.', 401, 'UNAUTHORIZED') }
  }
}

export async function enforceEmployeeRateLimit(request, uid) {
  if (process.env.NODE_ENV === 'development') {
    return null;
  }

  const rateLimit = await checkServerRateLimit({
    namespace: 'workforceEmployees',
    subject: { uid, address: getClientAddress(request) },
    limits: EMPLOYEE_RATE_LIMITS,
    increment: true,
  })

  if (!rateLimit.allowed) {
    return apiError('Too many workforce employee requests. Please try again shortly.', 429, 'RATE_LIMIT_EXCEEDED', {
      retryAfterMs: rateLimit.retryAfterMs,
    })
  }

  return null
}

export function validateEmployeeId(id) {
  return validateFirestoreId(id, { fieldName: 'Employee ID', minLength: 1, maxLength: 128 })
}

export function validateEmployeePayload(payload, { partial = false } = {}) {
  const schema = partial
    ? { ...EMPLOYEE_FIELDS, status: { type: 'enum', allowedValues: EMPLOYEE_STATUSES, label: 'Status' } }
    : withRequiredFields(EMPLOYEE_FIELDS)
  const result = validateSchema(payload, schema, {
    fieldName: 'Employee payload',
    allowUnknown: false,
    maxKeys: partial ? 20 : 19,
  })

  if (!result.isValid || !partial) return result
  if (Object.keys(result.value).length === 0) {
    return { isValid: false, error: 'Employee update payload must include at least one field.', value: null }
  }

  return result
}

export function prepareEmployeeData(validated) {
  const employee = { ...validated }
  const credentials = employee.credentials_data
  delete employee.credentials_data

  const skipOfferEmail = Boolean(employee.skip_offer_email)
  delete employee.skip_offer_email

  if (!credentials) return { isValid: true, value: employee, credentials: null, skipOfferEmail }

  if (employee.work_email && employee.work_email !== credentials.work_email) {
    return { isValid: false, error: 'Work email must match credentials_data.work_email.' }
  }

  employee.work_email = employee.work_email || credentials.work_email
  employee.encrypted_credentials = encryptCredentials({
    ...credentials,
    work_email: employee.work_email,
  })

  return { isValid: true, value: employee, credentials, skipOfferEmail }
}

export function isStatusTransitionAllowed(currentStatus, nextStatus) {
  return currentStatus === nextStatus || STATUS_TRANSITIONS[currentStatus]?.has(nextStatus) === true
}

function serializeTimestamp(value) {
  if (value instanceof Date) return value.toISOString()
  if (value?.toDate) return value.toDate().toISOString()
  return value || null
}

export function serializeEmployee(id, data) {
  const employee = { ...data, id }
  delete employee.credentials_data
  employee.encrypted_credentials = data.encrypted_credentials ? '[ENCRYPTED]' : null
  employee.has_credentials = Boolean(data.encrypted_credentials)

  for (const field of ['joining_date', 'contract_end_date', 'created_at', 'updated_at', 'archived_at', 'offer_dispatched_at', 'activated_at']) {
    if (field in employee) employee[field] = serializeTimestamp(employee[field])
  }

  return employee
}
