/**
 * Runs once when the server starts, before it accepts a request.
 *
 * IT EXISTS BECAUSE THE CHECK IN `backend.ts` IS LAZY. The origin is resolved on first use, so a
 * deployment with no `BUILDCV_API_ORIGIN` would start cleanly, serve `/login` with a 200, and only
 * fail when somebody signs in — a 500 on a user's first action rather than a refusal to start.
 * Measured: without this, `GET /login` answered 200 and `GET /api/auth/me` answered 500 with the
 * error in the log.
 *
 * CALLING `initBackend()` is the mechanism, and importing the module is not enough: the check used
 * to run at module load, which also made `next build` require the variable while collecting page
 * data. Moving it behind a function fixed the build; calling it here is what keeps the deploy-time
 * failure this file exists for.
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

  const { initBackend } = await import('./lib/backend');
  initBackend();
}

/**
 * Every server-side error, as one line a log aggregator can filter.
 *
 * UNTIL THIS EXISTED THERE WAS NO SIGNAL AT ALL. The client boundary in `error.tsx` calls
 * `console.error` in the browser, where only the person already having the bad time can see it, and
 * nothing on the server said anything. A deployment could be answering 500 to every sign-in and the
 * first report would be a candidate emailing to say the site is broken.
 *
 * WHAT IS DELIBERATELY NOT HERE is the point of the shape. No headers — they carry `bcv_access` and
 * `bcv_refresh`, and a log with a session cookie in it is a log that can impersonate the user it
 * describes. No request body, no response body: those are the candidate's CV. The path, the method
 * and the route are enough to find the fault and none of them is theirs.
 *
 * JSON rather than prose for the same reason the API turned on its own JSON formatter: an aggregator
 * cannot filter on a field it has to parse out of a sentence. `stdout` is the sink — that is what a
 * container platform collects, and it is the one place this can go without shipping a candidate's
 * data to a third party to be helpful.
 */
export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  const fault = error instanceof Error ? error : new Error(String(error));

  console.error(
    JSON.stringify({
      level: 'error',
      at: new Date().toISOString(),
      name: fault.name,
      message: fault.message,
      stack: fault.stack,
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
    }),
  );
}
