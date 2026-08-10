import 'server-only';

/**
 * Reading a request body without letting the sender choose how much memory this process spends.
 *
 * `request.json()` HAS NO LIMIT. App Router route handlers do not inherit the 1 MB cap that Pages API
 * routes had, so a body is buffered in full before any handler line runs. Measured against the built
 * image: one 121 MB POST to `/api/auth/login` — unauthenticated, no session, no rate limit passed —
 * took the container from 56 MiB to 305 MiB of resident memory. A handful in parallel is the whole
 * container, and the deploy that caps its memory turns that into a restart.
 *
 * The multipart upload route is already safe and is the model for why this matters: it streams the
 * body straight through to the API precisely so an over-size file is refused while being read rather
 * than after being held. This is the same idea for the routes that must parse.
 */

/**
 * The ceiling for a request that carries structured data.
 *
 * 8 MiB is far above anything this product sends. The largest legitimate body is a CV draft filled to
 * every ceiling the API's validator allows — 200 skills, 50 experiences of 50 bullet points, roughly
 * 2,900 items — which the API measures at about 2.5s to process and which serialises well under this.
 * It is chosen to be unmistakably generous, because the job here is to bound memory, not to police a
 * payload the API already validates properly.
 */
export const MAX_JSON_BYTES = 8 * 1024 * 1024;

/**
 * The ceiling for the anonymous routes, which carry an email and a password and nothing else.
 *
 * They deserve their own number because they are the ones reachable WITHOUT A SESSION. Every other
 * body-parsing route is behind `withSession`, so an attacker needs an account first; these are open to
 * the internet, and 64 KiB is already thousands of times more than the fields they read.
 */
export const MAX_CREDENTIAL_BYTES = 64 * 1024;

export class PayloadTooLargeError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`Request body exceeds ${limit} bytes.`);
    this.name = 'PayloadTooLargeError';
    this.limit = limit;
  }
}

/**
 * `request.json()`, refusing to buffer more than `limit` bytes.
 *
 * The declared `Content-Length` is checked first because it costs nothing and answers the honest case
 * before a single byte is read. It is not trusted as the only check: a sender may use chunked transfer
 * encoding and declare no length at all, which is why the stream is counted as it arrives and
 * cancelled the moment it crosses the line.
 *
 * Anything else behaves exactly as `request.json()` did — a malformed body still raises the same
 * SyntaxError, and a request with no body at all is handed straight back to it.
 */
export async function readJsonBody<T>(request: Request, limit = MAX_JSON_BYTES): Promise<T> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > limit) throw new PayloadTooLargeError(limit);

  if (!request.body) return (await request.json()) as T;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > limit) {
      // Cancelled rather than left to drain: this tells the sender to stop, and releases what has
      // been read so far instead of holding it for the rest of the request.
      await reader.cancel();
      throw new PayloadTooLargeError(limit);
    }

    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(body)) as T;
}
