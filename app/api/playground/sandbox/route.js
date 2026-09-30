import { randomBytes } from 'node:crypto';
import { buildPlaygroundSandboxDocument } from '@/utils/server/playgroundSandbox.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const { html, policy } = buildPlaygroundSandboxDocument(randomBytes(24).toString('base64'));
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': policy,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Robots-Tag': 'noindex, noarchive',
    },
  });
}
