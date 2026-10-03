import { PrivateResponse as NextResponse } from '@/utils/server/privateResponse.mjs';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from '@/utils/server/firebaseAdmin';
import { validateEmail, validateSchema } from '@/utils/server/inputValidator';
import { checkServerRateLimit } from '@/utils/server/rateLimitStore';
import { getClientAddress } from '@/utils/server/requestUtils';
import { verifyUnsubscribeToken, hasMarketingConsent } from '@/utils/server/emailPreferences.mjs';
import { logSafeError } from '@/utils/server/safeDiagnostics.mjs';

export const runtime = 'nodejs';

async function owner(request, email) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  try {
    // The shared Auth wrapper checks revocation, disabled accounts and erasure
    // markers; retain an explicit verified-mailbox boundary for preferences.
    const user = await getFirebaseAdminAuth().verifyIdToken(authorization.slice(7).trim());
    return user.email_verified === true && user.email?.trim().toLowerCase() === email ? user : null;
  } catch { return null; }
}
async function limit(request, email, mutate) {
  return checkServerRateLimit({
    namespace: mutate ? 'unsubscribePost' : 'unsubscribeGet',
    subject: { address: getClientAddress(request), email },
    limits: [
      { name: 'ipMinute', windowMs: 60000, maxRequests: mutate ? 10 : 30, getSubject: s => `ip:${s.address}` },
      { name: 'emailHour', windowMs: 3600000, maxRequests: mutate ? 10 : 60, getSubject: s => `email:${s.email}` },
    ], requireDistributed: process.env.NODE_ENV === 'production',
  });
}
export async function GET(request) {
  try {
    const query = new URL(request.url).searchParams;
    const check = validateEmail(query.get('email'));
    if (!check.isValid) return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    const email = check.normalizedEmail;
    const user = await owner(request, email);
    if (!user && !verifyUnsubscribeToken(query.get('token'), email)) return NextResponse.json({ error: 'Sign in as the email owner or use a valid email preference link.' }, { status: 403 });
    const quota = await limit(request, email, false);
    if (!quota.allowed) return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
    const db = getFirebaseAdminFirestore();
    if (!db) return NextResponse.json({ error: 'Preferences are temporarily unavailable.' }, { status: 503 });
    const unsub = await db.collection('unsubscribes').doc(email).get();
    const profile = user ? (await db.collection('users').doc(user.uid).get()).data() : {};
    const subscribed = hasMarketingConsent(profile, unsub.exists);
    return NextResponse.json({ unsubscribed: user ? !subscribed : unsub.exists, ...(user ? { marketingConsent: subscribed } : {}) });
  } catch (error) {
    const requestId = logSafeError('[Email preference read]', error);
    return NextResponse.json({ error: 'Preferences are temporarily unavailable.', requestId }, { status: 503 });
  }
}
export async function POST(request) {
  try {
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Payload must be valid JSON.' }, { status: 400 }); }
    const check = validateSchema(body, {
      email: { type: 'email', required: true },
      action: { type: 'enum', allowedValues: ['unsubscribe', 'resubscribe'], defaultValue: 'unsubscribe' },
      token: { type: 'string', maxLength: 1024 },
    }, { allowUnknown: false, maxKeys: 3 });
    if (!check.isValid) return NextResponse.json({ error: check.error }, { status: 400 });
    const { email, action, token } = check.value;
    const user = await owner(request, email);
    if (!user && (action !== 'unsubscribe' || !verifyUnsubscribeToken(token, email))) return NextResponse.json({ error: 'Sign in as the email owner or use a valid unsubscribe link.' }, { status: 403 });
    const quota = await limit(request, email, true);
    if (!quota.allowed) return NextResponse.json({ error: 'Too many preference changes. Please wait.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000))) } });
    const db = getFirebaseAdminFirestore();
    if (!db) return NextResponse.json({ error: 'Preferences are temporarily unavailable.' }, { status: 503 });
    const ref = db.collection('unsubscribes').doc(email);
    await db.runTransaction(async tx => {
      const now = new Date().toISOString();
      if (action === 'unsubscribe') tx.set(ref, { email, unsubscribedAt: now, source: user ? 'authenticated_settings' : 'signed_email_link' }, { merge: true });
      else tx.delete(ref);
      if (user) tx.set(db.collection('users').doc(user.uid), { marketingConsent: action === 'resubscribe', marketingConsentAt: now, isUnsubscribed: action === 'unsubscribe' }, { merge: true });
    });
    return NextResponse.json({ success: true, unsubscribed: action === 'unsubscribe', message: action === 'unsubscribe' ? 'Marketing emails disabled.' : 'You opted in to marketing emails.' });
  } catch (error) {
    const requestId = logSafeError('[Email preference update]', error);
    return NextResponse.json({ error: 'Preferences are temporarily unavailable.', requestId }, { status: 503 });
  }
}
