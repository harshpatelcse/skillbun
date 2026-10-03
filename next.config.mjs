import path from 'node:path'
import { buildContentSecurityPolicy } from './utils/server/contentSecurityPolicy.mjs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'skillbun-75d10'
const firebaseAuthOrigin = `https://${firebaseProjectId}.firebaseapp.com`
const contentSecurityPolicy = buildContentSecurityPolicy()

// ONNX ships binaries for every supported OS/architecture. Keep the build target's
// native CPU runtime; SkillBun explicitly uses device: 'cpu' for both RAG models.
const onnxRuntimeRoot = './node_modules/onnxruntime-node/bin/napi-v6'
const onnxCpuTraceExcludes = [
  ...['win32/x64', 'win32/arm64', 'darwin/x64', 'darwin/arm64', 'linux/x64', 'linux/arm64']
    .filter(target => target !== process.platform + '/' + process.arch)
    .map(target => onnxRuntimeRoot + '/' + target + '/**/*'),
  onnxRuntimeRoot + '/linux/x64/libonnxruntime_providers_cuda.so',
  onnxRuntimeRoot + '/linux/x64/libonnxruntime_providers_tensorrt.so',
]

const appDocumentSecurityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
]

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => { if (isServer) { config.resolve.alias = { ...config.resolve.alias, jose: path.resolve(__dirname, 'node_modules/jose/dist/node/cjs/index.js') } } return config },

  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ['@google-cloud/firestore', '@google-cloud/storage', 'nodemailer'],
  outputFileTracingIncludes: {
    '/api/docs/[slug]/[topicId]': ['./content/docs/??/*.sbv'],
    '/api/counsellor': ['./public/data/roadmaps/*.json', './content/rag/embeddings.json'],
    '/api/admin/emails/drafts': ['./public/data/roadmaps/*.json', './content/rag/embeddings.json'],
  },
  outputFileTracingExcludes: {
    '/*': onnxCpuTraceExcludes,
  },
  async rewrites() {
    return [
      {
        source: '/manifest.json',
        destination: '/manifest.webmanifest',
      },
      {
        source: '/__/auth/:path*',
        destination: `${firebaseAuthOrigin}/__/auth/:path*`,
      },
      {
        source: '/roadmap/:slug/goal',
        destination: '/roadmap/:slug?tab=goal',
      },
      {
        source: '/roadmap/:slug/learn',
        destination: '/roadmap/:slug?tab=learn',
      },
      {
        source: '/roadmap/:slug/boost',
        destination: '/roadmap/:slug?tab=boost',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Firebase owns its helper policy. The exact playground bridge has its
        // own opaque-origin sandbox CSP; all other paths retain the app policy.
        source: '/((?!__/auth(?:/|$)|api/playground/sandbox$).*)',
        headers: appDocumentSecurityHeaders,
      },

      {
        source: '/api/(admin|portal|unsubscribe|auth/password-reset)/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/(logo.png|splash-logo.png|certificate-template.png|favicon.ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' },
        ],
      },
    ]
  },
}

export default nextConfig

