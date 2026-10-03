import { isIP } from 'node:net';
import { EmailSignupError } from './emailSignup.mjs';
import { validateSchema } from './inputValidator.js';

const MAX_BODY_BYTES = 20_000;
const emailRule = { type: 'email', required: true, label: 'Email address' };
const requestSchema = {
  email: emailRule,
  ageBand: { type: 'enum', required: true, allowedValues: ['18-plus'], label: 'Adult age declaration' },
  humanToken: { type: 'string', maxLength: 2048, rejectSqlInjection: false },
};
const verifySchema = {
  email: emailRule,
  code: { type: 'string', required: true, minLength: 6, maxLength: 6, pattern: /^\d{6}$/, label: 'Verification code' },
  challengeId: { type: 'string', required: true, minLength: 43, maxLength: 43, pattern: /^[A-Za-z0-9_-]{43}$/, label: 'Verification request' },
  // Passwords are opaque credentials, not query syntax; preserve whitespace.
  password: { required: true, validator: (value) => ({
    isValid: typeof value === 'string' && value.length >= 6 && value.length <= 4096,
    value,
    error: 'Use a password between 6 and 4096 characters.',
  }) },
};

export function getSignupClientAddress(request, vercel = process.env.VERCEL === '1') {
  // Vercel overwrites x-vercel-forwarded-for. Never trust a client-supplied
  // cf-connecting-ip/x-real-ip in this deployment's security-sensitive limits.
  let address = (request.headers.get(vercel ? 'x-vercel-forwarded-for' : 'x-forwarded-for') || '').split(',')[0].trim();
  if (address.toLowerCase().startsWith('::ffff:') && isIP(address.slice(7)) === 4) address = address.slice(7);
  const version = isIP(address);
  if (version === 4) return address;
  if (version === 6) {
    // Group IPv6 privacy addresses by /64 so changing interface IDs cannot
    // produce a new signup allowance for each request.
    const [head, tail = ''] = address.toLowerCase().split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const expanded = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return `${expanded.slice(0, 4).map((part) => parseInt(part, 16).toString(16)).join(':')}::/64`;
  }
  return 'unknown'; // Shared fail-safe bucket when the trusted address is absent.
}

function response(data, status = 200, retryAfterMs = 0) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(retryAfterMs > 0 ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } : {}),
    },
  });
}

async function readBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new EmailSignupError('INVALID_CONTENT_TYPE', 'Send a JSON request.', 415);
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    throw new EmailSignupError('PAYLOAD_TOO_LARGE', 'Signup request is too large.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new EmailSignupError('INVALID_PAYLOAD', 'Payload must be valid JSON.');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new EmailSignupError('PAYLOAD_TOO_LARGE', 'Signup request is too large.', 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof EmailSignupError) throw error;
    throw new EmailSignupError('INVALID_PAYLOAD', 'Payload must be valid JSON.');
  } finally { reader.releaseLock(); }
}

export function createEmailSignupHandlers({ getService, captchaEnabled, verifyHumanProof, allowedOrigins, production = process.env.NODE_ENV === 'production' }) {
  async function handle(request, action) {
    try {
      const origin = request.headers.get('origin');
      const fetchSite = request.headers.get('sec-fetch-site');
      const allowed = new Set(allowedOrigins().filter(Boolean));
      if (!production) allowed.add(new URL(request.url).origin);
      if (fetchSite === 'cross-site' || !origin || !allowed.has(origin)) {
        throw new EmailSignupError('INVALID_ORIGIN', 'Please use the SkillBun signup page to continue.', 403);
      }
      const payload = await readBody(request);
      const parsed = validateSchema(payload, action === 'request' ? requestSchema : verifySchema, { allowUnknown: false, maxKeys: 4, fieldName: 'Signup payload' });
      if (!parsed.isValid) throw new EmailSignupError('INVALID_PAYLOAD', parsed.error);
      if (action === 'request' && captchaEnabled() && !verifyHumanProof(parsed.value.humanToken)?.valid) {
        throw new EmailSignupError('HUMAN_VERIFICATION_REQUIRED', 'Complete the verification before requesting a code.', 403);
      }
      const service = getService();
      const input = { ...parsed.value, address: getSignupClientAddress(request) };
      const result = action === 'request' ? await service.requestCode(input) : await service.verifyCode(input);
      return response(result, 200, result.retryAfterMs);
    } catch (error) {
      if (error instanceof EmailSignupError) {
        return response({ error: error.message, code: error.code, retryAfterMs: error.retryAfterMs }, error.status, error.retryAfterMs);
      }
      // Never log email, passwords, OTPs, SMTP envelopes, or provider responses.
      console.error('[Email signup] Request failed:', error?.code || 'INTERNAL_ERROR');
      return response({ error: 'Email signup is temporarily unavailable. Please try again later.', code: 'SIGNUP_UNAVAILABLE' }, 503);
    }
  }
  return { requestCode: (request) => handle(request, 'request'), verifyCode: (request) => handle(request, 'verify') };
}
