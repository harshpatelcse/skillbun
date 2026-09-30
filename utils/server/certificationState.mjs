import { assertAccountActive } from './accountLifecycle.mjs';

// Firestore transactions serialize competing submissions/mints of the same attempt.
export class ExamError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateSubmission(attemptId, answers) {
  if (typeof attemptId !== 'string' || !/^att_[A-Za-z0-9_-]{6,116}$/.test(attemptId)) throw new ExamError('Valid attemptId is required.');
  if (!answers || typeof answers !== 'object' || Object.keys(answers).length > 10) throw new ExamError('Invalid exam answers.');
  for (const [index, choice] of Object.entries(answers)) {
    if (!/^[0-9]$/.test(index) || !Number.isInteger(choice) || choice < -1 || choice > 3) throw new ExamError('Invalid exam answer index.');
  }
}
export async function submitExamAttempt(db, { uid, attemptId, answers, grade, now = Date.now() }) {
  validateSubmission(attemptId, answers);
  const ref = db.collection('examAttempts').doc(attemptId);
  return db.runTransaction(async (transaction) => {
    await assertAccountActive(db, uid, transaction);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ExamError('Exam attempt not found.', 404);
    const attempt = snapshot.data();
    if (attempt.uid !== uid) throw new ExamError('Unauthorized attempt access.', 403);
    if (attempt.status !== 'ACTIVE') throw new ExamError('Exam attempt has already been submitted or expired.');
    const expiry = attempt.expiresAt?.toDate?.().getTime() ?? new Date(attempt.expiresAt).getTime();
    if (!Number.isFinite(expiry) || now > expiry + 15000) throw new ExamError('Exam attempt expired.');
    if (!Array.isArray(attempt.serverQuestions) || attempt.serverQuestions.length !== 10) throw new ExamError('Invalid exam record.', 500);
    const result = grade(attempt.serverQuestions, answers);
    transaction.update(ref, {
      status: 'COMPLETED', submitted: true, submittedAt: new Date(now),
      submittedAnswers: answers, correctCount: result.correctCount,
      score: result.score, passed: result.passed, updatedAt: new Date(now),
    });
    return { success: true, attemptId, ...result, total: 10 };
  });
}
import { getActiveTemplateVersion, DOCUMENT_CATEGORIES } from '../common/docTemplateRegistry.js';

export async function mintExamCertificate(db, { uid, email, attemptId, roadmapSlug, certId, now = new Date() }) {
  validateSubmission(attemptId, {});
  const attemptRef = db.collection('examAttempts').doc(attemptId);
  const certRef = db.collection('certificates').doc(certId);
  return db.runTransaction(async (transaction) => {
    await assertAccountActive(db, uid, transaction);
    const snapshot = await transaction.get(attemptRef);
    if (!snapshot.exists) throw new ExamError('Exam attempt record not found.', 404);
    const attempt = snapshot.data();
    if (attempt.uid !== uid) throw new ExamError('Unauthorized attempt access.', 403);
    if (attempt.roadmapSlug !== roadmapSlug) throw new ExamError('Exam attempt does not match roadmap.');
    if (attempt.status !== 'COMPLETED' || attempt.passed !== true || !Number.isInteger(attempt.score) || attempt.score < 70 || attempt.score > 100) throw new ExamError('A completed passing exam is required.');
    if (attempt.minted) throw new ExamError('A certificate has already been issued for this attempt.');
    if (!attempt.certName || !attempt.roadmapTitle) throw new ExamError('Exam record is missing credential details.', 500);
    const templateVersion = getActiveTemplateVersion(DOCUMENT_CATEGORIES.ROADMAP_CERT);
    transaction.create(certRef, {
      id: certId, uid, email, name: attempt.certName, roadmapSlug,
      roadmapTitle: attempt.roadmapTitle, score: attempt.score, attemptId,
      cert_type: 'ROADMAP', template_version: templateVersion, is_revoked: false, createdAt: now,
    });
    transaction.update(attemptRef, { minted: true, certId, mintedAt: now, updatedAt: now });
    return { success: true, certId, cert_type: 'ROADMAP', score: attempt.score, message: 'Verified certificate minted successfully.' };
  });
}
