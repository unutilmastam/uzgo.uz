import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

// Baseline headers. A full nonce-based Content-Security-Policy is added with
// the production hardening work (docs/SECURITY.md).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Docker-friendly self-contained server output (docs/DEPLOYMENT.md).
  output: 'standalone',
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
  // Same-site API (docs/decisions/0007-same-site-api.md): in development the
  // browser calls /api/* on the web origin and Next.js forwards it to the API.
  // In production the reverse proxy does this.
  rewrites() {
    return Promise.resolve(
      isDev ? [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }] : [],
    );
  },
};

export default nextConfig;
