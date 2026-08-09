/**
 * Runs once when the server starts, before it accepts a request.
 *
 * IT EXISTS BECAUSE THE CHECK IN `backend.ts` IS LAZY. That module is only loaded when a route
 * handler first runs, so a deployment with no `BUILDCV_API_ORIGIN` starts cleanly, serves `/login`
 * with a 200, and only fails when somebody signs in — a 500 on a user's first action rather than a
 * refusal to start. Measured: without this, `GET /login` answered 200 and `GET /api/auth/me`
 * answered 500 with the error in the log.
 *
 * Importing the module here is the whole mechanism: its top-level check runs at server start.
 *
 * A throw here does NOT exit the process — Next logs "Failed to prepare server" and then answers 500
 * on every route, including `/login`. That is still the behaviour worth having: the failure is total
 * and immediate rather than hidden behind a sign-in page that renders perfectly, and the cause is
 * named once in the log where a deploy check will see it. A container orchestrator should be given a
 * health probe rather than trusting the process to die.
 */
export async function register() {
  // Node only. The edge runtime has no route handlers here and importing the backend client, which
  // reaches for `Buffer`, would fail for a reason unrelated to configuration.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  await import('./lib/backend');
}
