/** @type {import('next').NextConfig} */

// Security headers applied to every route. The CSP is intentionally strict;
// 'unsafe-inline' is required for Next.js's injected runtime styles/scripts.
// connect-src allows this app's own API plus the Vercel Blob hosts the browser
// uploads to directly. The @vercel/blob v2 client sends uploads to its API at
// https://vercel.com/api/blob, which may hand off to the *.public.blob host;
// both must be allowed. (The Z.AI fetch of the blob happens server-side.)
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const blobAccess = process.env.BLOB_ACCESS || process.env.zaiblob_ACCESS || 'private'

const nextConfig = {
  reactStrictMode: true,
  env: {
    // Keep client uploads aligned with the Blob store (public vs private).
    NEXT_PUBLIC_BLOB_ACCESS: blobAccess,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig
