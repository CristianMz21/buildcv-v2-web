import type { ProblemDetails } from './contracts';

/**
 * The session is gone and the only useful action is signing in again.
 *
 * A separate type rather than a message, because a screen's response to it is a redirect and not a
 * banner — the BFF has already cleared the cookies by the time this is thrown.
 */
export class SessionExpired extends Error {}

/** An API failure, carrying the field paths a form needs to mark the right input. */
export interface RequestFailure extends Error {
  status: number;
  fieldErrors: Record<string, string[]>;
  /** The id this request was logged under, when the response carried one. */
  correlationId?: string;
}

/**
 * How long the API said to wait, in whole seconds, or null.
 *
 * `Retry-After` is a real header on the API's 429s and it is the only thing that turns "too many
 * requests" into an instruction. It reaches the browser because `relay` carries it across; a BFF that
 * kept only the body would leave every throttled screen guessing.
 *
 * The date form of the header is not read: this API only ever sends the delta-seconds form, and
 * parsing a shape nothing sends is a branch no test can cover.
 */
export function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (header === null) return null;

  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/** "in 45 seconds" / "in 2 minutes", or a plain instruction when the API did not say. */
export function waitFor(response: Response): string {
  const seconds = retryAfterSeconds(response);
  if (seconds === null) return 'Wait a moment before trying again.';
  if (seconds < 90) return `Wait ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`;

  const minutes = Math.ceil(seconds / 60);
  return `Wait ${minutes} minute${minutes === 1 ? '' : 's'} before trying again.`;
}

/**
 * Reads a BFF response, or throws what the screen needs to say.
 *
 * ONE COPY. Three screens had grown their own, and they had already drifted — one carried field errors
 * on the thrown error and another did not, so the same 400 marked inputs on one screen and produced a
 * bare sentence on the next.
 *
 * The generic is an ASSERTION, not a check, and that is worth remembering here of all places: an
 * explicit `readJson<PagedResponse<ResumeResponse>>` is what let the compiler agree that a summary row
 * carried entries. Name the type the route actually returns.
 */
export async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new SessionExpired();

  if (!response.ok) throw await failureOf(response);

  return (await response.json()) as T;
}

/** The thrown value for a non-2xx, with the throttle case said in a way a caller can act on. */
export async function failureOf(response: Response): Promise<RequestFailure> {
  const problem = (await response.json().catch(() => ({}))) as ProblemDetails;

  const message =
    response.status === 429
      ? `Too many requests. ${waitFor(response)}`
      : (problem.detail ?? problem.title ?? `Request failed (${response.status}).`);

  const failure = new Error(message) as RequestFailure;
  failure.status = response.status;
  failure.fieldErrors = problem.errors ?? {};
  // The last hop of a chain that already exists and, until now, ended here. `reach()` mints an id per
  // upstream call and sends it, the API writes its log line under that same word rather than minting
  // its own, `relay` copies it back onto the response and `unreachable()` prints it to stdout. Every
  // one of those was built so a failure could be found afterwards — and the browser threw the id away,
  // which left a person able to say only "it broke" and nobody able to look it up.
  failure.correlationId = response.headers.get('x-correlation-id') ?? undefined;
  return failure;
}

/**
 * The id a thrown failure was logged under, or null.
 *
 * Deliberately shaped like `fieldErrorsOf` — a caught value is `unknown`, and a screen that reached
 * into it directly would be one `instanceof` check away from rendering `undefined` at somebody.
 *
 * It is worth showing ONLY where the id genuinely exists on both sides. An outage answers 503 or 504
 * with the id `reach()` minted, and the API holds a matching record for a timeout because it accepted
 * the connection before going quiet. A 400 from a form does not need one — the message already says
 * what to fix, and a reference number beside "enter a valid email" is noise dressed as rigour.
 */
export function correlationIdOf(error: unknown): string | null {
  const carried = (error as { correlationId?: string } | null)?.correlationId;
  return carried != null && carried !== '' ? carried : null;
}

/** The field errors carried on a thrown failure, or none. */
export function fieldErrorsOf(error: unknown): Record<string, string[]> {
  const carried = (error as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors;
  return carried ?? {};
}

/** What to show the user for a caught error, without leaking a stack or a `[object Object]`. */
export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}
