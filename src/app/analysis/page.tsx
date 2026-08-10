import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/session';

import { AnalysisFlow } from './AnalysisFlow';

// Every other signed-in screen names itself in the tab; this one is the longest-lived of them, since
// a candidate leaves it open while reading the posting in another tab.
export const metadata: Metadata = { title: 'New analysis · BuildCv' };

/**
 * The gate only — every read of BuildCv.Api happens through a route handler, never here.
 *
 * A Server Component cannot write cookies in Next.js, so fetching from one would leave the proactive
 * refresh with nowhere to store the rotated token: the refresh would succeed, the new pair would be
 * thrown away, and the session would die at the next expiry. Keeping all API traffic in route
 * handlers keeps refresh in exactly one place.
 */
export default async function AnalysisPage() {
  if (!(await readSession())) redirect('/login');

  return <AnalysisFlow />;
}
