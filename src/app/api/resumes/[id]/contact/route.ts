import type { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

type Params = { params: Promise<{ id: string }> };

/**
 * Replaces the CV's contact block.
 *
 * A static segment, so Next.js routes it here rather than to the `[section]` handler beside it —
 * which is correct, because contact is NOT one of the ten collections. It is a single owned value
 * with a PUT, the only part of a CV that is updated in place rather than appended to and removed
 * from.
 */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;

  return withSession(async () =>
    relay(
      await apiFetch(`/resumes/${id}/contact`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(await request.json()),
      }),
    ),
  );
}
