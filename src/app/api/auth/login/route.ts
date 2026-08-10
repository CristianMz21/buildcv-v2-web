import { NextResponse } from 'next/server';

import { ApiUnreachableError, login } from '@/lib/backend';
import { MAX_CREDENTIAL_BYTES, PayloadTooLargeError, readJsonBody } from '@/lib/body';
import { tooLarge, unreachable } from '@/lib/relay';
import { writeSession } from '@/lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  // Bounded here rather than by `withSession`, which this route does not use, and bounded TIGHTLY:
  // reachable without a session, it reads two short strings and has no business buffering more.
  let credentials: { email?: string; password?: string };
  try {
    credentials = await readJsonBody(request, MAX_CREDENTIAL_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return tooLarge();
    throw error;
  }

  const { email, password } = credentials;

  if (!email || !password) {
    return NextResponse.json(
      { status: 400, title: 'Bad Request', detail: 'Email and password are required.' },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  // Anonymous, so it does not pass through `withSession` and has to name the outage itself. Without
  // this the fetch rejection escaped as a bare 500 and the form said "Sign-in failed." — which is
  // what it says for a wrong password.
  let outcome;
  try {
    outcome = await login(email, password);
  } catch (error) {
    if (error instanceof ApiUnreachableError) return unreachable(error);
    throw error;
  }

  if (!outcome.ok) {
    const headers = new Headers({ 'content-type': 'application/problem+json' });
    // The 429's wait, forwarded rather than restated. The form used to say "wait a minute" from a
    // constant, which is right only while the policy is 5-per-minute and wrong the moment it moves.
    if (outcome.retryAfter !== null) headers.set('retry-after', outcome.retryAfter);

    return NextResponse.json(outcome.problem, { status: outcome.status, headers });
  }

  await writeSession(outcome.session);

  // `expiresIn` is echoed rather than swallowed: it is what the API tells clients to schedule their
  // refresh off. This BFF already refreshes proactively on every call, so the browser does not need
  // it today — but hiding it would make a future "session about to end" prompt impossible to build
  // without a second round trip.
  return NextResponse.json({ expiresIn: outcome.expiresIn });
}
