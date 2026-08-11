#!/usr/bin/env node
//
// The session cookie names in `src/middleware.ts` must match the ones in `src/lib/session.ts`.
//
// THEY ARE DUPLICATED BECAUSE MIDDLEWARE CANNOT IMPORT THAT MODULE. It runs in its own bundle, and
// `session.ts` opens with `server-only` and pulls in the token decoder and the backend client behind
// it. Two string constants are the cheap half; the expensive half would be dragging a server module
// into an edge bundle to avoid writing them twice.
//
// The failure this prevents is silent and one-directional. Rename a cookie in `session.ts` and every
// sign-in keeps working — the middleware simply stops recognising anybody, so a signed-in visitor
// sees the landing page instead of their CVs. Nothing errors, nothing logs, and the only symptom is
// a redirect that quietly stopped happening.

import { readFileSync } from 'node:fs';

const SESSION = 'src/lib/session.ts';
const MIDDLEWARE = 'src/middleware.ts';

/** `const X_COOKIE = 'value';` — the names, whatever the constants are called. */
function cookiesIn(path) {
  const source = readFileSync(path, 'utf8');
  const found = [...source.matchAll(/const\s+\w*COOKIE\w*\s*=\s*'([^']+)'/g)].map(([, name]) => name);
  return new Set(found);
}

const session = cookiesIn(SESSION);
const middleware = cookiesIn(MIDDLEWARE);

if (session.size === 0) {
  console.error(`No cookie names found in ${SESSION} — refusing to report a pass.`);
  process.exit(1);
}
if (middleware.size === 0) {
  console.error(`No cookie names found in ${MIDDLEWARE} — refusing to report a pass.`);
  process.exit(1);
}

const missing = [...middleware].filter((name) => !session.has(name));

if (missing.length > 0) {
  console.error(`${missing.length} cookie name(s) the middleware reads and ${SESSION} does not set:\n`);
  for (const name of missing) console.error(`  ✗ '${name}'`);
  console.error(`\nA signed-in visitor would be treated as anonymous, silently. Set: ${[...session].join(', ')}`);
  process.exit(1);
}

console.log(`The middleware reads ${middleware.size} cookie name(s), all set by ${SESSION}.`);
