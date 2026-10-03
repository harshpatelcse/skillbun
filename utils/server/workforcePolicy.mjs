export class WorkforcePolicyError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; this.code = 'WORKFORCE_POLICY'; }
}

const TRANSITIONS = {
  OFFER_SENT: ['ACTIVE', 'DISPATCH_FAILED', 'TERMINATED', 'ARCHIVED'],
  ACTIVE: ['EXTENDED', 'COMPLETED', 'TERMINATED', 'ARCHIVED'],
  EXTENDED: ['COMPLETED', 'TERMINATED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'], TERMINATED: ['ARCHIVED'],
  DISPATCH_FAILED: ['OFFER_SENT', 'TERMINATED', 'ARCHIVED'], ARCHIVED: [],
};

export function isWorkforceTransitionAllowed(current, next) {
  return current === next || TRANSITIONS[current]?.includes(next) === true;
}
export function isActiveWorkforceMember(employee, email) {
  return ['ACTIVE', 'EXTENDED'].includes(employee?.status) && employee.portal_access_revoked !== true &&
    String(employee.personal_email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase();
}
function dateOnly(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}
export function assertWorkforceAction(employee, action, newEndDate) {
  const allowed = { activate: ['OFFER_SENT'], offer: ['OFFER_SENT', 'DISPATCH_FAILED'], extension: ['ACTIVE', 'EXTENDED'] };
  if (!allowed[action]?.includes(employee?.status)) throw new WorkforcePolicyError('The employee status does not permit this action.');
  if (action === 'extension') {
    const current = dateOnly(employee.contract_end_date);
    const joining = dateOnly(employee.joining_date);
    if (!newEndDate || newEndDate <= current || newEndDate <= joining) throw new WorkforcePolicyError('An extension must end after the current contract and joining date.');
  }
}
export function assertWorkforceCertificate(employee, type) {
  const states = type === 'TRAINING' ? ['ACTIVE', 'EXTENDED', 'COMPLETED'] : ['COMPLETED'];
  if (!states.includes(employee?.status)) throw new WorkforcePolicyError('The employee is not eligible for this credential.');
}

// All state checks run against the record read in the write transaction. SMTP
// stays outside the callback so Firestore retries never duplicate dispatch.
export async function transitionWorkforceEmployee(db, ref, { action, nextStatus, patch = {}, document = null, newEndDate, expectedStatus }) {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new WorkforcePolicyError('Employee record not found.', 404);
    const current = snapshot.data();
    assertWorkforceAction(current, action, newEndDate);
    if (expectedStatus && current.status !== expectedStatus) throw new WorkforcePolicyError('The employee status changed. Refresh before retrying.');
    if (!isWorkforceTransitionAllowed(current.status, nextStatus)) throw new WorkforcePolicyError('Invalid employee status transition.');
    const now = Date.now();
    if (current.action_lock?.requiresReview) throw new WorkforcePolicyError('An earlier delivery outcome is uncertain. An administrator must review its dispatch record before retrying.');
    if (current.action_lock?.expiresAt > now) throw new WorkforcePolicyError('Another employee action is in progress. Please retry shortly.');
    if (document) tx.create(document.ref, document.data);
    tx.update(ref, { ...patch, status: nextStatus, updated_at: new Date(now), action_lock: { action, expiresAt: now + 300000 } });
    return current;
  });
}

export async function finishWorkforceAction(db, ref, action, patch = {}) {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data()?.action_lock?.action !== action) return;
    // An administrator may have offboarded the employee after the action.
    const current = snapshot.data();
    const safePatch = ['TERMINATED', 'ARCHIVED', 'COMPLETED'].includes(current.status) ? {} : patch;
    const requiresReview = safePatch.delivery_uncertain === true;
    tx.update(ref, { ...safePatch, action_lock: requiresReview ? { action, requiresReview: true, expiresAt: 0 } : null, updated_at: new Date() });
  });
}
