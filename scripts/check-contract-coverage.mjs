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

const sources = globSync('src/**/*.ts', { exclude: (p) => p.includes('api-schema.d.ts') });

// `apiPost` and `anonymousPost` are POST by their names. `apiFetch` carries whatever `method` its
// init object states and is a GET when it states none — the same defaulting `fetch` itself does.
const CALL = /\b(apiPost|anonymousPost|apiFetch)\(\s*[`'"]([^`'"]*)[`'"]([\s\S]{0,220})/g;

const missing = [];
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
      fn === 'apiFetch' ? (tail.match(/method:\s*['"]([A-Za-z]+)['"]/)?.[1] ?? 'get').toLowerCase() : 'post';

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
      if (!methods) missing.push(`${method.toUpperCase()} ${path} — no such path in ${CONTRACT}`);
      else if (!methods.has(method)) {
        missing.push(
          `${method.toUpperCase()} ${path} — path exists, but declares only ${[...methods].join(', ').toUpperCase()}`,
        );
      }
    }
  }
}

for (const line of dynamic) console.log(`  ? ${line}`);
if (dynamic.length > 0) console.log(`  ${dynamic.length} call(s) built from a variable — not checked\n`);

if (missing.length > 0) {
  console.error(`${missing.length} operation(s) called but not in ${CONTRACT}:\n`);
  for (const line of missing) console.error(`  ✗ ${line}`);
  console.error(
    `\nRegenerate with \`pnpm gen:api\` against a running BuildCv.Api. If the API genuinely does not\n` +
      `serve one of these, the caller is wrong and the contract is right.`,
  );
  process.exit(1);
}

console.log(`${checked} operation(s) checked against ${CONTRACT} — all declared.`);
