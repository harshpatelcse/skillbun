import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateEmail } from '../shared/emailValidator.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const SIGNUP_CODE_TTL_MS = 10 * MINUTE;
export const SIGNUP_RESEND_MS = MINUTE;
const MAX_GUESSES = 5;
const COLLECTION = 'emailSignupChallenges';

export class EmailSignupError extends Error {
  constructor(code, message, status = 400, retryAfterMs = 0) {
    super(message);
    this.name = 'EmailSignupError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function normalizeEmail(email) {
  if (typeof email !== 'string') throw new EmailSignupError('INVALID_EMAIL', 'Enter a valid email address.');
  const result = validateEmail(email);
  if (!result.isValid) throw new EmailSignupError('INVALID_EMAIL', result.error);
  const domain = result.normalizedEmail.split('@')[1];
  if (!domain.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new EmailSignupError('INVALID_EMAIL', 'Please enter a valid email address.');
  }
  return result.normalizedEmail;
}

// Gmail ignores dots and +tags. Share send/guess budgets across those aliases,
// while the challenge itself remains bound to the exact submitted address.
function mailbox(email) {
  const [local, domain] = email.split('@');
  return domain === 'gmail.com' || domain === 'googlemail.com'
    ? `${local.split('+')[0].replaceAll('.', '')}@gmail.com`
    : email;
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
}

function equalDigest(left, right) {
  if (!isDigest(left) || !isDigest(right)) return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

function rateError(retryAfterMs) {
  return new EmailSignupError('RATE_LIMITED', 'Too many attempts. Please wait before trying again.', 429, Math.max(1000, retryAfterMs));
}

const SEND_LIMITS = [
  { name: 'ipMinute', windowMs: MINUTE, maxRequests: 5, getSubject: ({ address }) => address },
  { name: 'ipHour', windowMs: HOUR, maxRequests: 20, getSubject: ({ address }) => address },
  { name: 'ipDay', windowMs: DAY, maxRequests: 100, getSubject: ({ address }) => address },
];
const VERIFY_LIMITS = [
  { name: 'emailHour', windowMs: HOUR, maxRequests: 30, getSubject: ({ email }) => mailbox(email) },
  { name: 'ipMinute', windowMs: MINUTE, maxRequests: 30, getSubject: ({ address }) => address },
  { name: 'ipHour', windowMs: HOUR, maxRequests: 100, getSubject: ({ address }) => address },
  { name: 'ipDay', windowMs: DAY, maxRequests: 500, getSubject: ({ address }) => address },
];
const CHALLENGE_STATUSES = new Set(['SENDING', 'ACTIVE', 'DELIVERY_FAILED', 'PROVISIONING', 'FAILED', 'COMPLETE']);

export function createEmailSignupService({ db, auth, sendCode, checkRateLimit, secret, now = Date.now, wait = delay }) {
  if (!db || typeof secret !== 'string' || secret.length < 32) {
    throw new EmailSignupError('SIGNUP_UNAVAILABLE', 'Email signup is temporarily unavailable. Please try again later.', 503);
  }
  const digest = (purpose, value) => createHmac('sha256', secret).update(`skillbun:email-signup:${purpose}:${value}`).digest('hex');
  const challengeRef = (email) => db.collection(COLLECTION).doc(digest('mailbox', mailbox(email)));
  const unavailable = () => new EmailSignupError('SIGNUP_UNAVAILABLE', 'Email signup is temporarily unavailable. Please try again later.', 503);

  async function enforceRateLimit(namespace, email, address, limits) {
    try {
      const result = await checkRateLimit({ namespace, subject: { email, address: address || 'unknown' }, limits, increment: true, requireDistributed: true });
      if (!result?.allowed) throw rateError(result?.retryAfterMs || MINUTE);
    } catch (error) {
      if (error instanceof EmailSignupError) throw error;
      throw unavailable();
    }
  }

  async function transaction(work) {
    try { return await db.runTransaction(work); }
    catch (error) {
      if (error instanceof EmailSignupError) throw error;
      throw unavailable();
    }
  }

  async function requestCode({ email: inputEmail, address, ageBand }) {
    const email = normalizeEmail(inputEmail);
    if (ageBand !== '18-plus') throw new EmailSignupError('AGE_DECLARATION_REQUIRED', 'Student signup currently requires age 18 or above.', 403);
    await enforceRateLimit('emailSignupSend', email, address, SEND_LIMITS);
    const timestamp = now();
    const challengeId = randomBytes(32).toString('base64url');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ref = challengeRef(email);
    const challengeHash = digest('challenge', challengeId);
    await transaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const previous = snapshot.exists ? snapshot.data() : {};
      if (snapshot.exists && (
        !CHALLENGE_STATUSES.has(previous.status)
        || !Array.isArray(previous.sentAt)
        || previous.sentAt.length === 0
        || !previous.sentAt.every((sent) => Number.isSafeInteger(sent) && sent > 0)
        || !Number.isSafeInteger(previous.resendAt)
        || !Number.isSafeInteger(previous.expiresAt)
      )) throw unavailable();
      const history = (previous.sentAt || []).filter((sent) => sent > timestamp - DAY);
      const lastHour = history.filter((sent) => sent > timestamp - HOUR);
      const retryAfterMs = Math.max(
        (previous.resendAt || 0) - timestamp,
        lastHour.length >= 5 ? lastHour[0] + HOUR - timestamp : 0,
        history.length >= 10 ? history[0] + DAY - timestamp : 0,
      );
      if (retryAfterMs > 0) throw rateError(retryAfterMs);
      if (previous.status === 'PROVISIONING' && previous.expiresAt > timestamp) {
        throw new EmailSignupError('SIGNUP_IN_PROGRESS', 'Your account is being created. Try logging in shortly.', 409);
      }
      // Reserve the send BEFORE SMTP. Concurrent requests cannot send extra mail.
      tx.set(ref, {
        status: 'SENDING',
        ageBand: '18-plus',
        ageDeclaredAt: timestamp,
        emailHash: digest('email', email),
        challengeHash,
        codeHash: digest('code', `${email}:${challengeId}:${code}`),
        attempts: 0,
        expiresAt: timestamp + SIGNUP_CODE_TTL_MS,
        resendAt: timestamp + SIGNUP_RESEND_MS,
        sentAt: [...history, timestamp],
        deleteAfter: new Date(timestamp + DAY),
      });
    });
    try {
      await sendCode({ email, code, expiresInMinutes: 10 });
      await transaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const current = snapshot.exists ? snapshot.data() : {};
        if (current.challengeHash === challengeHash && current.status === 'SENDING') {
          tx.update(ref, { status: 'ACTIVE' });
        } else {
          throw new EmailSignupError('CODE_REPLACED', 'A newer code was requested. Use the most recent email.', 409);
        }
      });
    } catch (error) {
      await transaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists && snapshot.data().challengeHash === challengeHash) {
          tx.update(ref, { status: 'DELIVERY_FAILED', codeHash: null });
        }
      }).catch(() => {}); // A SENDING record is also unusable; never fail open.
      if (error instanceof EmailSignupError) throw error;
      throw new EmailSignupError('EMAIL_DELIVERY_FAILED', 'Could not send your code. Please try again in a minute.', 503, SIGNUP_RESEND_MS);
    }
    return { ok: true, challengeId, expiresAt: timestamp + SIGNUP_CODE_TTL_MS, retryAfterMs: SIGNUP_RESEND_MS };
  }

  async function provisionAccount(email, password, uid) {
    let existing;
    try { existing = await auth.getUserByEmail(email); }
    catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    if (existing) {
      const providers = existing.providerData || [];
      if (existing.emailVerified || existing.disabled || !providers.some((provider) => provider.providerId === 'password') || providers.some((provider) => provider.providerId !== 'password')) {
        throw new EmailSignupError('ACCOUNT_EXISTS', 'This email already has an account. Log in or reset your password.', 409);
      }
      // Recover legacy unverified password accounts only after email ownership
      // has been proved. Old passwords and sessions must not gain verified access.
      await auth.updateUser(existing.uid, { email, password, emailVerified: false });
      // Firebase compares auth_time with a revocation timestamp at whole-second
      // precision. Cross that boundary after changing the password so an old
      // session created in the same second cannot survive the revocation.
      await wait(1100);
      await auth.revokeRefreshTokens(existing.uid);
      const current = await auth.getUser(existing.uid);
      const currentProviders = current.providerData || [];
      if (current.email?.toLowerCase() !== email || current.emailVerified || current.disabled || !currentProviders.some((provider) => provider.providerId === 'password') || currentProviders.some((provider) => provider.providerId !== 'password')) {
        throw new EmailSignupError('ACCOUNT_CHANGED', 'Your account changed during verification. Please log in or request a new code.', 409);
      }
      // Bind verification to the address proved by this OTP in the same Auth
      // update; a concurrent email/password change must never verify another address.
      await auth.updateUser(existing.uid, { email, password, emailVerified: true });
      return existing.uid;
    }
    try {
      await auth.createUser({ uid, email, password, emailVerified: true });
    } catch (error) {
      // An Auth write can succeed while its response is lost. Recover only the
      // UID reserved by this verified challenge, never an unrelated account.
      let created;
      try { created = await auth.getUser(uid); } catch { /* Still absent or unavailable. */ }
      if (created?.uid === uid && created.email?.toLowerCase() === email && created.emailVerified && !created.disabled) return uid;
      if (error?.code === 'auth/email-already-exists') {
        throw new EmailSignupError('ACCOUNT_EXISTS', 'This email already has an account. Log in or reset your password.', 409);
      }
      throw error;
    }
    return uid;
  }

  async function verifyCode({ email: inputEmail, password, code, challengeId, address }) {
    const email = normalizeEmail(inputEmail);
    if (typeof password !== 'string' || password.length < 6 || password.length > 4096) {
      throw new EmailSignupError('INVALID_PASSWORD', 'Use a password between 6 and 4096 characters.');
    }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || typeof challengeId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challengeId)) {
      throw new EmailSignupError('INVALID_CODE', 'Enter the six-digit code from your latest verification email.');
    }
    await enforceRateLimit('emailSignupVerify', email, address, VERIFY_LIMITS);
    const ref = challengeRef(email);
    const timestamp = now();
    const uid = `signup_${randomBytes(24).toString('base64url')}`;
    const challengeHash = digest('challenge', challengeId);
    const result = await transaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.exists ? snapshot.data() : {};
      if (current.status !== 'ACTIVE' || current.ageBand !== '18-plus' || !equalDigest(current.challengeHash, challengeHash) || !equalDigest(current.emailHash, digest('email', email))) {
        return { error: 'INVALID_CODE' };
      }
      if (!Number.isSafeInteger(current.attempts) || current.attempts < 0 || current.attempts > MAX_GUESSES ||
          !Number.isSafeInteger(current.expiresAt) || !isDigest(current.codeHash)) {
        return { error: 'INVALID_CODE' };
      }
      if (current.expiresAt <= timestamp) return { error: 'CODE_EXPIRED' };
      if (current.attempts >= MAX_GUESSES) return { error: 'CODE_LOCKED' };
      if (!equalDigest(current.codeHash, digest('code', `${email}:${challengeId}:${code}`))) {
        const attempts = current.attempts + 1;
        tx.update(ref, { attempts });
        // Return an error value so the failed guess commits instead of rolling back.
        return { error: attempts >= MAX_GUESSES ? 'CODE_LOCKED' : 'INVALID_CODE' };
      }
      tx.update(ref, { status: 'PROVISIONING', codeHash: null, uid, consumedAt: timestamp });
      return { ok: true };
    });
    if (result.error) {
      const messages = {
        INVALID_CODE: 'That code is invalid or has already been used. Check your latest email.',
        CODE_EXPIRED: 'Your code has expired. Request a new code.',
        CODE_LOCKED: 'Too many incorrect codes. Request a new code when the resend timer finishes.',
      };
      throw new EmailSignupError(result.error, messages[result.error], result.error === 'CODE_LOCKED' ? 429 : 400, result.error === 'CODE_LOCKED' ? SIGNUP_RESEND_MS : 0);
    }
    try {
      // Never call external Auth APIs inside the retried Firestore transaction.
      const accountUid = await provisionAccount(email, password, uid);
      await transaction(async tx => {
        tx.set(db.collection('users').doc(accountUid), { uid: accountUid, email, ageBand: '18-plus', ageDeclaredAt: new Date(timestamp).toISOString() }, { merge: true });
      });
    } catch (error) {
      await transaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists && snapshot.data().uid === uid) tx.update(ref, { status: 'FAILED' });
      }).catch(() => {});
      if (error instanceof EmailSignupError) throw error;
      throw unavailable();
    }
    // Account creation is authoritative. A failed bookkeeping write must not
    // misreport it: the consumed challenge still cannot be replayed.
    await transaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists && snapshot.data().uid === uid) tx.update(ref, { status: 'COMPLETE' });
    }).catch(() => {});
    return { ok: true };
  }

  return { requestCode, verifyCode };
}
