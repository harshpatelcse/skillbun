const RECENT_LOGIN_SECONDS = 5 * 60;
const LIMITS = [
  { name: 'minute', windowMs: 60_000, maxRequests: 60, getSubject: ({ uid }) => uid },
  { name: 'hour', windowMs: 3_600_000, maxRequests: 360, getSubject: ({ uid }) => uid },
];

function reply(body, status, retryAfterMs = 0) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      ...(retryAfterMs > 0 ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } : {}),
    },
  });
}

function failure(message, status, code, retryable = false) {
  return reply({ success: false, error: message, code, retryable }, status);
}

export function createAccountDeletionHandler({
  getAuth, getDb, isAdmin, checkRateLimit, deleteAccount, allowedOrigins,
  production = process.env.NODE_ENV === 'production', now = Date.now,
}) {
  return async function handle(request, { uid: targetUid } = {}) {
    if (request.method !== 'DELETE') return failure('Use DELETE for account removal.', 405, 'METHOD_NOT_ALLOWED');
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return failure('Sign in before deleting an account.', 401, 'UNAUTHENTICATED');

    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const allowed = new Set(allowedOrigins().filter(Boolean));
    if (!production) allowed.add(url.origin);
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && !allowed.has(origin))) {
      return failure('Use the SkillBun account settings to continue.', 403, 'INVALID_ORIGIN');
    }

    const adminRequest = targetUid !== undefined;
    let auth, decoded;
    try {
      auth = getAuth();
      // Only self-service erasure may authenticate an account whose marker is set.
      // Firebase signature, revocation and authoritative email checks still run.
      decoded = await auth.verifyIdToken(token, { allowDeleting: !adminRequest });
    } catch {
      return failure('Your session is invalid or expired. Sign in again.', 401, 'UNAUTHENTICATED');
    }

    try {
      const uid = adminRequest ? targetUid : decoded.uid;
      if (typeof uid !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(uid)) {
        return failure('A valid account ID is required.', 400, 'INVALID_ACCOUNT_ID');
      }
      if (adminRequest && !await isAdmin(decoded)) {
        return failure('Administrator access is required.', 403, 'FORBIDDEN');
      }
      if (!adminRequest || uid === decoded.uid) {
        const age = Math.floor(now() / 1000) - decoded.auth_time;
        if (!Number.isSafeInteger(decoded.auth_time) || age < -60 || age > RECENT_LOGIN_SECONDS) {
          return failure('Sign out and sign in again before deleting your account.', 403, 'auth/requires-recent-login');
        }
      }
      const allowedKeys = adminRequest ? new Set(['email', 'adminEmail']) : new Set();
      if ([...url.searchParams.keys()].some(key => !allowedKeys.has(key)) || url.searchParams.getAll('email').length > 1 || request.body) {
        return failure('Unexpected account deletion parameters.', 400, 'INVALID_PAYLOAD');
      }
      let expectedEmail = '';
      const rawEmail = url.searchParams.get('email');
      if (rawEmail) {
        // Erasure must also work for old or unwanted accounts whose domains
        // today's signup policy rejects. This is only a server-checked assertion.
        expectedEmail = rawEmail.trim().toLowerCase();
        if (expectedEmail.length > 254 || /[\x00-\x1f\x7f]/.test(expectedEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedEmail)) {
          return failure('Provide a valid expected account email.', 400, 'INVALID_EMAIL');
        }
      }
      const limit = await checkRateLimit({
        namespace: 'accountDeletion', subject: { uid: decoded.uid }, limits: LIMITS,
        increment: true, requireDistributed: true,
      });
      if (!limit?.allowed) {
        return reply({ success: false, error: 'Too many deletion requests. Please retry shortly.', code: 'RATE_LIMITED', retryable: true }, 429, limit?.retryAfterMs || 60_000);
      }
      const db = getDb();
      if (!db) return failure('Account deletion is temporarily unavailable.', 503, 'DELETION_UNAVAILABLE', true);
      const result = await deleteAccount({ db, auth, uid, expectedEmail, now });
      if (result?.success === true && result.status === 'complete') return reply(result, 200);
      if (result?.success === false && result.status === 'pending') return reply(result, 202, result.retryAfterMs || 1000);
      return failure('Account deletion could not be confirmed. Please retry.', 503, 'DELETION_UNCONFIRMED', true);
    } catch (error) {
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 && typeof error.code === 'string') {
        return failure(error.message, error.status, error.code, error.retryable === true);
      }
      // Do not expose SDK messages, account identifiers or database contents.
      console.error('[Account deletion] Request failed:', error?.code || 'INTERNAL_ERROR');
      return failure('Account deletion could not finish. Retry to continue the cleanup.', 503, 'DELETION_FAILED', true);
    }
  };
}
