#!/usr/bin/env node
//
// Every API operation this BFF calls must exist in the committed contract.
//
// NOTHING ELSE HERE CHECKS THIS. `gen:types:check` proves api-schema.d.ts matches openapi.json, and
// `gen:api:check` proves openapi.json matches a LIVE API — which needs the other repository running,
// so it never runs in CI. Between the two sits the question neither asks: does the app call things
// the contract describes?
//
// It went unanswered long enough to be wrong. Three operations were being called that the committed
// contract did not declare — password reset, its confirmation, and DELETE on /auth/me — every one of
// them behind a screen shipped this week. Nothing failed, because route handlers relay untyped: the
// path is a string, the body is passed through, and `tsc` has no opinion about either.
//
// Runs against files. No API, no network, no credentials.

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const CONTRACT = 'openapi.json';

/**
 * `/resumes/${id}/${section}` and `/v1/resumes/{id}/{section}` are the same operation written twice.
 * Both collapse to `/resumes/{}/{}` so they can be compared: the parameter NAMES are free to differ
 * between a template literal here and the API's route template, and only the shape is the contract.
 *
 * A trailing `${query}` is a query string rather than a segment — `/resumes${query}` is `/resumes` —
 * so it is dropped rather than turned into a parameter.
 */
function shape(path) {
  return path
    .replace(/\$\{query\}$/, '')
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/$/, '');
}

/**
 * `${section}` is not a path parameter — it is one of ten names from a closed list, and the contract
 * declares each of them separately (`/v1/resumes/{id}/skills`, `/experiences`, …). Treating it as a
 * parameter was this script's first bug: it reported three real routes as undeclared because
 * `/resumes/{}/{}`  matches nothing.
 *
 * Expanding it instead makes the check STRONGER than the version that was wrong. Add a name to
 * RESUME_SECTIONS that the API does not serve and this fails, which is the failure the closed list in
 * `src/lib/sections.ts` exists to prevent and could not previously detect.
 */
const SECTIONS = (
  readFileSync('src/lib/contracts.ts', 'utf8').match(/export const RESUME_SECTIONS = \[([\s\S]*?)\]/)?.[1] ?? ''
)
  .split(',')
  .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
  .filter(Boolean);

if (SECTIONS.length === 0) {
  console.error('Could not read RESUME_SECTIONS from src/lib/contracts.ts — refusing to report a pass.');
  process.exit(1);
}

const contract = JSON.parse(readFileSync(CONTRACT, 'utf8'));

// The contract is served under /v1 and every path here is written relative to it, because `apiUrl`
// in backend.ts adds the prefix. Stripping it is what makes the two comparable.
const declared = new Map();
for (const [path, operations] of Object.entries(contract.paths ?? {})) {
  if (!path.startsWith('/v1/')) continue;
  const key = shape(path.slice('/v1'.length));
  const methods = new Set(Object.keys(operations).map((m) => m.toLowerCase()));
  declared.set(key, new Set([...(declared.get(key) ?? []), ...methods]));
}

/**
 * Operations this app calls that the API has not built yet.
 *
 * AN EXCEPTION THAT EXPIRES BY ITSELF, which is the only kind worth having. Each entry is checked
 * against the contract in BOTH directions: while the operation is absent it is tolerated and named,
 * and the moment it appears the entry becomes an ERROR telling you to delete it. A waiver that
 * outlives its reason is indistinguishable from a bug, and this one cannot.
 *
 * The alternative was leaving `contract:coverage` red on main, and CLAUDE.md is explicit about why
 * that is worse: a check wired into CI while failing teaches the reader that a red check is normal.
 * That is the whole reason this check was not a CI job until the drift was closed.
 */
const PENDING = [
  // Empty, and it earned the right to be. `/auth/external` sat here while the API half was built;
  // the moment the operation appeared in the contract this check failed and told me to delete the
  // entry, which is the only reason a waiver is safe to write at all.
];

const sources = globSync('src/**/*.ts', { exclude: (p) => p.includes('api-schema.d.ts') });

