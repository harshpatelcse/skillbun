import { validateSchema } from './inputValidator.js';
import { assertAccountActive } from './accountLifecycle.mjs';
import { isValidWorkforceId, normalizeWorkforceDbId } from './workforceId.js';

export class CertificateMutationError extends Error {
  constructor(message, status = 400, code = 'INVALID_CERTIFICATE') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function normalizeAdminCertificateId(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new CertificateMutationError('A valid certificate ID is required.');
  }
  const id = isValidWorkforceId(value) ? normalizeWorkforceDbId(value) : value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new CertificateMutationError('Invalid certificate ID.');
  return id;
}

export function validateCertificateIssue(body) {
  if (body && Object.hasOwn(body, 'score') && !Number.isInteger(body.score)) {
    throw new CertificateMutationError('Score must be an integer from 0 to 100.');
  }
  const result = validateSchema(body, {
    cert_type: { type: 'enum', allowedValues: ['ROADMAP', 'INTERNSHIP', 'TRAINING', 'LOR'], defaultValue: 'ROADMAP' },
    name: { type: 'string', required: true, minLength: 2, maxLength: 120 },
    email: { type: 'string', maxLength: 254 },
    stream_or_track: { type: 'string', maxLength: 240 },
    roadmapTitle: { type: 'string', maxLength: 240 },
    roadmapSlug: { type: 'string', maxLength: 80, pattern: /^[a-z0-9_]*$/ },
    score: { validator: value => ({ isValid: Number.isInteger(value) && value >= 0 && value <= 100, value, error: 'Score must be an integer from 0 to 100.' }) },
    department: { type: 'string', maxLength: 120 },
    designation: { type: 'string', maxLength: 120 },
    start_date: { type: 'string', maxLength: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    end_date: { type: 'string', maxLength: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    recommendation_text: { type: 'string', maxLength: 12_000 },
    custom_id: { type: 'string', maxLength: 128 },
  }, { allowUnknown: false });
  if (!result.isValid) throw new CertificateMutationError(result.error);
  const data = result.value;
  if (!data.stream_or_track && !data.roadmapTitle) throw new CertificateMutationError('Stream / Roadmap Track title is required.');
  if (data.stream_or_track && data.roadmapTitle && data.stream_or_track !== data.roadmapTitle) {
    throw new CertificateMutationError('Roadmap title and track must agree.');
  }
  if (data.email) {
    data.email = data.email.toLowerCase();
    if (/[\x00-\x1f\x7f]/.test(data.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new CertificateMutationError('Provide a valid recipient email.');
    }
  }
  for (const key of ['start_date', 'end_date']) {
    if (data[key] && (!Number.isFinite(Date.parse(data[key])) || new Date(data[key]).toISOString().slice(0, 10) !== data[key])) {
      throw new CertificateMutationError('Provide a valid calendar date.');
    }
  }
  if (data.start_date && data.end_date && data.start_date > data.end_date) throw new CertificateMutationError('End date must be on or after start date.');
  if (data.custom_id) data.custom_id = normalizeAdminCertificateId(data.custom_id);
  return data;
}

/** Creation is atomic: even two simultaneous issuances cannot overwrite a record. */
export async function createIssuedCertificate(db, certificate) {
  const id = normalizeAdminCertificateId(certificate.id);
  const collection = db.collection('certificates');
  const ref = collection.doc(id);
  return db.runTransaction(async tx => {
    if (certificate.cert_type === 'ROADMAP' && certificate.uid) await assertAccountActive(db, certificate.uid, tx);
    const existing = await tx.get(ref);
    if (existing.exists) throw new CertificateMutationError('This certificate ID is already issued. Use a new ID.', 409, 'CERTIFICATE_ID_EXISTS');
    // Historical records can store their public reference under a different key.
    for (const value of new Set([id, certificate.display_id].filter(Boolean))) {
      for (const field of ['id', 'display_id']) {
        const aliases = await tx.get(collection.where(field, '==', value).limit(1));
        if (!aliases.empty) throw new CertificateMutationError('This certificate reference is already issued. Use a new ID.', 409, 'CERTIFICATE_ID_EXISTS');
      }
    }
    tx.create(ref, { ...certificate, id });
    return id;
  });
}

/** Corrections require revocation and a new issuance; the original snapshot survives. */
export async function changeCertificateRevocation(db, { id, body, adminEmail, now = new Date() }) {
  const result = validateSchema(body, { is_revoked: { type: 'boolean', required: true } }, { allowUnknown: false });
  if (!result.isValid || typeof body.is_revoked !== 'boolean') {
    throw new CertificateMutationError('Issued credential details cannot be edited. Only a boolean is_revoked may be changed; revoke and issue a new certificate to correct details.');
  }
  const ref = db.collection('certificates').doc(normalizeAdminCertificateId(id));
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new CertificateMutationError('Certificate not found.', 404, 'CERTIFICATE_NOT_FOUND');
    const updates = {
      is_revoked: body.is_revoked,
      revoked_at: body.is_revoked ? now : null,
      revoked_by: body.is_revoked ? adminEmail : null,
      updatedAt: now,
    };
    tx.update(ref, updates);
    return updates;
  });
}
