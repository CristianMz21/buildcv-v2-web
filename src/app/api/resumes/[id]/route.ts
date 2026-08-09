import type { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

type Params = { params: Promise<{ id: string }> };

/**
 * One CV in full — the only route that carries entry ids.
 *
 * The editor reads from here and nowhere else. Each entry's `id` is what
 * `DELETE /api/resumes/{id}/{section}/{itemId}` takes; positions in these arrays are not addressable,
 * because the store returns each collection as a set and a position can name a different entry
 * between two reads.
 */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withSession(async () =>
    relay(await apiFetch(`/resumes/${id}`, { headers: { Accept: 'application/json' } })),
  );
}

/**
 * Deletes a CV and everything derived from it.
 *
 * The API cascades to the analyses and readability reports keyed by this resume — there is no foreign
 * key for the engine to follow, so that cascade is code, and it is what makes "delete my CV" mean it.
 * Irreversible; the caller confirms.
 */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withSession(async () => relay(await apiFetch(`/resumes/${id}`, { method: 'DELETE' })));
}
