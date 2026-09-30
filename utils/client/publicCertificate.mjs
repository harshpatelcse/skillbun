const MESSAGES = Object.freeze({
  INVALID_ID: 'Enter a valid certificate ID using letters, numbers, hyphens or display slashes.',
  NOT_FOUND: 'No certificate found for this ID. Please double-check the characters.',
  AMBIGUOUS_ID: 'This ID matches more than one record. Contact harsh@skillbun.tech for verification.',
  RATE_LIMITED: 'Too many verification requests. Please try again shortly.',
  VERIFICATION_UNAVAILABLE: 'Certificate verification is temporarily unavailable. Please try again.',
});

export class CertificateLookupError extends Error {
  constructor(code) { super(MESSAGES[code] || MESSAGES.VERIFICATION_UNAVAILABLE); this.code = code in MESSAGES ? code : 'VERIFICATION_UNAVAILABLE'; }
}

export async function fetchPublicCertificate(id, { fetchImpl = fetch, signal } = {}) {
  const raw = typeof id === 'string' ? id.trim() : '';
  if (!raw || raw.length > 128 || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(raw)) throw new CertificateLookupError('INVALID_ID');
  const timeout = AbortSignal.timeout(12000);
  const response = await fetchImpl(`/api/certificates/verify?id=${encodeURIComponent(raw)}`, {
    cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: 'application/json' },
  });
  let result;
  try { result = await response.json(); } catch { throw new CertificateLookupError('VERIFICATION_UNAVAILABLE'); }
  if (!response.ok || result?.success !== true) throw new CertificateLookupError(result?.code);
  const cert = result.certificate;
  if (!cert || typeof cert.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(cert.id) || typeof cert.is_revoked !== 'boolean') throw new CertificateLookupError('VERIFICATION_UNAVAILABLE');
  const date = cert.createdAt ? new Date(cert.createdAt) : null;
  return { ...cert, createdAtDate: date && Number.isFinite(date.getTime()) ? date : null };
}