// `apiPost` and `anonymousPost` are POST by their names. `apiFetch` and `apiUrl` carry whatever
// `method` the init object beside them states, and are a GET when it states none — the same
// defaulting `fetch` itself does.
//
// `apiUrl` IS IN THIS LIST AND ITS ABSENCE WAS A HOLE THIS CHECK COULD NOT SEE PAST. The three
// helpers are not the only way to reach the API: the anonymous paths and the refresh call use
// `reach(apiUrl('/…'))` directly, because they cannot go through a wrapper that requires a session.
// So `/auth/login` — the single most important operation in the product — and `/auth/refresh` were
// never checked against the contract at all, and the number this script printed was a count of the
// calls it happened to recognise rather than of the calls that exist.
//
// It is the same lesson written thirty lines below about the other hop: match the thing that
// CONSTRUCTS the address, not the thing that sends it. `apiUrl` is the one function that turns a path
// into an API URL, so matching it catches every caller by construction — including ones nobody has
// written yet.
const CALL = /\b(apiPost|anonymousPost|apiFetch|apiUrl)\(\s*[`'"]([^`'"]*)[`'"]([\s\S]{0,220})/g;

const missing = [];
const waived = [];
const stale = [];
const dynamic = [];
let checked = 0;

for (const file of sources) {
  const text = readFileSync(file, 'utf8');

  for (const [, fn, rawPath, tail] of text.matchAll(CALL)) {
    // A path built from a variable rather than written down cannot be resolved here. Counted and
    // reported rather than skipped in silence: a check that quietly ignores what it cannot read
    // reports full coverage of half the calls.
    if (!rawPath.startsWith('/')) {
      dynamic.push(`${file}: ${fn}(${rawPath || '…'})`);
      continue;
    }

    const method =
      fn === 'apiFetch' || fn === 'apiUrl'
        ? (tail.match(/method:\s*['"]([A-Za-z]+)['"]/)?.[1] ?? 'get').toLowerCase()
        : 'post';

    // One call site becomes ten operations when it names a section, and every one of them has to be
    // declared — a gate that admits a name the API does not serve is a 404 the closed list promised
    // to prevent.
    const paths = rawPath.includes('${section}')
      ? SECTIONS.map((s) => rawPath.replace('${section}', s))
      : [rawPath];

    for (const path of paths) {
      const key = shape(path);
      checked += 1;

      const methods = declared.get(key);

      // Waived, but counted and printed — never skipped in silence.
      if (PENDING.some((p) => p.method === method && p.path === path) && !methods?.has(method)) {
        waived.push(`${method.toUpperCase()} ${path}`);
        continue;
      }

      if (!methods) missing.push(`${method.toUpperCase()} ${path} — no such path in ${CONTRACT}`);
      else if (!methods.has(method)) {
        missing.push(
          `${method.toUpperCase()} ${path} — path exists, but declares only ${[...methods].join(', ').toUpperCase()}`,
        );
      }
    }
  }
}

// ── The other half of the same seam: browser → BFF ────────────────────────────
//
// A screen calling `/api/…` that no route handler serves is a 404 nobody sees until a person clicks
// it. The smoke suite would catch it — and the smoke suite needs a real API, so it does not run here.
//
// EXTRACTION IS BY LITERAL, not by `fetch(`. The first attempt matched `fetch(` and silently missed
// five call sites, because the editor writes through a `write()` helper: it would have reported full
// coverage of eighty percent of the calls. Any literal containing `/api/` is the reliable net.
const HANDLERS = globSync('src/app/api/**/route.ts').map((f) =>
  f.replace(/^src\/app\/api/, '').replace(/\/route\.ts$/, ''),
);

/**
 * A `[param]` in a handler and a `${expr}` in a caller both match exactly one segment.
 *
 * The leading `api` segment is dropped because handler paths are derived from `src/app/api/**` and
 * already have it stripped. Forgetting that compared three segments against two and reported every
 * single call as unserved — a check that fails on everything is indistinguishable from a check that
 * works, right up until you read what it says.
 */
function segments(path) {
  return path
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .filter((s, i) => !(i === 0 && s === 'api'))
    .map((s) => (/^\[.*\]$/.test(s) || /\$\{.*\}/.test(s) ? '*' : s));
}

const handlerShapes = HANDLERS.map(segments);

const unserved = [];
let clientChecked = 0;

for (const file of globSync('src/**/*.{ts,tsx}')) {
  if (file.startsWith('src/app/api/')) continue;

  // The literal has to be an ARGUMENT — preceded by `(` or `,`. Matching the quotes alone counted
  // prose: a comment in src/lib/body.ts describes a 121 MB POST to `/api/auth/login`, and backticks
  // around a path in a sentence are indistinguishable from a template literal. It passed only because
  // that route happens to exist; a comment naming a removed or hypothetical route would have failed
  // CI over an English sentence, which is how a check earns a reputation for crying wolf.
  for (const [, raw] of readFileSync(file, 'utf8').matchAll(/[(,]\s*[`'"](\/api\/[^`'"]*)[`'"]/g)) {
    const want = segments(raw);
    clientChecked += 1;

    const served = handlerShapes.some(
      (h) => h.length === want.length && h.every((s, i) => s === '*' || want[i] === '*' || s === want[i]),
    );

    if (!served) unserved.push(`${raw} — no route handler under src/app/api (${file})`);
  }
}

for (const line of dynamic) console.log(`  ? ${line}`);

// ── Claims the UI makes that the contract can falsify ─────────────────────────
//
// THE THIRD INSTANCE OF ONE PATTERN IN ONE NIGHT, so it gets a mechanism rather than another comment.
//
//   1. The `seo` skill was removed because "everything is behind a session gate" — true until the
//      landing page shipped, and nothing re-opened the decision.
//   2. The privacy page said "one third party" from a build-time render — it would have stayed silent
//      about Google for a year.
//   3. Settings says "there is no way to verify an email yet — no endpoint sends one", which stops
//      being true the moment the API grows one.
//
// Every one is a sentence that was true when written and had no way of noticing it had stopped being
// true. This is the same trick as the PENDING waiver above: the contract is the fact, the prose is
// the claim, and the check fails when they disagree — so the claim cannot outlive its premise
// quietly.
const CLAIMS = [
  {
    file: 'src/app/(app)/settings/SettingsScreen.tsx',
    says: 'There is no way to verify an email yet',
    // Any path that looks like email verification. Matched loosely on purpose: the name is the API's
    // to choose and this must fire whatever they call it.
    falsifiedBy: /verif/i,
    fix: 'the API now serves an email-verification route — rewrite or delete that sentence',
  },
  {
    file: 'src/app/(app)/settings/SettingsScreen.tsx',
    says: 'is the only way into this account',
    falsifiedBy: /set-password|create-password/i,
    fix: 'the API can now give a passwordless account a password — that sentence promises otherwise',
  },
];

/*
 * WHAT THE RULE ABOVE CANNOT SEE, said plainly rather than left for somebody to assume.
 *
 * The API side reports that password reset on a provider-only account refuses to mint a password,
 * and that the reason is structural: the reset token is signed over the password hash, so an account
 * with none has nothing to sign. That is a better guarantee than a promise — and it is a guarantee
 * about a BRANCH, which no contract can express. `RequestPasswordReset` choosing one path over
 * another changes no path, no schema and no method.
 *
 * So this entry catches only the shape where a NEW route appears that could hand a passwordless
 * account a password. It is a partial net and is written down as one. A rule that looked like
 * coverage while checking nothing would be worse than no rule, because the next reader would stop
 * looking.
 */

const claimed = [];
for (const claim of CLAIMS) {
  const contradicting = Object.keys(contract.paths ?? {}).filter((p) => claim.falsifiedBy.test(p));
  if (contradicting.length === 0) continue;

  const text = readFileSync(claim.file, 'utf8');
  if (text.includes(claim.says)) {
    claimed.push(`${claim.file}: "${claim.says}…" — ${claim.fix} (${contradicting.join(', ')})`);
  }
}

if (claimed.length > 0) {
  console.error(`${claimed.length} claim(s) the contract now contradicts:\n`);
  for (const line of claimed) console.error(`  ✗ ${line}`);
  console.error('');
}

if (dynamic.length > 0) console.log(`  ${dynamic.length} call(s) built from a variable — not checked\n`);

// THE HALF THAT MAKES THE WAIVER SAFE. An entry whose operation now EXISTS has done its job and must
// go, or the next person reads a list of "pending" work that shipped weeks ago and stops believing it.
for (const entry of PENDING) {
  if (declared.get(shape(entry.path))?.has(entry.method)) {
    stale.push(`${entry.method.toUpperCase()} ${entry.path} — now in ${CONTRACT}; delete this PENDING entry`);
  }
}

if (waived.length > 0) {
  console.log(`${waived.length} operation(s) waived as pending on the API:\n`);
  for (const line of waived) {
    const entry = PENDING.find((p) => `${p.method.toUpperCase()} ${p.path}` === line);
    console.log(`  ~ ${line}\n     ${entry?.why ?? ''}`);
  }
  console.log('');
}

if (stale.length > 0) {
  console.error(`${stale.length} stale waiver(s):\n`);
  for (const line of stale) console.error(`  ✗ ${line}`);
  console.error('');
}

if (missing.length > 0) {
  console.error(`${missing.length} operation(s) called but not in ${CONTRACT}:\n`);
  for (const line of missing) console.error(`  ✗ ${line}`);
  console.error(
    `\nRegenerate with \`pnpm gen:api\` against a running BuildCv.Api. If the API genuinely does not\n` +
      `serve one of these, the caller is wrong and the contract is right.`,
  );
}

if (unserved.length > 0) {
  console.error(`\n${unserved.length} screen call(s) with no route handler:\n`);
  for (const line of unserved) console.error(`  ✗ ${line}`);
}

// `stale` is in here, and leaving it out is a bug this script nearly shipped. A waiver whose reason
// has expired would have printed an error and exited 0 — a check reporting a pass while telling you
// something is wrong, which is the exact failure mode every other assertion in this repo exists to
// avoid.
if (missing.length > 0 || unserved.length > 0 || stale.length > 0 || claimed.length > 0) process.exit(1);

console.log(`${checked} operation(s) checked against ${CONTRACT} — all declared.`);
console.log(`${clientChecked} screen call(s) checked against src/app/api — all served.`);
