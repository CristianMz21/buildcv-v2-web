import type { NextResponse } from 'next/server';

import { apiPost } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

type Params = { params: Promise<{ id: string }> };

/**
 * Scores how this CV reads, with no job posting involved.
 *
 * A POST because it CREATES a report — this is not a view of stored state, it is a run, and each one
 * is a fact recorded against the CV as it stood at that moment. Deleting the CV takes them with it.
 *
 * A static segment, so Next.js routes it here rather than to the `[section]` handler: readability is
 * not one of the ten collections.
 */
export async function POST(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return withSession(async () => relay(await apiPost(`/resumes/${id}/readability`, {})));
}
