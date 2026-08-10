import type { NextRequest, NextResponse } from 'next/server';

import { apiFetch, apiPost } from '@/lib/backend';
import { readJsonBody } from '@/lib/body';
import { relay, withSession } from '@/lib/relay';

/**
 * The CV list.
 *
 * A summary per row — contact basics, timestamps and the SIZE of each section, never the entries. So
 * this is not the route to read a CV from: `GET /api/resumes/{id}` is, and it is the only one that
 * carries the entry ids the editor deletes by.
 *
 * `limit` and `cursor` are forwarded rather than fixed here. There are no unbounded list methods on
 * any BuildCv repository — every list is keyset-paginated, `limit` is clamped into 1..100 server-side,
 * and a cursor that will not decode is a 400 rather than a silent restart at page one. Swallowing
 * either parameter would make the second page unreachable.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return withSession(async () => {
    const incoming = request.nextUrl.searchParams;
    const forwarded = new URLSearchParams();

    const limit = incoming.get('limit');
    const cursor = incoming.get('cursor');
    if (limit) forwarded.set('limit', limit);
    if (cursor) forwarded.set('cursor', cursor);

    const query = forwarded.size > 0 ? `?${forwarded}` : '';
    return relay(await apiFetch(`/resumes${query}`, { headers: { Accept: 'application/json' } }));
  });
}

/**
 * Creates an empty CV from the contact information the API requires.
 *
 * `fullName` and `email` are not optional server-side — a CV with no one on it is not a CV — so the
 * form asks for both rather than posting blanks and rendering the field errors that come back.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return withSession(async () => relay(await apiPost('/resumes', await readJsonBody(request))));
}
