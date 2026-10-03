import { hasMarketingConsent } from './emailPreferences.mjs';
import { randomUUID } from 'node:crypto';
import { assertAccountActive } from './accountLifecycle.mjs';
import { EMAIL_GAP_MS, emailCategory, emailTime } from '../shared/emailRecommendation.js';

export const EMAIL_DISPATCH_LOCK_MS = 5 * 60 * 1000;

function dispatchRef(db, uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) throw new Error('Invalid student ID.');
  return db.collection('emailDispatchLocks').doc(uid);
}

function normalizeHistory(value) {
  return (Array.isArray(value) ? value : [])
    .filter(Boolean)
    .map(log => typeof log === 'string' ? { templateId: log } : log)
    .filter(log => !log.isTest);
}

function lastMarketingSend(history) {
  return Math.max(0, ...history
    .filter(log => {
      const templateId = typeof log.templateId === 'string' ? log.templateId : '';
      return Boolean(log.category || emailCategory(templateId) || templateId.startsWith('ai_'));
    })
    .map(log => emailTime(log.sentAt)));
}

function toIso(value, fallback) {
  const time = emailTime(value) || fallback;
  return new Date(time).toISOString();
}

export async function claimRecommendedEmailDispatch({
  db, uid, email, templateId, category, subject, roadmapSlug = '', eventKey = '', adminEmail = '',
  forceOverride = false,
  now = Date.now(), leaseMs = EMAIL_DISPATCH_LOCK_MS,
}) {
  const lockRef = dispatchRef(db, uid);
  const userRef = db.collection('users').doc(uid);
  const unsubscribeRef = db.collection('unsubscribes').doc(String(email || '').trim().toLowerCase());
  const owner = randomUUID();

  return db.runTransaction(async tx => {
    await assertAccountActive(db, uid, tx);
    const lockSnapshot = await tx.get(lockRef);
    if (lockSnapshot.exists) {
      const currentLock = lockSnapshot.data() || {};
      if (currentLock.status === 'SENDING' && Number(currentLock.expiresAt) > now) {
        return { kind: 'in_progress', retryAfterMs: Number(currentLock.expiresAt) - now };
      }
      if (currentLock.status === 'SENDING' && Number(currentLock.expiresAt) <= now) {
        tx.set(lockRef, { status: 'UNKNOWN', updatedAt: now, expiresAt: 0 }, { merge: true });
      }
      return { kind: 'review' };
    }

    const userSnapshot = await tx.get(userRef);
    const userData = userSnapshot.data() || {};
    const unsubscribeSnapshot = await tx.get(unsubscribeRef);
    if (!hasMarketingConsent(userData, unsubscribeSnapshot.exists)) return { kind: 'unsubscribed' };

    const history = normalizeHistory(userData.sentEmailHistory);
    if (history.some(log => log.templateId === templateId)) return { kind: 'already_sent' };
    const lastSentAt = lastMarketingSend(history);
    if (!forceOverride && lastSentAt && now - lastSentAt < EMAIL_GAP_MS) return { kind: 'gap' };

    tx.set(lockRef, {
      status: 'SENDING', owner, uid, email: String(email || '').trim().toLowerCase(), templateId,
      category, subject: String(subject || '').slice(0, 240), roadmapSlug, eventKey, adminEmail,
      forceOverride: Boolean(forceOverride),
      createdAt: now, updatedAt: now, expiresAt: now + leaseMs, smtpAcceptedAt: null,
    });
    return { kind: 'claimed', owner };
  });
}

export async function releaseEmailDispatch({ db, uid, owner }) {
  const lockRef = dispatchRef(db, uid);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(lockRef);
    if (!snapshot.exists || snapshot.data()?.owner !== owner || snapshot.data()?.status !== 'SENDING') return false;
    tx.delete(lockRef);
    return true;
  });
}

