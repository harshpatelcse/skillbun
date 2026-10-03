import { randomUUID } from 'node:crypto';

export function logSafeError(context, error) {
  const requestId = randomUUID();
  // Error messages and provider/SMTP payloads can contain credentials or bearer links.
  const code = typeof error?.code === 'string' && /^[a-zA-Z0-9_/-]{1,80}$/.test(error.code) ? error.code : 'INTERNAL_ERROR';
  console.error(context, { requestId, code });
  return requestId;
}
