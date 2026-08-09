import { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';
import { isResumeSection } from '@/lib/sections';

type Params = { params: Promise<{ id: string; section: string; itemId: string }> };

/**
 * Removes one entry, named by the id `GET /api/resumes/{id}` handed out.
 *
 * `itemId` is NOT a position. The API resolves it against the CV the requester is allowed to load, so
 * an id that names no entry of this CV is a 404 — including one that is perfectly valid for a
 * different CV, since ids are unique only within one.
 */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id, section, itemId } = await params;

  if (!isResumeSection(section)) {
    return NextResponse.json(
      { status: 404, title: 'Not Found', detail: `No such CV section: ${section}.` },
      { status: 404, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  return withSession(async () =>
    relay(await apiFetch(`/resumes/${id}/${section}/${itemId}`, { method: 'DELETE' })),
  );
}
