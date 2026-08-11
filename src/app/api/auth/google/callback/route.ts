import { NextResponse } from 'next/server';

import { ApiUnreachableError, external } from '@/lib/backend';
import { exchange, isConfigured, STATE_COOKIE, VERIFIER_COOKIE } from '@/lib/google';
import { writeSession } from '@/lib/session';

/**
 * Step two: Google sends the visitor back, and this decides whether to believe it.
 *
 * IT ANSWERS A REDIRECT ON EVERY PATH, INCLUDING FAILURE, because a person arrives here by clicking a
 * button and not by calling an API. A JSON error body would leave them on a blank page holding a
 * ProblemDetails object; a redirect to `/login?error=…` puts them back where they started with a
 * sentence they can act on. The details go to the log, never to the URL — an OAuth error from Google
 * can name the client id and the redirect URI.
 *
 * The `state` comparison IS the CSRF defence, and it is the whole of it. Without it, anyone could
 * hand a victim a link to this route carrying an attacker's authorization code, and the victim's
 * browser would quietly finish signing them into the attacker's account — where anything they went on
 * to upload would belong to somebody else. `sameSite: 'lax'` is what lets the cookie survive Google's
 * top-level navigation back; `strict` would withhold it here and turn every real sign-in into a
 * rejected one.
 */
export const dynamic = 'force-dynamic';

/**
 * Back to sign-in with something true and short. The reason is a code, never Google's own text.
 *
 * The origin comes from the request being answered rather than from `SITE_ORIGIN`: this is a relative
 * redirect back to the same page the visitor was just on, so it should follow them to localhost in
 * development. `SITE_ORIGIN` is for the address we PUBLISH — the redirect URI Google matches against —
 * and using it here would bounce a developer out of their own dev server.
 */
function refuse(origin: string, reason: string, logged: string): NextResponse {
  console.error(
    JSON.stringify({ level: 'error', at: new Date().toISOString(), name: 'GoogleSignInFailed', reason, detail: logged }),
  );

  const response = NextResponse.redirect(new URL(`/login?error=${reason}`, origin), { status: 302 });
  // Spent either way. Leaving them behind would let a second attempt reuse a state value that has
  // already been through one exchange.
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(VERIFIER_COOKIE);
  return response;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isConfigured()) return new NextResponse(null, { status: 404 });

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');

  // Pressing "cancel" on Google's consent screen is not a failure and is not logged as one — it is
  // somebody changing their mind, and they get the sign-in page back without an alarming banner.
  if (denied === 'access_denied') {
    return NextResponse.redirect(new URL('/login', url.origin), { status: 302 });
  }
  if (denied) return refuse(url.origin, 'google', `google returned ${denied}`);

  const jar = request.headers.get('cookie') ?? '';
  const cookie = (name: string): string | null =>
    jar.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

  const expected = cookie(STATE_COOKIE);
  const verifier = cookie(VERIFIER_COOKIE);

  if (!code || !state || !expected || !verifier) return refuse(url.origin, 'incomplete', 'missing code, state or cookies');

  // Compared as whole strings, not by prefix. Both are 32 random bytes minted a moment ago; a length
  // check first keeps the comparison from being the interesting part.
  if (state.length !== expected.length || state !== expected) {
    return refuse(url.origin, 'state', 'state did not match the cookie — the callback did not come from our redirect');
  }

  let idToken: string;
  try {
    idToken = await exchange(code, verifier);
  } catch (error) {
    return refuse(url.origin, 'exchange', error instanceof Error ? error.message : 'code exchange failed');
  }

  let outcome;
  try {
    outcome = await external('google', idToken);
  } catch (error) {
    if (error instanceof ApiUnreachableError) return refuse(url.origin, 'unreachable', `${error.message} (${error.correlationId})`);
    throw error;
  }

  if (!outcome.ok) {
    return refuse(url.origin, 'rejected', `the API refused the identity with ${outcome.status}`);
  }

  await writeSession(outcome.session);

  // The CV list, matching what a password sign-in does. Landing on the analysis flow would ask a brand
  // new account for a CV and a posting before it has either.
  const response = NextResponse.redirect(new URL('/resumes', url.origin), { status: 302 });
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(VERIFIER_COOKIE);
  return response;
}
