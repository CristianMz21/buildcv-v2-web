import { NextResponse } from 'next/server';

import { anonymousPost, ApiUnreachableError } from '@/lib/backend';
import { relay, unreachable } from '@/lib/relay';

/**
 * Step one of a forgotten password: ask for the link.
 *
 * ANONYMOUS BY NECESSITY — the caller cannot sign in, which is the entire problem. So it does not go
 * through `withSession`, and names an outage itself.
 *
 * THE RESPONSE IS RELAYED UNCHANGED, and here that matters more than usual. The API answers 202
 * whether or not the address has an account, deliberately: an endpoint that answered differently
 * would be an account-enumeration oracle, and on this platform the fact enumerated is that somebody
 * has a CV here — which is to say they are looking for work, which is a thing their current employer
 * might like to know. A BFF that "helpfully" distinguished the two would hand that back.
 *
 * 503 is the one other answer, and it is the same for every address: this server has no mail
 * provider configured. It reveals nothing and the screen says so plainly rather than promising an
 * email nobody can send.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { email } = (await request.json()) as { email?: string };

  if (!email) {
    return NextResponse.json(
      { status: 400, title: 'Bad Request', detail: 'An email address is required.' },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  try {
    return relay(await anonymousPost('/auth/password-reset', { email }));
  } catch (error) {
    if (error instanceof ApiUnreachableError) return unreachable(error);
    throw error;
  }
}
