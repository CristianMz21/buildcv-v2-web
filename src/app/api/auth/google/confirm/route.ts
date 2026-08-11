import { NextResponse } from 'next/server';

import { authorization, INTENT_COOKIE, isConfigured, STATE_COOKIE, VERIFIER_COOKIE } from '@/lib/google';
import { readSession } from '@/lib/session';

/**
 * Starts a Google round trip whose purpose is to CONFIRM something, not to sign in.
 *
 * IT IS A POST, AND THAT IS THE SECURITY PROPERTY RATHER THAN A STYLE CHOICE. The obvious design is
 * a link to `/api/auth/google?intent=delete`, and it is quietly catastrophic: anybody could send a
 * signed-in person that URL, their browser would follow it, Google would hand them back, and the
 * callback would delete their account. A GET that destroys data is a CSRF hole with a consent screen
 * in the middle of it.
 *
 * A POST goes through `src/middleware.ts`, which refuses any unsafe method whose `Origin` does not
 * match the host — so the round trip can only be started from this app's own page, by somebody
 * already looking at it.
 *
 * It answers the URL rather than redirecting, because a redirect on a POST is a shape browsers and
 * fetch handle inconsistently; the screen navigates once it has the address.
 */
export const dynamic = 'force-dynamic';

const TEN_MINUTES = 60 * 10;

export async function POST(): Promise<NextResponse> {
  if (!isConfigured()) return new NextResponse(null, { status: 404 });

  // A confirmation is only meaningful for somebody already signed in. Without this the route would
  // mint a state cookie for anonymous callers, which is a way to make the callback do work on behalf
  // of nobody.
  if (!(await readSession())) {
    return NextResponse.json(
      { status: 401, title: 'Unauthorized', detail: 'Sign in first.' },
      { status: 401, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const { url, state, verifier } = await authorization();

  const response = NextResponse.json({ url });

  for (const [name, value] of [
    [STATE_COOKIE, state],
    [VERIFIER_COOKIE, verifier],
    // WHAT THE ROUND TRIP IS FOR, decided HERE and never read from the callback's query string. If
    // the intent travelled in the URL Google returns to, anyone could turn a plain sign-in into a
    // deletion by editing one parameter of a link.
    [INTENT_COOKIE, 'delete'],
  ] as const) {
    response.cookies.set(name, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: TEN_MINUTES,
    });
  }

  return response;
}
