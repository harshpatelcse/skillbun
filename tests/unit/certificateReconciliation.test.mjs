import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCertificates } from '../../utils/server/certificateReconciliation.mjs';

const attempt = { id: 'att_test', uid: 'private-uid', certName: 'Private Name', roadmapTitle: 'Frontend', roadmapSlug: 'frontend', score: 80, status: 'COMPLETED', passed: true, minted: true, certId: 'TEST-CERT' };
const certificate = { id: 'TEST-CERT', uid: 'private-uid', name: 'Private Name', roadmapTitle: 'Frontend', roadmapSlug: 'frontend', score: 80, attemptId: 'att_test', cert_type: 'ROADMAP', template_version: 'v1', createdAt: '2026-09-30', is_revoked: false };

test('matching immutable snapshots reconcile without exposing personal values', () => {
  const input = { certificates: [certificate], attempts: [attempt] };
  const before = structuredClone(input);
  const report = reconcileCertificates(input);
  assert.equal(report.findingCount, 0);
  assert.doesNotMatch(JSON.stringify(report), /private-uid|Private Name/);
  assert.deepEqual(input, before);
});

test('missing minted records are flagged while intentional account erasure is distinguished', () => {
  assert.equal(reconcileCertificates({ attempts: [attempt] }).byKind.minted_certificate_missing, 1);
  const erased = reconcileCertificates({ attempts: [attempt], deletions: [{ id: attempt.uid, status: 'pending' }] });
  assert.equal(erased.findingCount, 0);
  assert.equal(erased.counts.intentionalErasure, 1);
});

test('manual, legacy and passing-but-unminted records are not reported as lost certificates', () => {
  const report = reconcileCertificates({
    certificates: [{ id: 'MANUAL', cert_type: 'ROADMAP', issued_by_admin: 'admin@example.test' }, { id: 'LEGACY' }],
    attempts: [{ ...attempt, minted: false }],
  });
  assert.equal(report.findingCount, 0);
  assert.equal(report.counts.manual, 1);
  assert.equal(report.counts.legacyWithoutAttempt, 1);
  assert.equal(report.counts.unissuedPassingAttempts, 1);
});

test('linked snapshots, duplicate attempts and invalid pass states are detected', () => {
  const report = reconcileCertificates({ certificates: [certificate, { ...certificate, id: 'SECOND', score: 100 }], attempts: [{ ...attempt, passed: false }] });
  assert.equal(report.byKind.issued_snapshot_mismatch, 2);
  assert.equal(report.byKind.duplicate_attempt_link, 2);
  assert.equal(report.byKind.multiple_active_roadmap_credentials, 2);
  assert.equal(report.byKind.minted_attempt_not_passing, 1);
});

test('workforce grant references are checked separately from student erasure', () => {
  const id = 'SKB-2026-INT-REC-8K29DF';
  const employees = [{ id: 'employee-a', granted_credentials: ['Certificate of Internship Completion (SKB/2026/INT-REC/8K29DF)'] }];
  assert.equal(reconcileCertificates({ employees }).byKind.workforce_grant_missing, 1);
  assert.equal(reconcileCertificates({ employees, certificates: [{ id, cert_type: 'INTERNSHIP', employee_id: 'employee-b' }] }).byKind.workforce_owner_mismatch, 1);
  assert.equal(reconcileCertificates({ employees, certificates: [{ id, cert_type: 'INTERNSHIP', employee_id: 'employee-a' }] }).findingCount, 0);
});
