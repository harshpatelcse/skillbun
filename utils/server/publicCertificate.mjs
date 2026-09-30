import { formatWorkforceDisplayId } from './workforceId.js';
import { normalizeDocumentCategory } from '../common/docTemplateRegistry.js';

const LEGACY_PREFIXES = Object.freeze({
  'HR-OFF': 'OFF', 'HR-EXT': 'EXT', 'HR-TERM': 'TERM', 'HR-REL': 'REL',
  'INT-REC': 'INT', 'TRN-EXP': 'TRN', 'CORP-LOR': 'LOR',
});
const TYPES = Object.freeze({ ROADMAP_CERT: 'ROADMAP', INTERNSHIP_CERT: 'INTERNSHIP', TRAINING_CERT: 'TRAINING', LOR: 'LOR' });
const TEXT_FIELDS = Object.freeze({
  name: 200, roadmapTitle: 300, roadmapSlug: 100, department: 200,
  designation: 200, stream_or_track: 300, role: 200, grade: 120,
  mode: 120, venue: 200, performance_rating: 120, start_date: 40,
  end_date: 40, issue_date: 80, recommendation_text: 12000, performance_remarks: 12000,
});
const LIMITS = [
  { name: 'minute', windowMs: 60_000, maxRequests: 30 },
  { name: 'hour', windowMs: 3_600_000, maxRequests: 300 },
];

export class PublicCertificateError extends Error {
  constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}

function unavailable() {
  return new PublicCertificateError('VERIFICATION_UNAVAILABLE', 503, 'Certificate verification is temporarily unavailable. Please try again.');
}

/** Exact identifiers only. Slashes are display separators, never Firestore paths. */
export function certificateLookupKeys(value) {
  if (typeof value !== 'string' || value.length > 128) {
    throw new PublicCertificateError('INVALID_ID', 400, 'Enter a valid certificate ID (up to 128 characters).');
  }
  const raw = value.trim();
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(raw)) {
    throw new PublicCertificateError('INVALID_ID', 400, 'Enter a valid certificate ID using letters, numbers, hyphens or display slashes.');
  }
  const normalized = raw.replace(/\//g, '-');
  const ids = new Set([normalized]);
  const aliases = new Set([raw, normalized]);
  // Case-sensitive legacy Firestore IDs must not be uppercased indiscriminately.
  if (/^(?:SKB(?:[-/]|[A-Za-z0-9]{4}[-/])|SB[-/])/i.test(raw)) {
    const upper = normalized.toUpperCase();
    ids.add(upper);
    aliases.add(raw.toUpperCase());
    aliases.add(upper);
    const display = formatWorkforceDisplayId(upper);
    aliases.add(display);
    // Earlier UI versions displayed every hyphen as a slash.
    aliases.add(upper.replace(/-/g, '/'));
    const canonical = display.replace(/\//g, '-');
    ids.add(canonical);
    const workforce = canonical.match(/^SKB-(\d{4})-(HR-OFF|HR-EXT|HR-TERM|HR-REL|INT-REC|TRN-EXP|CORP-LOR)-([A-Z0-9]{6})$/);
    if (workforce) {
      const legacy = `SB-${LEGACY_PREFIXES[workforce[2]]}-${workforce[1]}-${workforce[3]}`;
      ids.add(legacy);
      aliases.add(legacy);
    }
  }
  return { ids: [...ids], aliases: [...aliases] };
}

function text(value, max) {
  if (typeof value !== 'string') return undefined;
  // Legacy prose may include an issuer email. It is not part of the public view.
  return value.slice(0, max).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
}

function isoDate(value) {
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate()
      : value instanceof Date ? value
        : (typeof value === 'string' && value.trim()) || typeof value === 'number' ? new Date(value) : null;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
}

/** Public fields are explicit; never spread a Firestore record into a response. */
export function toPublicCertificate(id, data) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !data || typeof data !== 'object') throw unavailable();
  const certType = TYPES[normalizeDocumentCategory(data.cert_type || 'ROADMAP')];
  if (!certType) throw unavailable();
  if (data.template_version != null && (typeof data.template_version !== 'string' || data.template_version.length > 40)) throw unavailable();
  const publicRecord = {
    id,
    display_id: typeof data.display_id === 'string' && /^[A-Za-z0-9_/-]{1,128}$/.test(data.display_id)
      ? data.display_id : formatWorkforceDisplayId(id),
    cert_type: certType,
    template_version: data.template_version ?? null,
    // Unexpected truthy legacy values must never turn a revoked record active.
    is_revoked: data.is_revoked !== undefined && data.is_revoked !== null && data.is_revoked !== false,
    createdAt: isoDate(data.createdAt),
  };
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const value = text(data[field], max);
    if (value !== undefined) publicRecord[field] = value;
  }
  if (typeof data.score === 'number' && Number.isFinite(data.score) && data.score >= 0 && data.score <= 100) publicRecord.score = data.score;
  // issued_by sometimes contains an operational email or Firebase UID. Only
  // publish a human-readable signatory; the frozen renderer supplies its fallback.
  if (typeof data.issued_by === 'string' && data.issued_by.length <= 160
    && /^[\p{L}\p{M} .,'()-]+$/u.test(data.issued_by) && data.issued_by.trim().includes(' ')
    && ![data.uid, data.employee_id, data.issued_by_admin, data.issued_by_email].includes(data.issued_by)) {
    publicRecord.issued_by = data.issued_by;
  }
  if (!publicRecord.createdAt && !publicRecord.issue_date) publicRecord.issue_date = publicRecord.end_date || 'Not recorded';
  return publicRecord;
}

