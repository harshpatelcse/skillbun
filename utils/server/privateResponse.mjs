import { randomUUID } from 'node:crypto';
export const PRIVATE_RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
});

export const PrivateResponse = {
  json(data, options = {}) {
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) headers.set(key, value);
    if (options.status >= 500 && data && typeof data === 'object') {
      const requestId = data.requestId || randomUUID();
      data = { ...data, requestId };
      console.error('[SkillBun response failure]', { requestId, code: 'INTERNAL_ERROR' });
    }
    return Response.json(data, { ...options, headers });
  },
};
