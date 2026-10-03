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
export const EXAM_TIMING_PROTOCOL = 2;
export const QUESTION_DURATION_MS = 45000;

function timestampMs(value) {
  return value?.toDate?.().getTime() ?? new Date(value).getTime();
}

function currentQuestionResponse(attempt, now) {
  const questionIndex = attempt.questionIndex;
  const source = attempt.serverQuestions[questionIndex];
  return {
    success: true, attemptId: attempt.attemptId, questionIndex,
    complete: questionIndex === 10, serverNow: now,
    questionDeadline: questionIndex === 10 ? null : new Date(timestampMs(attempt.questionDeadline)).toISOString(),
    // Never expose a future question, answer key, or explanation before grading.
    question: source ? { index: questionIndex, question: source.question, options: source.options, difficulty: source.difficulty } : null,
  };
}

export async function recordExamAnswer(db, { uid, attemptId, questionIndex, choice, now = Date.now() }) {
  if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 9) throw new ExamError('Invalid question index.');
  validateSubmission(attemptId, { [questionIndex]: choice });
  const ref = db.collection('examAttempts').doc(attemptId);
  return db.runTransaction(async (transaction) => {
    await assertAccountActive(db, uid, transaction);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ExamError('Exam attempt not found.', 404);
    const attempt = snapshot.data();
    if (attempt.uid !== uid) throw new ExamError('Unauthorized attempt access.', 403);
    if (attempt.status !== 'ACTIVE') throw new ExamError('Exam attempt is no longer active.', 409);
    if (attempt.timingProtocol !== EXAM_TIMING_PROTOCOL) throw new ExamError('This exam uses an outdated timing protocol. Start a new attempt after it expires.', 409);
    if (!Number.isFinite(timestampMs(attempt.expiresAt)) || now > timestampMs(attempt.expiresAt) + 15000) throw new ExamError('Exam attempt expired.');
    if (!Array.isArray(attempt.serverQuestions) || attempt.serverQuestions.length !== 10 || !Number.isInteger(attempt.questionIndex)) throw new ExamError('Invalid exam record.', 500);
    const receipts = attempt.answerReceipts || {};
    if (questionIndex < attempt.questionIndex) {
      // A network retry gets the existing state without changing an answer or deadline.
      if (receipts[questionIndex]?.choice !== choice) throw new ExamError('This question has already been answered.', 409);
      return currentQuestionResponse(attempt, now);
    }
    if (questionIndex !== attempt.questionIndex || questionIndex >= 10) throw new ExamError('Answer the current question first.', 409);
    const deadline = timestampMs(attempt.questionDeadline);
    if (!Number.isFinite(deadline)) throw new ExamError('Invalid question deadline.', 500);
    const timedOut = now >= deadline;
    const next = {
      ...attempt, questionIndex: questionIndex + 1,
      recordedAnswers: { ...attempt.recordedAnswers, [questionIndex]: timedOut ? -1 : choice },
      answerReceipts: { ...receipts, [questionIndex]: { choice, receivedAt: now, timedOut } },
      questionDeadline: new Date(Math.min(now + QUESTION_DURATION_MS, timestampMs(attempt.expiresAt))),
    };
    transaction.update(ref, {
      questionIndex: next.questionIndex, recordedAnswers: next.recordedAnswers,
      answerReceipts: next.answerReceipts, questionDeadline: next.questionDeadline, updatedAt: new Date(now),
    });
    return { ...currentQuestionResponse(next, now), timedOut };
  });
}

export async function submitExamAttempt(db, { uid, attemptId, answers, grade, now = Date.now(), developmentBypass = false }) {
  validateSubmission(attemptId, answers);
  const ref = db.collection('examAttempts').doc(attemptId);
  return db.runTransaction(async (transaction) => {
    await assertAccountActive(db, uid, transaction);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new ExamError('Exam attempt not found.', 404);
    const attempt = snapshot.data();
    if (attempt.uid !== uid) throw new ExamError('Unauthorized attempt access.', 403);
    if (attempt.status === 'COMPLETED' && attempt.submitted === true) {
      const review = grade(attempt.serverQuestions, attempt.submittedAnswers || {}).review;
      return { success: true, attemptId, score: attempt.score, passed: attempt.passed, correctCount: attempt.correctCount, total: 10, ...(review ? { review } : {}) };
    }
    if (attempt.status !== 'ACTIVE') throw new ExamError('Exam attempt has already been submitted or expired.');
    const expiry = attempt.expiresAt?.toDate?.().getTime() ?? new Date(attempt.expiresAt).getTime();
    if (!Number.isFinite(expiry) || now > expiry + 15000) throw new ExamError('Exam attempt expired.');
    if (!Array.isArray(attempt.serverQuestions) || attempt.serverQuestions.length !== 10) throw new ExamError('Invalid exam record.', 500);
    const bypass = developmentBypass && process.env.NODE_ENV === 'development';
    if (attempt.timingProtocol !== EXAM_TIMING_PROTOCOL) throw new ExamError('This exam uses an outdated timing protocol. Start a new attempt after it expires.', 409);
    if (!bypass && attempt.questionIndex !== 10 && now < expiry) throw new ExamError('Finish the current question before submitting the exam.', 409);
    const authoritativeAnswers = bypass ? answers : attempt.recordedAnswers || {};
    validateSubmission(attemptId, authoritativeAnswers);
    const result = grade(attempt.serverQuestions, authoritativeAnswers);
    const historyRef = db.collection('users').doc(uid).collection('quizAttempts').doc(attempt.roadmapSlug);
    const historySnapshot = await transaction.get(historyRef);
    const history = historySnapshot.exists ? historySnapshot.data() : {};
    // Starts consume the daily quota; only authoritative failed grades count
    // toward the two-failure study cooldown. Serving a cooldown resets the run.
    const cooldownServed = Number.isFinite(history.cooldownUntil) && history.cooldownUntil <= now;
    const previousFailures = !cooldownServed && Number.isInteger(history.consecutiveFailures) && history.consecutiveFailures > 0
      ? history.consecutiveFailures : 0;
    const consecutiveFailures = result.passed ? 0 : previousFailures + 1;
    transaction.set(historyRef, {
      consecutiveFailures,
      cooldownUntil: consecutiveFailures >= 2 ? now + 60 * 60 * 1000 : null,
      lastSubmittedAt: now,
      lastExamPassed: result.passed,
      updatedAt: new Date(now),
    }, { merge: true });
    transaction.update(ref, {
      status: 'COMPLETED', submitted: true, submittedAt: new Date(now),
      submittedAnswers: authoritativeAnswers, correctCount: result.correctCount,
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
