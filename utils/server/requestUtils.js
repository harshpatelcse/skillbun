import { isIP } from 'node:net';

/**
 * SkillBun Server-Side Request Utilities
 * Shared helpers for request parsing, IP extraction, and rate limit key generation.
 */

/**
 * Extracts the client IP address for rate limiting, mirroring the hardened trust
 * order of getSignupClientAddress() in utils/server/emailSignupHttp.mjs.
 *
 * On Vercel the platform overwrites x-vercel-forwarded-for, so client-supplied
 * cf-connecting-ip / x-real-ip headers must never be trusted. Locally (or on any
 * host without a trusted platform header) the first x-forwarded-for hop is used,
 * and callers without a trusted address share one fail-safe bucket instead of a
 * per-caller address.
 * @param {Request} request
 * @returns {string} Trusted client IP (IPv4, or IPv6 grouped to /64) or the shared 'unknown' bucket
 */
export function getClientAddress(request) {
  const vercel = process.env.VERCEL === '1';
  // Vercel overwrites x-vercel-forwarded-for. Never trust a client-supplied
  // cf-connecting-ip/x-real-ip in this deployment's security-sensitive limits.
  let address = (request?.headers?.get?.(vercel ? 'x-vercel-forwarded-for' : 'x-forwarded-for') || '').split(',')[0].trim();
  if (address.toLowerCase().startsWith('::ffff:') && isIP(address.slice(7)) === 4) address = address.slice(7);
  const version = isIP(address);
  if (version === 4) return address;
  if (version === 6) {
    // Group IPv6 privacy addresses by /64 so changing interface IDs cannot
    // produce a new rate-limit allowance for each request.
    const [head, tail = ''] = address.toLowerCase().split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const expanded = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return `${expanded.slice(0, 4).map((part) => parseInt(part, 16).toString(16)).join(':')}::/64`;
  }
  return 'unknown'; // Shared fail-safe bucket when the trusted address is absent.
}

/**
 * Generates standard rate limit key per user ID and client IP address.
 * @param {string} prefix
 * @param {Request} request
 * @param {string} uid
 * @returns {string}
 */
export function getRateLimitKey(prefix, request, uid) {
  return `uid:${uid}:ip:${getClientAddress(request)}`
}