export async function lookupPublicCertificate(db, value) {
  const keys = certificateLookupKeys(value);
  if (!db) throw unavailable();
  const certificates = db.collection('certificates');
  // At most four direct IDs and two small equality queries; limit 2 detects
  // ambiguous display aliases instead of trusting whichever row arrives first.
  const [direct, aliases] = await Promise.all([
    Promise.all(keys.ids.map(id => certificates.doc(id).get())),
    Promise.all(['id', 'display_id'].map(field => certificates.where(field, 'in', keys.aliases).limit(2).get())),
  ]);
  const matches = new Map();
  for (const snapshot of [...direct, ...aliases.flatMap(result => result.docs)]) {
    if (snapshot.exists) matches.set(snapshot.id, snapshot);
  }
  if (matches.size > 1) throw new PublicCertificateError('AMBIGUOUS_ID', 409, 'This ID matches more than one record. Contact harsh@skillbun.tech for verification.');
  if (!matches.size) throw new PublicCertificateError('NOT_FOUND', 404, 'No certificate found for this ID. Please double-check the characters.');
  const [snapshot] = matches.values();
  return toPublicCertificate(snapshot.id, snapshot.data());
}

function response(body, status, retryAfterMs = 0) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(retryAfterMs > 0 ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } : {}),
  } });
}

export function createPublicCertificateHandler({ getDb, checkRateLimit, getAddress, timeoutMs = 8000 }) {
  return async function handle(request) {
    let timer;
    try {
      if (request.method !== 'GET') throw new PublicCertificateError('METHOD_NOT_ALLOWED', 405, 'Use GET to verify a certificate.');
      if (request.url.length > 1024) throw new PublicCertificateError('INVALID_ID', 400, 'Enter one valid certificate ID.');
      const { searchParams } = new URL(request.url);
      if (searchParams.getAll('id').length !== 1 || [...searchParams.keys()].some(key => key !== 'id')) {
        throw new PublicCertificateError('INVALID_ID', 400, 'Enter one valid certificate ID.');
      }
      const id = searchParams.get('id');
      certificateLookupKeys(id);
      return await Promise.race([
        (async () => {
          const limit = await checkRateLimit({ namespace: 'publicCertificate', subject: getAddress(request), limits: LIMITS, increment: true, requireDistributed: true });
          if (!limit.allowed) return response({ success: false, code: 'RATE_LIMITED', error: 'Too many verification requests. Please try again shortly.' }, 429, limit.retryAfterMs || 60_000);
          const certificate = await lookupPublicCertificate(getDb(), id);
          return response({ success: true, certificate }, 200);
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), timeoutMs); }),
      ]);
    } catch (error) {
      const safe = error instanceof PublicCertificateError ? error : unavailable();
      return response({ success: false, error: safe.message, code: safe.code }, safe.status);
    } finally { clearTimeout(timer); }
  };
}
