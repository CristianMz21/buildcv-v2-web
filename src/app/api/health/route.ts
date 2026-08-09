import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness for this container. **Touches nothing outside the process** — not the API, not the
 * session.
 *
 * The reasoning is the API's own, for the same reason: a failed liveness probe RESTARTS the
 * container, so a probe that called BuildCv.Api would roll-restart the web tier the moment the API
 * hiccuped, at the moment it can least afford a reconnection stampede. Whether the API is reachable
 * is the API's probe to answer.
 *
 * It does answer the one thing that is this container's own business: a misconfigured
 * `BUILDCV_API_ORIGIN` makes the instrumentation hook fail and every route — this one included —
 * answer 500, so an orchestrator watching this endpoint sees a start-up misconfiguration as
 * unhealthy rather than as a healthy container serving errors.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' });
}
