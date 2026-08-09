import { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';
import { isResumeSection } from '@/lib/sections';

type Params = { params: Promise<{ id: string; section: string; itemId: string }> };

/** Both handlers address an entry the same way, so they refuse an unknown section the same way too. */
function noSuchSection(section: string): NextResponse {
  return NextResponse.json(
    { status: 404, title: 'Not Found', detail: `No such CV section: ${section}.` },
    { status: 404, headers: { 'content-type': 'application/problem+json' } },
  );
}

/**
 * Removes one entry, named by the id `GET /api/resumes/{id}` handed out.
 *
 * `itemId` is NOT a position. The API resolves it against the CV the requester is allowed to load, so
 * an id that names no entry of this CV is a 404 — including one that is perfectly valid for a
 * different CV, since ids are unique only within one.
 */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const { id, section, itemId } = await params;

  if (!isResumeSection(section)) return noSuchSection(section);

  return withSession(async () =>
    relay(await apiFetch(`/resumes/${id}/${section}/${itemId}`, { method: 'DELETE' })),
  );
}

/**
 * Replaces one entry outright, in one request.
 *
 * REPLACES, not patches: the body is the same shape the POST takes, and a field it omits is cleared
 * rather than kept. That is the API's contract and this handler must not soften it by merging — a
 * merge here would need to read the entry first, and the two reads would not be one transaction.
 *
 * It is preferred over DELETE-then-POST for two reasons the API states: it is one write, so a rejected
 * replacement leaves the entry exactly as it was; and skills, certificates, languages and interests
 * refuse a duplicate name, so posting the corrected entry before removing the old one is refused by
 * the very entry it replaces.
 */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const { id, section, itemId } = await params;

  if (!isResumeSection(section)) return noSuchSection(section);

  return withSession(async () =>
    relay(
      await apiFetch(`/resumes/${id}/${section}/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(await request.json()),
      }),
    ),
  );
}
