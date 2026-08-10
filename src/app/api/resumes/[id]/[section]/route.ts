import { NextResponse } from 'next/server';

import { apiPost } from '@/lib/backend';
import { readJsonBody } from '@/lib/body';
import { relay, withSession } from '@/lib/relay';
import { isResumeSection } from '@/lib/sections';

type Params = { params: Promise<{ id: string; section: string }> };

/**
 * Appends one entry to a CV collection.
 *
 * The response is the CV's SUMMARY, not the CV — so the editor re-reads `GET /api/resumes/{id}`
 * afterwards. That is not a wasted round trip: the summary carries no entry ids, and the id of the
 * entry just added is the thing the editor needs to be able to delete it again.
 */
export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const { id, section } = await params;

  if (!isResumeSection(section)) {
    return NextResponse.json(
      { status: 404, title: 'Not Found', detail: `No such CV section: ${section}.` },
      { status: 404, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  return withSession(async () =>
    relay(await apiPost(`/resumes/${id}/${section}`, await readJsonBody(request))),
  );
}
