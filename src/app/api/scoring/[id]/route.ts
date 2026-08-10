import type { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

type Params = { params: Promise<{ id: string }> };

/**
 * One analysis, by its own id.
 *
 * IT EXISTS SO A SCORE OUTLIVES THE TAB THAT ASKED FOR IT. The analysis flow held everything in React
 * state, so a refresh on the results step threw away a run the server had already stored and walked
 * the candidate back to the first step to paste the posting again. The work was never lost — only the
 * way back to it was.
 *
 * `POST /v1/scoring/score` de-duplicates a (resume, posting) pair, so re-scoring would have returned
 * the same analysis too. Reading it by id is the cheaper half of that: it creates nothing, and it
 * cannot spend a rate-limit window on a page load.
 */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withSession(async () =>
    relay(await apiFetch(`/scoring/${id}`, { headers: { Accept: 'application/json' } })),
  );
}
