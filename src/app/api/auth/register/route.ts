import { NextResponse } from 'next/server';

import { ApiUnreachableError, login, register } from '@/lib/backend';
import { MAX_CREDENTIAL_BYTES, PayloadTooLargeError, readJsonBody } from '@/lib/body';
import { relay, tooLarge, unreachable } from '@/lib/relay';
import { writeSession } from '@/lib/session';

/**
 * Creates an account and signs it in.
 *
 * TWO CALLS, because `POST /v1/auth/register` issues no session — it answers with the account and
 * nothing else. Leaving the browser at a sign-in form holding credentials it just chose would be a
 * step that exists only because the API has two endpoints.
 *
 * A registration that succeeds and a sign-in that then fails is reported as the SIGN-IN failure it
 * is. The account exists at that point, so saying registration failed would send the caller to
 * create it again and meet "email already registered" — an error about their own successful action.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Anonymous, so the body is bounded here rather than by `withSession`. See the note in the sign-in
  // route: these are the endpoints reachable without an account.
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

  // Anonymous, so neither call passes through `withSession`. Both are wrapped together because the
  // candidate cannot act on which of the two failed to reach the API — only on the fact that neither
  // did, and that it was not their doing.
  let created: Response;
  let session: Awaited<ReturnType<typeof login>>;

  try {
    created = await register(email, password);
    // Relayed unchanged: the API's refusals here are the useful ones — an address already registered,
    // a password the hasher rejects — and each is a sentence the form can show as written.
    if (!created.ok) return relay(created);

    session = await login(email, password);
  } catch (error) {
    if (error instanceof ApiUnreachableError) return unreachable(error);
    throw error;
  }

  if (!session.ok) {
    const headers = new Headers({ 'content-type': 'application/problem+json' });
    // Register and login share one 5-per-minute window, so registering spends part of it: this is
    // the throttle a new account meets most often, and the wait has to be the API's number.
    if (session.retryAfter !== null) headers.set('retry-after', session.retryAfter);

    return NextResponse.json(session.problem, { status: session.status, headers });
  }

  await writeSession(session.session);
  return NextResponse.json({ expiresIn: session.expiresIn }, { status: 201 });
}
