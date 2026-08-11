import 'server-only';

import { SITE_ORIGIN } from './site';

/**
 * Signing in with Google, done as a server-side redirect rather than with Google's own button.
 *
 * THE SDK WAS REJECTED ON THE CONTENT SECURITY POLICY, and that is not a preference. Google Identity
 * Services is a `<script>` from `accounts.google.com` that talks to Google from the browser, so it
 * needs `script-src`, `frame-src` and — fatally — `connect-src` opened to a third party.
 * `connect-src 'self'` is the directive that ENFORCES this repo's central rule: the browser calls
 * nobody but us. Punching a hole in it for a button, on an origin that renders somebody's CV, is a
 * bad trade.
 *
 * A top-level navigation is governed by neither `connect-src` nor `script-src`. So the browser simply
 * navigates: to us, to Google, back to us. `next.config.ts` is untouched, no third-party script ever
 * loads, and the tokens stay in httpOnly cookies on this origin exactly as they do for a password
 * sign-in. `verify-image.sh` already asserts the CSP, so that check staying green is the proof this
 * design kept its promise.
 *
 * CONFIGURATION IS THE SWITCH, and that is load-bearing rather than convenient. `isConfigured()` is
 * read by the sign-in screens AND by the privacy page, so the button cannot appear without the
 * disclosure appearing with it — they cannot disagree, because they are the same question. This repo
 * has already published a privacy page that was false about a third party for an hour; a flag that
 * two files read separately is how that happens again.
 */
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * `openid email` and nothing else.
 *
 * `profile` would hand over a name and a picture this product has no use for — the account model
 * knows an email and a role. Asking for less is both the honest thing to put on a consent screen and
 * one fewer thing to describe on the privacy page.
 */
const SCOPES = 'openid email';

/** Google's token endpoint gets the same treatment as the API: bounded, because `fetch` is not. */
const TOKEN_TIMEOUT_MS = 10_000;

export const STATE_COOKIE = 'buildcv_oauth_state';
export const VERIFIER_COOKIE = 'buildcv_oauth_verifier';

/**
 * Where Google is told to come back to.
 *
 * Built from `SITE_ORIGIN` rather than from the incoming request, and that is deliberate: Google
 * matches this string EXACTLY against the authorised redirect URI registered in the console, so a
 * value that varied with the hostname a visitor arrived by would fail for every hostname but one —
 * and fail with an error page from Google rather than from us.
 */
export const REDIRECT_URI = `${SITE_ORIGIN}/api/auth/google/callback`;

/**
 * Whether this deployment can offer Google at all.
 *
 * Resolved through a function rather than a module constant, for the reason `instrumentation.ts`
 * exists: `next build` collects page data by importing every route handler with
 * `NODE_ENV=production`, so a module-level read that threw would make the build itself demand a
 * runtime-only variable. That failure already cost this repo a `docker build`.
 */
export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to sign in with Google.');
  }

  return { clientId, clientSecret };
}

/**
 * base64url, which is what OAuth means every time it says base64.
 *
 * `+`, `/` and `=` are not URL-safe and a `code_challenge` travels in a query string; sending
 * standard base64 produces a challenge Google accepts and then fails to match at the token exchange,
 * which surfaces as `invalid_grant` and says nothing about why.
 */
function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...view)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * `crypto` off the global, NOT `node:crypto`.
 *
 * The `node:` scheme builds fine, runs fine in the container and passes every image check — and
 * breaks `next dev`, because webpack refuses to resolve it in a module the client graph can reach.
 * That cost a full round of green checks here once; the only thing that caught it was the one suite
 * that starts a dev server.
 */
function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

/** The URL to send somebody to, plus the two secrets that have to survive the round trip. */
export async function authorization(): Promise<{ url: string; state: string; verifier: string }> {
  const { clientId } = credentials();

  const state = randomToken();
  const verifier = randomToken();

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', await challengeFor(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  // Without this Google returns no refresh token and, more importantly here, silently reuses a prior
  // consent — which makes "sign in as a different account" impossible on a shared machine.
  url.searchParams.set('prompt', 'select_account');

  return { url: url.toString(), state, verifier };
}

/**
 * Trades the authorization code for Google's signed id_token.
 *
 * THE ID TOKEN IS NOT VERIFIED HERE, and that is the design rather than an omission. It is forwarded
 * to the API, which checks the signature against Google's JWKS itself. If this side merely asserted
 * "the email is X", anything that reached the internal API could claim to be anyone; the server being
 * the authority on identity is what every other part of this system already does.
 */
export async function exchange(code: string, verifier: string): Promise<string> {
  const { clientId, clientSecret } = credentials();

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Google's body is echoed into the log and never into the response: it can name the client id and
    // the redirect URI, which belong in a server log and not in front of whoever just clicked.
    const detail = await response.text().catch(() => '');
    throw new Error(`Google refused the code exchange (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { id_token?: string };
  if (!payload.id_token) throw new Error('Google returned no id_token.');

  return payload.id_token;
}
