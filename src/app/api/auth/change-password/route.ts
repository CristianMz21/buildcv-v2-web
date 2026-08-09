import type { NextResponse } from 'next/server';

import { apiPost } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';
import { clearSession } from '@/lib/session';

/**
 * Changes the password and ends every session, including this one.
 *
 * THE SIGN-OUT IS THE POINT, not a side effect. A successful change revokes every refresh token on
 * the account server-side — that is what makes changing a password after a leak mean something. The
 * local session is cleared to match, because keeping cookies the store no longer honours would leave
 * the browser looking signed in until its next call failed.
 *
 * Throttled per ACCOUNT rather than per IP: sharing the per-IP auth window let one client behind a
 * NAT deny password rotation to everyone on that address. A 429 here is about this account.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return withSession(async () => {
    const body = await request.json();
    const upstream = await apiPost('/auth/change-password', body);

    if (upstream.ok) await clearSession();
    return relay(upstream);
  });
}
