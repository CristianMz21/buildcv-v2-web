import { NextResponse } from 'next/server';

import { authorization, isConfigured, STATE_COOKIE, VERIFIER_COOKIE } from '@/lib/google';

/**
 * Step one: send the browser to Google, and keep the two things needed to trust its return.
 *
 * A `GET` that answers a redirect, which is what makes the whole design work. `src/middleware.ts`
 * only guards unsafe methods, so nothing here needs an exception — and a redirect is a top-level
 * navigation, which no CSP directive governs. The browser never fetches Google; it goes there.
 *
 * `state` and the PKCE verifier are held in httpOnly cookies on this origin rather than in a session
 * store, because there is no session yet by definition. `sameSite: 'lax'` is not merely acceptable
 * here, it is REQUIRED: Google returns the visitor by top-level navigation from its own origin, and
 * `strict` would withhold both cookies on exactly that request — the callback would then reject every
 * legitimate sign-in as a forgery.
 */
export const dynamic = 'force-dynamic';

const TEN_MINUTES = 60 * 10;

export async function GET(): Promise<NextResponse> {
  // Answered as "not found" rather than as an error. On a deployment with no Google credentials this
  // route does not exist as a feature, and no screen links to it — `isConfigured()` is the same
  // predicate the button and the privacy page read.
  if (!isConfigured()) return new NextResponse(null, { status: 404 });

  const { url, state, verifier } = await authorization();

  const response = NextResponse.redirect(url, { status: 302 });

  for (const [name, value] of [
    [STATE_COOKIE, state],
    [VERIFIER_COOKIE, verifier],
  ] as const) {
    response.cookies.set(name, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google',
      // Ten minutes is how long somebody has to finish choosing an account. Long enough for a password
      // manager and a second factor, short enough that an abandoned attempt does not leave a usable
      // state value sitting in a browser for the rest of the day.
      maxAge: TEN_MINUTES,
    });
  }

  return response;
}
