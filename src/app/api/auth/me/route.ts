import type { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

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
