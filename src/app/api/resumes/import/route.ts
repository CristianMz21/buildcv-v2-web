import type { NextResponse } from 'next/server';

import { apiPost } from '@/lib/backend';
import { relay, withSession } from '@/lib/relay';

/**
 * Creates a whole CV from one reviewed draft.
 *
 * ALL OR NOTHING. Every field is validated in one pass and a failure comes back as the `errors` object
 * of a ProblemDetails 400, keyed by field path (`experiences[2].start`) — which is why the body is
 * forwarded unchanged. Coercing anything here would move the failure to the binding boundary, where it
 * cannot carry a path and the review screen has nothing to mark.
 *
 * The draft carries `importEvidence`, the token `/import/propose` minted. It is what lets the CV record
 * what its source document looked like to a parser, and therefore what makes the readability screen's
 * parseability section apply at all. A draft posted without it creates a CV with no document signals —
 * valid, just unable to answer that one question.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return withSession(async () => relay(await apiPost('/resumes/import', await request.json())));
}
