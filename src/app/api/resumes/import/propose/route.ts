import { NextResponse } from 'next/server';

import { apiFetch } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

/**
 * Proposes a draft CV from an uploaded document. **Writes nothing.**
 *
 * The multipart body is STREAMED THROUGH rather than parsed and rebuilt. Reading it into a FormData
 * here would buffer the whole file in this process and then re-encode it under a new boundary, which
 * throws away the only reason the API takes a stream: it refuses an over-size body while reading it,
 * before anything is materialized. Forwarding the original content-type keeps the boundary the client
 * wrote.
 *
 * `duplex: 'half'` is required by fetch whenever the body is a stream; without it Node refuses to
 * send.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get('content-type');

  if (!contentType?.startsWith('multipart/form-data')) {
    return NextResponse.json(
      { status: 400, title: 'Bad Request', detail: 'Upload the document as multipart/form-data.' },
      { status: 400, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  return withSession(async () =>
    relay(
      await apiFetch('/resumes/import/propose', {
        method: 'POST',
        headers: { 'Content-Type': contentType, Accept: 'application/json' },
        body: request.body,
        // @ts-expect-error -- `duplex` is required by undici for a stream body and is missing from
        // the DOM RequestInit types Next.js ships.
        duplex: 'half',
      }),
    ),
  );
}
