import 'server-only';

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
  constructor(cause: unknown) {
    super('BuildCv.Api could not be reached.', { cause });
    this.name = 'ApiUnreachableError';
  }
}

/** `fetch`, with a transport failure named rather than left as a bare TypeError. */
async function reach(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    throw new ApiUnreachableError(cause);
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
