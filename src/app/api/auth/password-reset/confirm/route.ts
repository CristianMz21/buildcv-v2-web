import { NextResponse } from 'next/server';

import { anonymousPost, ApiUnreachableError } from '@/lib/backend';
import { relay, unreachable } from '@/lib/relay';
import { clearSession } from '@/lib/session';

/**
 * Step two: spend the link and set the new password.
 *
 * ANONYMOUS — the token IS the credential, which is the point of it existing.
 *
 * THE COOKIES GO WITH IT. Redeeming a reset revokes every refresh token on the account, and the API
 * clears its own. This BFF holds a separate pair on its own origin, so without this a browser that
 * happened to be signed in would keep a session the API has already revoked — and the page gates
 * check that a cookie EXISTS, not that it still works, which is the shape of the redirect loop this
 * codebase already fixed once.
 *
 * Whoever is redeeming this may be recovering from a compromise. Leaving any session standing is
 * exactly the case not to get wrong.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const { token, newPassword } = (await request.json()) as {
    token?: string;
    newPassword?: string;
  };

  if (!token || !newPassword) {
    return NextResponse.json(
      { status: 400, title: 'Bad Request', detail: 'A link and a new password are required.' },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  try {
    const upstream = await anonymousPost('/auth/password-reset/confirm', { token, newPassword });

    if (upstream.ok) await clearSession();

    return relay(upstream);
  } catch (error) {
    if (error instanceof ApiUnreachableError) return unreachable();
    throw error;
  }
}
