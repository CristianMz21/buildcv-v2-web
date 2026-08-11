import 'server-only';

import { headers as requestHeaders } from 'next/headers';

import type { ProblemDetails, TokenResponse } from './contracts';
import { readSession, secondsUntilExpiry, writeSession, type Session } from './session';

/**
 * The only place this app talks to BuildCv.Api.
 *
 * Every call goes out with `Authorization: Bearer`, which is what makes the whole cookie/CSRF
 * apparatus on the other side inapplicable — see the note in `session.ts`. Nothing here ever runs in
 * the browser.
 */

/**
 * REFUSES TO START WITHOUT IT IN PRODUCTION, rather than falling back.
 *
 * The localhost default is a development convenience, and inherited by a deployed host it becomes a
 * silent outage: every call dials a port nothing is listening on, every screen reports a network
 * error, and no line anywhere says the origin was never configured.
 *
 * The dev default is 5062 because that is the port `dotnet run` binds from the API's launch
 * settings — `ASPNETCORE_URLS` does not override it.
 */
function resolveApiOrigin(): string {
  const configured = process.env.BUILDCV_API_ORIGIN;

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'BUILDCV_API_ORIGIN is required. It is the origin of BuildCv.Api and has no safe default.',
      );
    }
    return 'http://localhost:5062';
  }

  return configured.replace(/\/+$/, '');
}

let configuredOrigin: string | null = null;

/**
 * The API origin, validated ONCE on first use rather than at module load.
 *
 * THE INDIRECTION IS LOAD-BEARING, and the earlier version's premise — "this module is not loaded
 * until a route handler first runs" — was false. `next build` collects page data by importing every
 * route handler module with `NODE_ENV=production`, so resolving at module load made the BUILD
 * require a variable that only means anything at runtime. Measured: `pnpm build` on a clean `.next`
 * failed with "Failed to collect page data for /api/resumes/[id]", and `docker build` failed at
 * `RUN pnpm build` — the Dockerfile omits the variable deliberately, because it is a runtime one.
 *
 * Nothing is weakened by deferring it. `instrumentation.ts` calls `initBackend()` at server start,
 * so a deploy with no origin still refuses to serve rather than failing on a user's first sign-in.
 * A throw leaves the memo unset, so a second call re-runs the check instead of returning a value
 * that was never validated.
 */
function apiOrigin(): string {
  if (configuredOrigin !== null) return configuredOrigin;

  const origin = resolveApiOrigin();

  // The ASP.NET Core development certificate is self-signed, and Node rejects it. This is the blunt
  // escape hatch for pointing local dev at the https listener; it is refused in production so a
  // mis-set variable cannot disable certificate validation on a deployed host. It moved in here with
  // the origin check, and still runs before the first request because `initBackend()` does.
  if (process.env.BUILDCV_ALLOW_SELF_SIGNED === '1') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BUILDCV_ALLOW_SELF_SIGNED must not be set in production.');
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  configuredOrigin = origin;
  return configuredOrigin;
}

/**
 * Runs the configuration checks now, so a misconfigured deploy fails at start rather than on a
 * user's first sign-in. Idempotent; `instrumentation.ts` is the only caller.
 */
export function initBackend(): void {
  apiOrigin();
}

/** Refresh this far ahead of `exp` rather than waiting for a 401 — the client contract in CLAUDE.md. */
const REFRESH_SKEW_SECONDS = 60;

const REFRESH_COOKIE_NAME = 'refresh_token';

export class NoSessionError extends Error {
  constructor() {
    super('No BuildCv session.');
    this.name = 'NoSessionError';
  }
}

/**
 * The call never reached BuildCv.Api at all — no status, no body, no answer.
 *
 * IT IS A DIFFERENT FAILURE FROM ANY THE API CAN RETURN, and until it had a name it did not look
 * like one. `fetch` rejects with a bare TypeError, the route handler let it escape, Next answered a
 * generic 500, and the sign-in form fell through to "Sign-in failed." — the exact sentence a wrong
 * password produces. Every outage read to the candidate as their own typo, and to us as a support
 * queue we could not tell apart.
 */
export class ApiUnreachableError extends Error {
  /**
   * The id this BFF sent upstream on the call that failed.
   *
   * IT IS THE ONLY THREAD LEFT when a call fails on this side. `relay` copies the API's
   * `X-Correlation-ID` back on any answered request, but a call that was never answered has no
   * response to copy from — and that is precisely the case where somebody needs to go looking.
   */
  readonly correlationId: string;

  constructor(cause: unknown, correlationId: string, message = 'BuildCv.Api could not be reached.') {
    super(message, { cause });
    this.name = 'ApiUnreachableError';
    this.correlationId = correlationId;
  }
}

