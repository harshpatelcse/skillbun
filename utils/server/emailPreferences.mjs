import { createHmac, timingSafeEqual } from 'node:crypto';

function preferenceSecret() {
  const secret = process.env.EMAIL_PREFERENCE_SECRET || process.env.HUMAN_PROOF_SECRET || '';
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== 'production') return 'skillbun-email-preference-development-only-key';
  throw new Error('Email preference signing is not configured.');
}

export function createUnsubscribeToken(email, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ purpose: 'unsubscribe', email: String(email).trim().toLowerCase(), expires: now + 90 * 86400000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', preferenceSecret()).update(payload).digest('base64url')}`;
}

export function verifyUnsubscribeToken(token, email, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1024) return false;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return false;
    const expected = createHmac('sha256', preferenceSecret()).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.purpose === 'unsubscribe' && data.email === String(email).trim().toLowerCase() && Number.isFinite(data.expires) && data.expires > now;
  } catch { return false; }
}

export function unsubscribeUrl(email, base = 'https://skillbun.tech') {
  const mailbox = typeof email === 'string' ? email.trim().toLowerCase() : '';
  // Catalog previews have no recipient and must not mint a mailbox capability.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)) return `${base}/settings`;
  return `${base}/settings?action=unsubscribe&email=${encodeURIComponent(mailbox)}&token=${encodeURIComponent(createUnsubscribeToken(mailbox))}`;
}

export function hasMarketingConsent(user = {}, unsubscribed = false) {
  return user.marketingConsent === true && !unsubscribed && user.isUnsubscribed !== true;
}
