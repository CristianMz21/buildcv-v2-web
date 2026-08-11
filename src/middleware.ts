import { NextResponse, type NextRequest } from 'next/server';

/**
 * Same-origin enforcement for every state-changing call into this BFF.
 *
 * `SameSite` DOES NOT PROTECT THIS DEPLOYMENT, and the reason is a property of the hostname rather
 * than of the cookie. The session cookies are `sameSite: 'lax'`, which is the right setting and is not
 * enough here: "site" means the registrable domain, and **`azurecontainerapps.io` is not in the Public
 * Suffix List**. Checked against the published list, with controls — `azurestaticapps.net` IS in it,
 * an invented domain is not, so the lookup was reading what it claimed to read.
 *
 * So every Azure Container App in the world shares one registrable domain and is *same-site* with this
 * one. A forged POST from any other tenant's app carries these cookies, and `Strict` would not help
 * either, because it is computed on the same site. Anybody can deploy a Container App.
 *
 * The check that does work is the origin itself. A browser sets `Origin` on every unsafe request and a
 * page cannot forge it, so comparing it against the host this request actually arrived on is a
 * same-origin test that owes nothing to the domain's registry status.
 *
 * SAFE METHODS ARE NOT CHECKED. GET and HEAD change nothing, the container's own probe sends no
 * `Origin` at all, and refusing them would break the liveness check without protecting anything.
 *
 * A custom domain would make `SameSite` sound again by giving this app its own registrable domain.
 * This check stays regardless: it is the one that does not depend on which hostname we happen to serve
 * from, which is exactly the kind of assumption this codebase has been wrong about before.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie names, duplicated from `src/lib/session.ts` on purpose.
 *
 * Middleware runs in a separate bundle and importing `session.ts` would drag `server-only`, the token
 * decoder and the backend client into it. The names are two strings, and the parity is asserted by a
 * check rather than by hope — see `scripts/check-cookie-names.mjs`.
 */
const ACCESS_COOKIE = 'bcv_access';
const REFRESH_COOKIE = 'bcv_refresh';

export function middleware(request: NextRequest): NextResponse {
  /*
   * THE SIGNED-IN REDIRECT OFF THE LANDING PAGE LIVES HERE, and moving it here is what lets that page
   * be static at all.
   *
   * It was `if (await readSession()) redirect('/resumes')` inside the page, which made `/` render on
   * the server for EVERY visitor — the one page whose entire job is to be found and read by somebody
   * who has never been here before. Measured: `ƒ /` in the build, 0.79s to first byte warm, and the
   * app runs at `minReplicas: 0` with a 300-second cooldown, so on a product with little traffic
   * almost every arrival is the one that pays a container start.
   *
   * A static page cannot read cookies, so the check moves to the only place that can see them without
   * making the page dynamic. The redirect is a convenience for people who already have an account;
   * paying for it with the first impression of everyone who does not is the wrong trade.
   */
  if (request.method === 'GET' && request.nextUrl.pathname === '/') {
    // `.value` rather than `.has()`, so a present-but-empty cookie counts as absent — exactly what
    // `readSession()` in `src/lib/session.ts` does. The middleware must not regard as signed in
    // somebody the page gate would wave through.
    const signedIn =
      Boolean(request.cookies.get(ACCESS_COOKIE)?.value) &&
      Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

    if (signedIn) {
      const resumes = request.nextUrl.clone();
      resumes.pathname = '/resumes';
      return NextResponse.redirect(resumes);
    }

    return NextResponse.next();
  }

  if (SAFE_METHODS.has(request.method)) return NextResponse.next();

  const host = request.headers.get('host');
  const origin = request.headers.get('origin');

  // Absent `Origin` is refused rather than waved through. Browsers send it on every unsafe request,
  // so the only callers it excludes are scripts and command-line tools — which is the population this
  // check exists to make prove itself. The verification scripts send one.
  if (!origin || !host) return refuse('missing');

  let claimed: string;
  try {
    claimed = new URL(origin).host;
  } catch {
    return refuse('unparseable');
  }

  // Hosts, not full origins: the ingress terminates TLS, so the scheme a request arrives with inside
  // the container is not the scheme the browser used, and comparing them would refuse every real
  // request in production while passing locally.
  if (claimed !== host) return refuse('cross-origin');

  return NextResponse.next();
}

function refuse(reason: string): NextResponse {
  return NextResponse.json(
    {
      status: 403,
      title: 'Forbidden',
      detail: 'This request did not come from this site.',
    },
    { status: 403, headers: { 'content-type': 'application/problem+json', 'x-refused': reason } },
  );
}

// A constant rather than a literal in the array below, because `contract:coverage` counts any
// `/api/` string that follows `(` or `,` as a screen calling a route — and this matcher's path is
// not a call, it is the BFF itself. The matcher is a closed set of routes this app serves.
const API_MATCHER = '/api/:path*';

export const config = {
  // The BFF's own routes, for the origin check — pages are not state-changing and static assets are
  // served without ever reaching this.
  //
  // And `/` alone, for the signed-in redirect. That is the entire cost of making the landing page
  // static: one extra path through a function that returns immediately for everyone who is not
  // signed in, in exchange for a page that no longer renders per visitor on a deployment that scales
  // to zero.
  matcher: ['/', API_MATCHER],
};
