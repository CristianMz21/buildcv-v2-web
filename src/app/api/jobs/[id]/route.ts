import type { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

type Params = { params: Promise<{ id: string }> };

/**
 * One job posting.
 *
 * The history screen needs it because an analysis carries only a `jobPostingId` — it names the
 * posting it scored against without saying what that posting was. A run labelled by a guid is a run
 * a candidate cannot recognise.
 */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withSession(async () =>
    relay(await apiFetch(`/jobs/${id}`, { headers: { Accept: 'application/json' } })),
  );
}
