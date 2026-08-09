import { NextResponse } from 'next/server';

import { login } from '@/lib/backend';
import { writeSession } from '@/lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  const { email, password } = (await request.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json(
      { status: 400, title: 'Bad Request', detail: 'Email and password are required.' },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  const outcome = await login(email, password);

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