/**
 * How long one call to BuildCv.Api may take before it is abandoned.
 *
 * NODE'S `fetch` HAS NO DEFAULT TIMEOUT, and without this a hung API hung this app with it: the route
 * handler waits on a socket that will never answer, the candidate watches a spinner with no end, and
 * the connection stays held — so a slow API does not degrade this app, it exhausts it. A refused
 * connection was already handled; a connection that is accepted and then goes silent is the failure
 * that looks like nothing at all.
 *
 * 20s is far longer than any call here legitimately takes and far shorter than "never". Measured on
 * the API side at the documented ceilings, not guessed: `/resumes/import/propose` costs 4.1s for a
 * 5 MiB document, `/job-offers/import` 2.7s for 100 requirements, `/scoring/score` 2.5s for 200
 * skills against 100 requirements, and a CV filled to every limit — 200 skills, 50 experiences of 50
 * bullets, ~2,900 items — reads in 0.4s. Nothing is within five times of this budget.
 *
 * The one to watch is `/import/propose`, and it is not the one guessed first: it is the only endpoint
 * whose cost is set by a file SOMEBODY ELSE CHOSE, and it parses inside the request because the API
 * has no background jobs. Read those numbers as a shape rather than a capacity — one request at a
 * time, no contention. If an endpoint ever does need more, give that call its own budget rather than
 * raising this for everything.
 *
 * RAISING THIS NUMBER IS A DEPLOYMENT CHANGE, not just a code one. The shutdown grace period has to
 * outlast the longest request the app will wait on, and the common defaults do not: Docker gives 10s,
 * so a request still running at that point is SIGKILLed and its caller gets a severed connection with
 * no status at all. Measured — see the deployment section of the README, which carries both halves.
 */
const API_TIMEOUT_MS = 20_000;

/**
 * The API accepted the connection and then did not answer in time.
 *
 * EXTENDS `ApiUnreachableError` DELIBERATELY. Four anonymous routes and `withSession` already catch
 * that type, so a timeout cannot escape as a bare 500 through a handler nobody remembered to update —
 * the subclass makes correct handling the default and the distinction an improvement on top.
 */
export class ApiTimeoutError extends ApiUnreachableError {
  constructor(cause: unknown, correlationId: string) {
    super(cause, correlationId, `BuildCv.Api did not answer within ${API_TIMEOUT_MS / 1000}s.`);
    this.name = 'ApiTimeoutError';
  }
}

/**
 * `fetch`, bounded in time, carrying an id, with a transport failure named rather than left as a bare
 * TypeError.
 *
 * THE ID IS SENT, NOT JUST READ BACK. `X-Correlation-ID` was only ever copied off the API's response
 * here, which works for every request the API answers and leaves nothing at all for the ones it does
 * not. A timeout is the case that hurts: the API *did* receive the call — it accepted the connection —
 * so it has a log line for work this side gave up waiting on, and without a shared id there is no way
 * to find it. The API honours an inbound id rather than minting its own, so sending one makes the two
 * logs describe the same request in the same word.
 */
