import 'server-only';

import { NextResponse } from 'next/server';

import { ApiTimeoutError, ApiUnreachableError, NoSessionError } from './backend';
import { PayloadTooLargeError } from './body';
import { clearSession } from './session';

/**
 * The answer for a body this app refused to finish reading.
 *
 * 413 is the whole message: there is no detail worth adding, because a caller sending megabytes to a
 * route that reads an email is either broken or not a caller. The limit is not quoted back — it would
 * only tell someone probing exactly how much they may send.
 */
export function tooLarge(): NextResponse {
  return NextResponse.json(
    { status: 413, title: 'Payload Too Large', detail: 'That request body is too large.' },
    { status: 413, headers: { 'content-type': 'application/problem+json' } },
  );
}

/**
 * The answer for a call the API never completed — refused, or accepted and then silent.
 *
 * NOT 500, because the two say different things to everyone who reads them: 500 is "this app is
 * broken", 5xx-upstream is "the thing behind it is not answering, try again". A load balancer, a
 * monitor and a candidate all act differently on that.
 *
 * The sentence says whose fault it is out loud. Until this existed, an outage and a wrong password
 * produced the same words on the sign-in screen, so every one of our failures arrived as somebody
 * doubting their own memory.
 */
export function unreachable(error?: unknown): NextResponse {
  // A refused connection and a silent one are different diagnoses and deserve different codes: 503
  // says the thing behind this is down, 504 says it took the call and never came back. To a candidate
  // both mean "not your fault, try again" — the sentence differs only in what actually happened — but
  // to whoever reads the logs at 3am they are the difference between a crashed process and a wedged
  // one, and that is not worth flattening for the sake of a single branch.
  const timedOut = error instanceof ApiTimeoutError;

  const status = timedOut ? 504 : 503;

  const headers = new Headers({ 'content-type': 'application/problem+json' });

  // The same header `relay` copies off an answered response, set here for one that never came. A
  // client cannot tell the two apart and should not have to: `X-Correlation-ID` means the same thing
  // on both, which is "quote this and someone can find your request".
  if (error instanceof ApiUnreachableError) {
    headers.set('x-correlation-id', error.correlationId);

    // AN OUTAGE OTHERWISE LOGS NOTHING HERE. `onRequestError` fires for errors that escape a handler,
    // and this one is caught and answered properly — so without this line the API holds a record of a
    // request under an id, the browser is shown that id, and the server between them has said nothing
    // at all. Same JSON shape and same sink as instrumentation.ts, and for the same reason: no
    // headers, no bodies, nothing of the candidate's.
    console.error(
      JSON.stringify({
        level: 'error',
        at: new Date().toISOString(),
        name: error.name,
        message: error.message,
        correlationId: error.correlationId,
        status,
      }),
    );
  }

  return NextResponse.json(
    {
      status,
      title: timedOut ? 'Gateway Timeout' : 'Service Unavailable',
      detail: timedOut
        ? 'BuildCv took too long to answer and the request was given up on. This is not something you did — try again shortly.'
        : 'BuildCv is not answering right now. This is not something you did — try again shortly.',
    },
    { status, headers },
  );
}

/**
 * Hands an upstream BuildCv.Api response back to the browser unchanged.
 *
 * STATUS AND BODY ARE PASSED THROUGH, not reinterpreted. The API's error bodies are already
 * ProblemDetails — including the field-error `errors` object that `/job-offers/import` uses to name
 * a bad requirement by path — and a BFF that flattened them into its own shape would throw away the
 * only thing a form needs to mark the right input. The `content-type` is carried across for the same
 * reason: `application/problem+json` is half the API's error contract.
 */
export async function relay(upstream: Response): Promise<NextResponse> {
  const body = await upstream.text();

  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  });

  // `Retry-After` is the only thing that turns a 429 body into an instruction, and `X-Correlation-ID`
  // is what maps an error on screen to a line in the API's log. Neither survives a body-only relay,
  // and both are useless the moment they are dropped — which is why they are copied here rather than
  // re-derived by every screen.
  for (const header of ['retry-after', 'x-correlation-id']) {
    const value = upstream.headers.get(header);
    if (value !== null) headers.set(header, value);
  }

  return new NextResponse(body.length > 0 ? body : null, {
    status: upstream.status,
    headers,
  });
}

/**
 * Wraps a route handler so a missing or unrecoverable session becomes a plain 401.
 *
 * The browser can trust a 401 from this BFF, which is precisely what it cannot do against the API
 * directly: there, an idle cookie client's next unsafe request answers 403 "CSRF validation failed."
 * because the access cookie outlives the JWT it carries. Going out over bearer removes that flip, so
 * "401 means sign in again" is true here.
 */
export async function withSession(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    // Every authenticated route gets this for free by being wrapped here, which is the point: an
    // outage should not need twenty route handlers to each remember to describe it.
    if (error instanceof ApiUnreachableError) return unreachable(error);

    // Nine of the thirteen body-parsing routes read theirs inside this wrapper, so they are covered
    // here. The four that are not are the anonymous ones, which handle it themselves because they
    // have no session to wrap.
    if (error instanceof PayloadTooLargeError) return tooLarge();

    if (error instanceof NoSessionError) {
      // THE COOKIES GO WITH THE 401, and leaving them was an infinite redirect loop rather than an
      // untidiness. The page gates check that a session cookie EXISTS, not that it still works, so a
      // refresh token the API no longer accepts sent the browser round forever: /login sees a cookie
      // and forwards into the app, the app's first call 401s and sends it back to /login. Measured at
      // 184 requests before the tab was closed.
      //
      // NoSessionError means the stored credentials are unusable — either absent, or a refresh that
      // the API refused — so there is nothing here worth keeping and every reason not to.
      await clearSession();

      return NextResponse.json(
        { status: 401, title: 'Unauthorized', detail: 'Your session has ended. Sign in again.' },
        { status: 401, headers: { 'content-type': 'application/problem+json' } },
      );
    }

    throw error;
  }
}
