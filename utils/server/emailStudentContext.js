import { loadEmailRoadmapContext } from './emailRoadmapContext.js';
import { emailTime } from '../shared/emailRecommendation.js';

export async function enrichEmailProgress(progress) {
  return Promise.all(progress.map(async p => ({ ...p, ...await loadEmailRoadmapContext(p.slug, p.completedNodeIds) })));
}
export async function loadEmailStudent(db, auth, uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) throw new Error('Invalid student ID.');
  const ref = db.collection('users').doc(uid);
  const [profile, account, progress, certs, exams] = await Promise.all([
    ref.get(), auth.getUser(uid), ref.collection('roadmapProgress').get(),
    db.collection('certificates').where('uid', '==', uid).get(),
    db.collection('examAttempts').where('uid', '==', uid).select('roadmapSlug', 'status', 'passed', 'submittedAt').get(),
  ]);
  const data = profile.data() || {};
  const email = account.email || data.email || '';
  const unsub = email ? await db.collection('unsubscribes').doc(email.toLowerCase()).get() : null;
  return { uid, name: data.name || data.displayName || account.displayName || 'Student', email, degree: data.degree || '', createdAt: emailTime(account.metadata?.creationTime || data.createdAt), lastSignInTime: emailTime(account.metadata?.lastSignInTime), isUnsubscribed: Boolean(unsub?.exists || data.isUnsubscribed || data.marketingConsent !== true), marketingConsent: data.marketingConsent === true, sentEmailHistory: data.sentEmailHistory || [], progress: await enrichEmailProgress(progress.docs.map(p => ({ ...p.data(), slug: p.id }))), certificates: certs.docs.map(c => ({ ...c.data(), id: c.id })), examOutcomes: exams.docs.map(e => ({ ...e.data(), id: e.id })) };
}
