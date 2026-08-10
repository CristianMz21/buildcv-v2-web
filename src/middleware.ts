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

export function middleware(request: NextRequest): NextResponse {
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

export const config = {
  // Only the BFF's own routes. Pages are not state-changing and the static assets are served without
  // ever reaching this.
  matcher: '/api/:path*',
};