export async function markEmailDispatchUnknown({ db, uid, owner, reason, smtpAcceptedAt = null, now = Date.now() }) {
  const lockRef = dispatchRef(db, uid);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(lockRef);
    if (!snapshot.exists || snapshot.data()?.owner !== owner) return false;
    tx.set(lockRef, {
      status: 'UNKNOWN', updatedAt: now, expiresAt: 0,
      ...(smtpAcceptedAt ? { smtpAcceptedAt } : {}),
      ...(reason ? { uncertaintyReason: String(reason).slice(0, 300) } : {}),
    }, { merge: true });
    return true;
  });
}

export async function finalizeRecommendedEmailDispatch({ db, uid, owner, messageId = null, now = Date.now() }) {
  const lockRef = dispatchRef(db, uid);
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async tx => {
    await assertAccountActive(db, uid, tx);
    const lockSnapshot = await tx.get(lockRef);
    if (!lockSnapshot.exists || lockSnapshot.data()?.owner !== owner) throw new Error('The email dispatch lock could not be confirmed.');
    const lock = lockSnapshot.data() || {};
    const userSnapshot = await tx.get(userRef);
    const history = Array.isArray(userSnapshot.data()?.sentEmailHistory) ? userSnapshot.data().sentEmailHistory : [];
    const priorLog = history.find(log => log && typeof owner === 'string' && log.dispatchId === owner);
    if (priorLog) {
      tx.delete(lockRef);
      return priorLog;
    }

    const sentLog = {
      dispatchId: owner,
      templateId: lock.templateId,
      subject: lock.subject || '',
      messageId,
      category: lock.category || '',
      roadmapSlug: lock.roadmapSlug || '',
      eventKey: lock.eventKey || '',
      isTest: false,
      sentAt: new Date(now).toISOString(),
      adminEmail: lock.adminEmail || '',
      forceOverride: Boolean(lock.forceOverride),
    };
    tx.set(userRef, { sentEmailHistory: [...history, sentLog] }, { merge: true });
    tx.delete(lockRef);
    return sentLog;
  });
}

export async function resolveEmailDispatch({ db, uid, resolution, adminEmail = '', now = Date.now() }) {
  if (!['sent', 'not_sent'].includes(resolution)) throw new Error('Choose whether the email was sent.');
  const lockRef = dispatchRef(db, uid);
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async tx => {
    await assertAccountActive(db, uid, tx);
    const lockSnapshot = await tx.get(lockRef);
    if (!lockSnapshot.exists) return { kind: 'missing' };
    const lock = lockSnapshot.data() || {};
    if (lock.status === 'SENDING' && Number(lock.expiresAt) > now) {
      return { kind: 'in_progress', retryAfterMs: Number(lock.expiresAt) - now };
    }
    if (lock.status !== 'UNKNOWN' || lock.uid !== uid || typeof lock.owner !== 'string' || !lock.owner) return { kind: 'invalid' };

    if (resolution === 'not_sent') {
      tx.delete(lockRef);
      return { kind: 'not_sent' };
    }

    const userSnapshot = await tx.get(userRef);
    const history = Array.isArray(userSnapshot.data()?.sentEmailHistory) ? userSnapshot.data().sentEmailHistory : [];
    const priorLog = history.find(log => log && log.dispatchId === lock.owner);
    if (priorLog) {
      tx.delete(lockRef);
      return { kind: 'sent', log: priorLog };
    }

    const sentLog = {
      dispatchId: lock.owner,
      templateId: lock.templateId || '',
      subject: lock.subject || '',
      messageId: null,
      category: lock.category || '',
      roadmapSlug: lock.roadmapSlug || '',
      eventKey: lock.eventKey || '',
      isTest: false,
      sentAt: toIso(lock.smtpAcceptedAt || lock.createdAt, now),
      adminEmail: adminEmail || lock.adminEmail || '',
      forceOverride: Boolean(lock.forceOverride),
      manuallyConfirmed: true,
    };
    tx.set(userRef, { sentEmailHistory: [...history, sentLog] }, { merge: true });
    tx.delete(lockRef);
    return { kind: 'sent', log: sentLog };
  });
}
