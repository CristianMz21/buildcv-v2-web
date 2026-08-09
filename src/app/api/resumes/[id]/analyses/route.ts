import type { NextRequest, NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

type Params = { params: Promise<{ id: string }> };

/**
 * This CV's score history, **oldest first**.
 *
 * The only list in the API that pages forward through time rather than backward — a history is read
 * in the direction it happened. `limit` and `cursor` are forwarded rather than fixed, because there
 * is no unbounded overload and swallowing the cursor would make everything past the first page
 * unreachable.
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;

  return withSession(async () => {
    const incoming = request.nextUrl.searchParams;
    const forwarded = new URLSearchParams();

    const limit = incoming.get('limit');
    const cursor = incoming.get('cursor');
    if (limit) forwarded.set('limit', limit);
    if (cursor) forwarded.set('cursor', cursor);

    const query = forwarded.size > 0 ? `?${forwarded}` : '';
    return relay(
      await apiFetch(`/resumes/${id}/analyses${query}`, { headers: { Accept: 'application/json' } }),
    );
  });
}
