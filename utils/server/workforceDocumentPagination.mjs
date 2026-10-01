import { validateFirestoreId } from './inputValidator.js';
import { isValidWorkforceId, normalizeWorkforceDbId } from './workforceId.js';

export class WorkforceDocumentQueryError extends Error {}

export function validateWorkforceDocumentId(value) {
  return validateFirestoreId(isValidWorkforceId(value) ? normalizeWorkforceDbId(value) : value, { fieldName: 'Document ID' });
}

function compareDocuments(left, right) {
  const byDate = (right.issued_at || '').localeCompare(left.issued_at || '');
  if (byDate) return byDate;
  return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
}

export function parseWorkforceDocumentCursor(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new WorkforceDocumentQueryError('pageToken must be a valid document cursor.');
  }
  if (value.startsWith('v1:')) {
    try {
      const encoded = value.slice(3);
      if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid encoding');
      const [issuedAt, id, ...extra] = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (extra.length || typeof issuedAt !== 'string' || typeof id !== 'string' || !/^[A-Za-z0-9_.@-]{1,128}$/.test(id)) throw new Error('Invalid cursor');
      if (issuedAt !== '' && (!Number.isFinite(Date.parse(issuedAt)) || new Date(issuedAt).toISOString() !== issuedAt)) throw new Error('Invalid date');
      return { issued_at: issuedAt, id, legacy: false };
    } catch {
      throw new WorkforceDocumentQueryError('pageToken must be a valid document cursor.');
    }
  }
  // Keep cursors issued by the previous timestamp-only endpoint readable.
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new WorkforceDocumentQueryError('pageToken must be a valid document cursor.');
  }
  return { issued_at: value, legacy: true };
}

export function paginateWorkforceDocuments(documents, { limit = 50, cursor = null } = {}) {
  const sorted = [...documents].sort(compareDocuments);
  const eligible = !cursor ? sorted : sorted.filter(document => cursor.legacy
    ? (document.issued_at || '') < cursor.issued_at
    : compareDocuments(document, cursor) > 0);
  const visible = eligible.slice(0, limit);
  const hasMore = eligible.length > limit;
  const last = visible.at(-1);
  return {
    documents: visible,
    count: visible.length,
    has_more: hasMore,
    nextPageToken: hasMore && last
      ? `v1:${Buffer.from(JSON.stringify([last.issued_at || '', last.id])).toString('base64url')}`
      : null,
  };
}
