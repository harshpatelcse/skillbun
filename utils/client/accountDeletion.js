const MAX_REQUESTS = 30;
const TIMEOUT_MS = 90_000;

function deletionError(message, code, retryable = false, status = 0) {
  return Object.assign(new Error(message), { code, retryable, status });
}

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, delay);
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
  });
}

// A pending response is an unfinished operation, never permission for a local
// Firestore fallback or an optimistic success message.
export async function requestAccountDeletion({ user, endpoint = '/api/account', signal, getCurrentUser } = {}) {
  if (!user?.uid || typeof user.getIdToken !== 'function') {
    throw deletionError('Sign in before deleting an account.', 'auth/login-required');
  }
  if (endpoint !== '/api/account' && !/^\/api\/admin\/users\/[A-Za-z0-9_-]+(?:\?email=[^#]*)?$/.test(endpoint)) {
    throw deletionError('Invalid account deletion endpoint.', 'account/invalid-endpoint');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(deletionError(
    'Account deletion could not be confirmed in time. Some data may already be removed. Retry to finish the request.',
    'account/deletion-timeout', true,
  )), TIMEOUT_MS);
  const stop = () => controller.abort(deletionError(
    'Account deletion was interrupted before completion could be confirmed. Retry to check and finish the request.',
    'account/deletion-interrupted', true,
  ));
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();

  const assertSession = () => {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (getCurrentUser && getCurrentUser()?.uid !== user.uid) {
      throw deletionError('The signed-in account changed. Sign in to the original account to finish its deletion.', 'auth/user-changed');
    }
  };
  let rejectAborted;
  const aborted = new Promise((resolve, reject) => { rejectAborted = reject; });
  const onAbort = () => rejectAborted(controller.signal.reason);
  controller.signal.addEventListener('abort', onAbort, { once: true });

  const performDeletion = async () => {
    assertSession();
    const token = await user.getIdToken();
    if (!token) throw deletionError('Sign in again before deleting an account.', 'auth/login-required');

    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      assertSession();
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);

      if (response.status === 200 && data?.success === true && data.status === 'complete') {
        return data;
      }
      if (response.status === 202 && data?.success === false && data.status === 'pending') {
        if (attempt === MAX_REQUESTS - 1) break;
        const retryAfterMs = Number(data.retryAfterMs);
        await waitForRetry(Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 1000, controller.signal);
        continue;
      }

      const message = typeof data?.error === 'string' ? data.error : data?.error?.message;
      throw deletionError(
        message || 'The server could not confirm account deletion. Retry to check and finish the request.',
        data?.code || data?.error?.code || 'account/deletion-unconfirmed',
        typeof data?.retryable === 'boolean' ? data.retryable : response.status >= 500,
        response.status,
      );
    }

    throw deletionError('Account deletion is still pending. Retry to continue and confirm completion.', 'account/deletion-pending', true, 202);
  };

  try {
    return await Promise.race([performDeletion(), aborted]);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error?.code) throw error;
    throw deletionError(
      'The connection was interrupted before account deletion could be confirmed. Some data may already be removed. Retry to finish the request.',
      'account/deletion-unconfirmed', true,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', stop);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