/**
 * The address of whoever is actually using the product, for the API to rate-limit on.
 *
 * WITHOUT THIS THE WHOLE DEPLOYMENT IS ONE CLIENT. The API partitions every limiter on
 * `Connection.RemoteIpAddress`, and in a BFF that address is this container for every request anyone
 * makes. Measured through a proxy by the API session: seven sign-ins from seven different addresses
 * answered `400 400 400 400 429 429 429`. Five failed sign-ins by anybody — a bot, a typo, one
 * confused person — and nobody else can sign in, register, refresh a token or ask for a password
 * reset for a minute. The global limiter is worse and quieter: 100 requests a minute for EVERYONE,
 * across every endpoint, which a dozen people browsing will reach without doing anything unusual.
 *
 * `CF-Connecting-IP` FIRST, AND THE REASON IS MEASURED. Azure's external ingress does not append to
 * `X-Forwarded-For`, it **replaces** it with the address it sees — so once Cloudflare is in front, the
 * only thing that header can ever say is "Cloudflare". Reading its last hop then hands the API an edge
 * address, and every person behind the same Cloudflare PoP shares one rate-limit bucket. That is the
 * original bug moved one layer out, and it is this file's to fix, because the API partitions on
 * whatever this function chooses to send.
 *
 * Cloudflare sets `CF-Connecting-IP` to the real client and **refuses any request that arrives with a
 * client-supplied one**: a forged `CF-Connecting-IP: 7.7.7.7` answers 403 from `server: cloudflare` in
 * plain text, while the identical request without it reaches the API and answers 400. So the header
 * cannot be forged from outside, which is the property that makes it safe to prefer.
 *
 * `True-Client-IP` is NOT protected the same way — the same probe carrying a forged one passed
 * straight through to a 400. It is Enterprise-only on Cloudflare and forgeable here, so it is
 * deliberately not read.
 *
 * THE LAST HOP OF THE FALLBACK, NOT THE FIRST. Where no `CF-Connecting-IP` exists, a proxy appends the
 * peer it saw, so the final entry is the one the trusted proxy observed and the only one a caller
 * cannot choose. Reading the first would let anyone set `X-Forwarded-For` and mint a fresh bucket per
 * request — strictly worse than the shared bucket this fixes, because today's problem is at least
 * visible.
 *
 * OFF UNLESS `BUILDCV_TRUST_PROXY=1`, and the reason is measured rather than assumed. **Next passes a
 * client-supplied `X-Forwarded-For` through unchanged — it does not append the socket address.** Sent
 * `1.2.3.4, 203.0.113.9` from curl and the header arrived exactly so, with no `::1` added; sent none
 * and Next synthesised the real peer instead. So with no proxy overwriting the header on ingress, a
 * caller can name any address it likes and this would forward it, minting a fresh bucket per request.
 * A wrong `true` is a silent hole; a wrong `false` is the behaviour we already have.
 *
 * The API needs its half too — `Network:ForwardedHeaders` naming this container in `KnownProxies` —
 * and each half is inert alone. Verified on that side by sending a spoofed header through the proxy
 * and watching the API record this container's address anyway.
 */
async function clientAddress(): Promise<string | null> {
  if (process.env.BUILDCV_TRUST_PROXY !== '1') return null;

  try {
    const incoming = await requestHeaders();

    // Cloudflare's own, unforgeable because Cloudflare refuses a request that carries one. A single
    // value rather than a chain, so there is no hop to count and nothing for an intermediate rewrite
    // to truncate.
    const cloudflare = incoming.get('cf-connecting-ip')?.trim();
    if (cloudflare) return cloudflare;

    const forwarded = incoming.get('x-forwarded-for');
    if (!forwarded) return null;

    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);

    return hops.at(-1) ?? null;
  } catch {
    // `headers()` throws outside a request scope. Nothing here calls the API from one, but a caller
    // that did should lose the address rather than the request.
    return null;
  }
}

async function reach(url: string, init: RequestInit): Promise<Response> {
  // The GLOBAL Web Crypto, not `node:crypto`. Importing `randomUUID` from `node:crypto` builds and
  // ships fine — `pnpm build`, the container and every header check passed with it — and then breaks
  // `next dev` outright: webpack refuses the `node:` scheme while compiling this module and the dev
  // server never comes up. Found by the a11y suite, which is the only check here that starts one.
  const correlationId = crypto.randomUUID();

  // Built from `init.headers` rather than spread over it: Authorization and Content-Type are set by
  // the callers, and a plain object spread would drop a `Headers` instance silently.
  const headers = new Headers(init.headers);
  headers.set('X-Correlation-ID', correlationId);

  // One address, not the chain. The API's ForwardedHeaders middleware takes the rightmost entry and
  // pops known proxies; handing it exactly the client it should charge leaves nothing to get wrong.
  const client = await clientAddress();
  if (client) headers.set('X-Forwarded-For', client);

  try {
    return await fetch(url, { ...init, headers, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  } catch (cause) {
    // `AbortSignal.timeout` rejects with a DOMException named TimeoutError. Matching on the name
    // rather than the class because DOMException identity is not something to depend on across
    // runtimes, and the fallback below is correct for anything unrecognised.
    if (cause instanceof Error && cause.name === 'TimeoutError') {
      throw new ApiTimeoutError(cause, correlationId);
    }
    throw new ApiUnreachableError(cause, correlationId);
  }
}

function apiUrl(path: string): string {
  if (!path.startsWith('/')) throw new Error(`API path must be absolute: ${path}`);
  return `${apiOrigin()}/v1${path}`;
}

/**
 * Pulls the opaque refresh token out of the API's `Set-Cookie` headers.
 *
 * The API only ever delivers it as an httpOnly cookie scoped to `/v1/auth/refresh`; there is no
 * field for it in any response body. An empty value means the API cleared it — a logout or a
 * revocation — and is reported as absent rather than stored as the string "".
 */
function refreshTokenFrom(response: Response): string | null {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    if (!pair) continue;

    const separator = pair.indexOf('=');
    if (separator === -1) continue;

    if (pair.slice(0, separator).trim() !== REFRESH_COOKIE_NAME) continue;

    const value = pair.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }

  return null;
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return { status: response.status, title: 'Unexpected error', detail: response.statusText };
  }
}

