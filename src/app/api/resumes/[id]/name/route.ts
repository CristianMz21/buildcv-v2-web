import type { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { readJsonBody } from '@/lib/body';
import { relay, withSession } from '@/lib/relay';

type Params = { params: Promise<{ id: string }> };

/**
 * Names a CV, or clears the name.
 *
 * A static segment, so Next.js routes it here rather than to the `[section]` handler beside it: a
 * name is not one of the ten collections. Null or blank CLEARS rather than storing an empty string —
 * a candidate cannot tell "not named" from "named nothing", so the API treats them as one state.
 */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;

  return withSession(async () =>
    relay(
      await apiFetch(`/resumes/${id}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(await readJsonBody(request)),
      }),
    ),
  );
}
