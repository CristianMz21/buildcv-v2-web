import type { NextConfig } from 'next';

/**
 * The response headers this app serves.
 *
 * `SecurityHeadersMiddleware` in the API covers the API's own responses. It never sees these: the
 * pages are served by Next, so without this the HTML that renders a candidate's CV goes out with no
 * CSP at all while the JSON behind it is locked down.
 *
 * `connect-src 'self'` is the load-bearing one here. Every call this app makes goes to its own route
 * handlers — that is the whole point of the BFF — so nothing legitimate ever connects elsewhere, and
 * a script that tried to post a CV to a third party would be refused by the browser.
 *
 * `script-src` carries `'unsafe-inline'`, and that is a real weakening rather than an oversight. Next
 * injects inline bootstrap scripts, and the alternative is a per-request nonce from middleware, which
 * makes every page dynamic. Stated here so it is a decision on record and not a default nobody read.
 */
// 'unsafe-eval' IN DEVELOPMENT ONLY. Next's dev server evaluates strings as JavaScript for hot
// reloading, so the production policy applied to `next dev` breaks every page — found by the smoke
// suite, which fails on any console error and reported the violation on the first navigation. The
// production build needs none of it, and shipping it there would hand an injected script the one
// primitive this policy is most worth denying.
const DEV_SCRIPT_SOURCES = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV_SCRIPT_SOURCES}`,
  // Inline styles are used throughout for values computed from server data (a bar's width, a band's
  // colour). Hashing them is not possible when the value comes from a response.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Nothing here uses a camera, a microphone or a location, and a CV screen has no reason to ask.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

// No rewrites to the API on purpose.
//
// A rewrite would put the browser's own request on the wire to BuildCv.Api, which drags along
// everything the BFF exists to avoid: CORS with credentials, the double-submit CSRF header, and the
// antiforgery token that has to be re-fetched on every change of principal — including access-token
// expiry, where an idle client's next POST answers 403 instead of 401 (documented in CLAUDE.md).
//
// Every call to the API goes through a route handler under src/app/api instead, server-side, with an
// `Authorization: Bearer` header. CsrfGuardMiddleware skips bearer requests by design, so none of
// that machinery applies and the browser never holds a BuildCv credential.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Traced dependencies only, so the runtime image carries no toolchain and no dev packages.
  output: 'standalone',

  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
