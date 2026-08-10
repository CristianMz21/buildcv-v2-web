import type { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';
import { clearSession } from '@/lib/session';

// Declared dynamic because this handler takes no request argument, which is the only signal Next uses
// to decide a GET route cannot be evaluated at build time. Without it the build tries to collect this
// route's data with no request in scope and fails on the first cookie read. The sibling routes are
// dynamic by accident of taking a `request` or a `params`; this one has to say so.
export const dynamic = 'force-dynamic';

/** The signed-in account. Email and role are all it carries — there is no name on an account. */
export async function GET(): Promise<NextResponse> {
  return withSession(async () =>
    relay(await apiFetch('/auth/me', { headers: { Accept: 'application/json' } })),
  );
}

/**
 * Closes the account and deletes everything it owns. Irreversible.
 *
 * THE PASSWORD TRAVELS IN THE BODY, not the query string, and that is the API's decision this relay
 * has to respect: a credential in a URL reaches the access log of every proxy between here and
 * Kestrel. A DELETE with a body is unusual enough to look like a mistake, so it is worth saying that
 * it is not one.
 *
 * THE COOKIES GO WITH IT. The account no longer exists, so the session cannot be refreshed and every
 * page gate would keep waving the browser through on a cookie that names nobody — the same shape as
 * the redirect loop `withSession` clears cookies to avoid. Cleared only after the API confirms, for
 * the same reason logout does: a failed deletion must not leave the candidate signed out of an
 * account they still have.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  return withSession(async () => {
    const upstream = await apiFetch('/auth/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: await request.text(),
    });

    if (upstream.ok) await clearSession();

    return relay(upstream);
  });
}
