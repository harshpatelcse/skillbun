import { isActiveWorkforceMember } from './workforcePolicy.mjs';
import { PrivateResponse } from './privateResponse.mjs';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from './firebaseAdmin.js';
import { isUserAuthorizedAdmin } from './workforceEmployees.js';
import { validateFirestoreId, validateSchema, validateString } from './inputValidator.js';

export const MILESTONE_PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const MILESTONE_STATUSES = Object.freeze(['TODO', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED']);

export function validateMilestoneId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id.trim())) {
    return { isValid: false, error: 'Invalid milestone ID format.' };
  }
  return { isValid: true, value: id.trim() };
}

function isValidUrlOrPath(val) {
  if (!val) return true;
  if (typeof val !== 'string' || val.length > 500) return false;
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates milestone create and patch payloads.
 * @param {Object} payload
 * @param {Object} [options]
 * @param {boolean} [options.partial=false]
 * @param {boolean} [options.isIntern=false]
 */
export function validateMilestonePayload(payload, { partial = false, isIntern = false } = {}) {
  const writable = {
    status: { type: 'enum', allowedValues: MILESTONE_STATUSES, ...(!partial && { defaultValue: 'TODO' }) },
    deliverable_url: { validator: value => {
      const check = validateString(value, { fieldName: 'deliverable_url', maxLength: 500, allowEmpty: true });
      if (!check.isValid || !isValidUrlOrPath(check.value)) {
        return { isValid: false, error: 'deliverable_url must be a valid HTTP or HTTPS URL (max 500 characters).' };
      }
      return check;
    } },
  };
  const schema = isIntern ? writable : {
    ...writable,
    employee_id: { required: !partial, validator: value => validateFirestoreId(value, { fieldName: 'employee_id' }) },
    title: { type: 'string', required: !partial, minLength: 3, maxLength: 200 },
    description: { type: 'string', maxLength: 500, ...(!partial && { defaultValue: '' }) },
    priority: { type: 'enum', allowedValues: MILESTONE_PRIORITIES, ...(!partial && { defaultValue: 'MEDIUM' }) },
    due_date: { required: !partial, validator: value => {
      const check = validateString(value, { fieldName: 'due_date', minLength: 10, maxLength: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
      if (!check.isValid) return check;
      const date = new Date(`${check.value}T00:00:00.000Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== check.value) {
        return { isValid: false, error: 'due_date must be a valid YYYY-MM-DD calendar date.' };
      }
      return check;
    } },
    review_notes: { type: 'string', maxLength: 500 },
  };
  // Existing forms use null to clear these optional fields.
  const clearable = isIntern ? ['deliverable_url'] : ['deliverable_url', 'description', 'review_notes'];
  const normalized = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : payload;
  for (const field of clearable) {
    if (normalized && Object.hasOwn(normalized, field) && normalized[field] === null) normalized[field] = '';
  }
  const result = validateSchema(normalized, schema, { allowUnknown: false, fieldName: 'Milestone payload' });
  if (!result.isValid) return result;
  if (partial && Object.keys(result.value).length === 0) {
    return { isValid: false, error: 'Milestone update must include at least one field.' };
  }
  return result;
}

/**
 * Serializes milestone firestore document to clean JSON.
 * @param {string} id
 * @param {Object} data
 */
export function serializeMilestone(id, data = {}) {
  const toIso = (val) => {
    if (!val) return null;
    if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    return null;
  };

  return {
    id,
    employee_id: data.employee_id || '',
    employee_email: data.employee_email || '',
    title: data.title || '',
    description: data.description || '',
    priority: data.priority || 'MEDIUM',
    status: data.status || 'TODO',
    due_date: typeof data.due_date === 'string' ? data.due_date.slice(0, 10) : toIso(data.due_date)?.slice(0, 10) || '',
    deliverable_url: data.deliverable_url || '',
    review_notes: data.review_notes || '',
    created_at: toIso(data.created_at),
    updated_at: toIso(data.updated_at),
  };
}

/**
 * Authenticates request for Milestone endpoints.
 * Returns { isAdmin: boolean, isIntern: boolean, email: string, uid: string, response?: Response }
 */
export async function authenticateMilestoneCaller(request) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      response: PrivateResponse.json(
        { error: { message: 'Authentication required. Bearer token missing.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase().trim();
    const isAdmin = await isUserAuthorizedAdmin(decoded);

    let employeeIds = [];
    if (!isAdmin) {
      const db = getFirebaseAdminFirestore();
      const employees = await db.collection('employees').where('personal_email', '==', email).get();
      employeeIds = employees.docs.filter(doc => isActiveWorkforceMember(doc.data(), email)).map(doc => doc.id);
      if (!employeeIds.length) return { response: PrivateResponse.json({ error: { message: 'Active workforce membership is required.', code: 'FORBIDDEN' } }, { status: 403 }) };
    }
    return {
      employeeIds,
      uid: decoded.uid,
      email,
      isAdmin,
      isIntern: !isAdmin && Boolean(email),
    };
  } catch (err) {
    return {
      response: PrivateResponse.json(
        { error: { message: 'Invalid or expired authentication token.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      ),
    };
  }
}
