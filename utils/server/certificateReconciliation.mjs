import { normalizeDocumentCategory, resolveTemplateVersion } from '../common/docTemplateRegistry.js';
import { normalizeWorkforceDbId } from './workforceId.js';

// Pure comparison of projected metadata. Never copies names, emails, answer keys
// or encrypted workforce fields into the report, and never changes records.
export function reconcileCertificates({ certificates = [], attempts = [], employees = [], deletions = [] }) {
  const certs = new Map(certificates.map(record => [record.id, record]));
  const exams = new Map(attempts.map(record => [record.id, record]));
  const erasing = new Set(deletions.map(record => record.id));
  const findings = [];
  const counts = { certificates: certificates.length, attempts: attempts.length, employees: employees.length,
    manual: 0, legacyWithoutAttempt: 0, unissuedPassingAttempts: 0, intentionalErasure: 0, missingIssueDate: 0 };
  const add = (kind, certificateId, attemptId = null, fields = []) => findings.push({ kind, certificateId, ...(attemptId ? { attemptId } : {}), ...(fields.length ? { fields } : {}) });
  const passing = record => record.status === 'COMPLETED' && record.passed === true && Number.isInteger(record.score) && record.score >= 70 && record.score <= 100;
  const byAttempt = new Map();
  const activeRoadmaps = new Map();

  for (const cert of certificates) {
    if (!cert.createdAt) counts.missingIssueDate++;
    try { resolveTemplateVersion(normalizeDocumentCategory(cert.cert_type || 'ROADMAP'), cert.template_version); }
    catch { add('unsupported_template_or_type', cert.id); }
    const roadmap = !cert.cert_type || cert.cert_type === 'ROADMAP';
    if (!roadmap) continue;
    if (!cert.is_revoked && cert.uid && cert.roadmapSlug) {
      const key = JSON.stringify([cert.uid, cert.roadmapSlug]);
      const ids = activeRoadmaps.get(key) || [];
      ids.push(cert.id); activeRoadmaps.set(key, ids);
    }
    if (!cert.attemptId) {
      if (cert.issued_by_admin) counts.manual++;
      else counts.legacyWithoutAttempt++;
      continue;
    }
    const linked = byAttempt.get(cert.attemptId) || [];
    linked.push(cert.id); byAttempt.set(cert.attemptId, linked);
    const attempt = exams.get(cert.attemptId);
    if (!attempt) {
      if (erasing.has(cert.uid)) counts.intentionalErasure++;
      else add('certificate_attempt_missing', cert.id, cert.attemptId);
      continue;
    }
    const fields = [];
    for (const [certField, attemptField] of [['uid', 'uid'], ['roadmapSlug', 'roadmapSlug'], ['name', 'certName'], ['roadmapTitle', 'roadmapTitle'], ['score', 'score']]) {
      if (cert[certField] !== attempt[attemptField]) fields.push(certField);
    }
    if (!passing(attempt)) fields.push('passingState');
    if (attempt.minted !== true || attempt.certId !== cert.id) fields.push('mintLink');
    if (fields.length) add('issued_snapshot_mismatch', cert.id, cert.attemptId, fields);
  }
  for (const attempt of attempts) {
    if (passing(attempt) && attempt.minted !== true) counts.unissuedPassingAttempts++;
    if (attempt.minted !== true) continue;
    if (erasing.has(attempt.uid)) { counts.intentionalErasure++; continue; }
    if (!attempt.certId || !certs.has(attempt.certId)) add('minted_certificate_missing', attempt.certId || null, attempt.id);
    else if (certs.get(attempt.certId).attemptId !== attempt.id) add('attempt_certificate_link_mismatch', attempt.certId, attempt.id);
    if (!passing(attempt)) add('minted_attempt_not_passing', attempt.certId || null, attempt.id);
  }
  for (const [attemptId, ids] of byAttempt) {
    if (ids.length > 1) ids.forEach(id => add('duplicate_attempt_link', id, attemptId));
  }
  for (const ids of activeRoadmaps.values()) {
    if (ids.length > 1) ids.forEach(id => add('multiple_active_roadmap_credentials', id));
  }
  for (const employee of employees) {
    for (const reference of employee.granted_credentials || []) {
      if (typeof reference !== 'string') continue;
      const match = reference.match(/SKB[/-]\d{4}[/-](?:INT-REC|TRN-EXP|CORP-LOR)[/-][23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}/i);
      if (!match) continue;
      const id = normalizeWorkforceDbId(match[0]);
      const cert = certs.get(id);
      if (!cert) add('workforce_grant_missing', id);
      else if (cert.employee_id !== employee.id) add('workforce_owner_mismatch', id);
    }
  }
  const byKind = {};
  findings.forEach(finding => { byKind[finding.kind] = (byKind[finding.kind] || 0) + 1; });
  return { counts, findingCount: findings.length, byKind, findings,
    note: 'Read-only observations across paginated reads, not an atomic snapshot or proof of loss. Investigate before correcting; manual and legacy credentials need no exam link.' };
}