export type LoginOutcome =
  | { ok: true; session: Session; expiresIn: number }
  /**
   * `retryAfter` is the API's own `Retry-After`, in seconds, and it is carried because login is the
   * most throttled route in the product: 5 a minute per client address, shared behind NAT or a
   * delegated IPv6 /64. Without it the form can only guess at a wait, and a guess that is short
   * invites the retry that extends the window.
   */
  | { ok: false; status: number; problem: ProblemDetails; retryAfter: string | null };

/**
 * Exchanges credentials for a session. `/v1/auth/login` is `AllowAnonymous` and CSRF-exempt, and it
 * returns the access token in the body while delivering the refresh token as a cookie — so both
 * halves have to be collected from different places.
 */
export async function login(email: string, password: string): Promise<LoginOutcome> {
  const response = await reach(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      problem: await readProblem(response),
      retryAfter: response.headers.get('Retry-After'),
    };
  }

  const token = (await response.json()) as TokenResponse;
  const refreshToken = refreshTokenFrom(response);

  if (!refreshToken) {
    // Reachable only if the API stops setting the cookie. Failing loudly beats storing half a
    // session that dies silently at the first access-token expiry.
    return {
      ok: false,
      status: 502,
      problem: { status: 502, title: 'Bad gateway', detail: 'The API issued no refresh token.' },
      retryAfter: null,
    };
  }

  return {
    ok: true,
    session: { accessToken: token.accessToken, refreshToken },
    expiresIn: token.expiresIn,
  };
}

/**
 * Creates an account. **Anonymous**, so it cannot go through `apiFetch` — there is no session yet,
 * and `apiFetch` refuses without one.
 *
 * No role is sent. The API defaults to Candidate, and only Candidate and Recruiter are
 * self-assignable anyway; putting the choice on a public form would be a privilege question asked of
 * a stranger.
 */
export async function register(email: string, password: string): Promise<Response> {
  return anonymousPost('/auth/register', { email, password });
}

/**
 * A POST with no session, for the routes that exist precisely because there is not one.
 *
 * Registering, and recovering a forgotten password. `apiFetch` refuses without a session and is right
 * to — every other call in this app has one — so these need their own way out rather than an
 * exception carved into the one that guards the rest.
 */
export function anonymousPost(path: string, body: unknown): Promise<Response> {
  return reach(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

/**
 * Trades the stored refresh token for a fresh pair, persisting both.
 *
 * The refresh token ROTATES — the API issues a new one on every successful refresh — so failing to
 * store what comes back would strand the session at the next expiry.
 */
async function refresh(session: Session): Promise<Session | null> {
  const response = await reach(apiUrl('/auth/refresh'), {
    method: 'POST',
    // Sent as a header rather than through a cookie jar: this is a server-to-server call with no
    // browser in it, and the API reads the value straight off Request.Cookies.
    headers: { Cookie: `${REFRESH_COOKIE_NAME}=${session.refreshToken}` },
    cache: 'no-store',
  });

  if (!response.ok) return null;

  const token = (await response.json()) as TokenResponse;
  const rotated = refreshTokenFrom(response) ?? session.refreshToken;
  const refreshed: Session = { accessToken: token.accessToken, refreshToken: rotated };

  await writeSession(refreshed);
  return refreshed;
}

/**
 * Calls BuildCv.Api on behalf of the signed-in account.
 *
 * Refresh is PROACTIVE, driven by the token's own `exp`, which is the contract CLAUDE.md states for
 * this API. The reactive 401 retry below is a safety net for clock skew and for a token revoked
 * mid-flight, not the primary mechanism — a client that only reacts to 401 is the one that breaks.
 *
 * @throws NoSessionError when there is nothing to authenticate with. Route handlers turn this into a
 *   401 so the browser knows to send the user back to the sign-in screen.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let session = await readSession();
  if (!session) throw new NoSessionError();

  if (secondsUntilExpiry(session.accessToken) < REFRESH_SKEW_SECONDS) {
    const refreshed = await refresh(session);
    if (!refreshed) throw new NoSessionError();
    session = refreshed;
  }

  const send = (bearer: string) =>
    reach(apiUrl(path), {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${bearer}` },
      cache: 'no-store',
    });

  const response = await send(session.accessToken);
  if (response.status !== 401) return response;

  const retried = await refresh(session);
  if (!retried) throw new NoSessionError();

  return send(retried.accessToken);
}

/** `apiFetch` for JSON bodies, with the two headers every write needs. */
export function apiPost(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

export { apiUrl };
