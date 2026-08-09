# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml`, `node_modules/.pnpm`, and the Dockerfile all use it).
The README and the `gen:api` script still say `npm`; prefer `pnpm` for installs so the lockfile stays
authoritative.

```bash
pnpm install
pnpm dev                  # http://localhost:3000
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint flat config
pnpm build                # output: 'standalone'
pnpm test:e2e             # Playwright — needs a REAL BuildCv.Api running
pnpm gen:api              # refetch openapi.json and regenerate src/lib/api-schema.d.ts
pnpm gen:api:check        # drift check: fails if either generated file moved
```

Run one e2e test / one step:

```bash
pnpm exec playwright test -g 'a throttled sign-in'
pnpm exec playwright test e2e/smoke.spec.ts --headed --debug
```

`BUILDCV_API_ORIGIN` (defaults to `http://localhost:5062` in dev, **required** in production) points at
the API. `BUILDCV_ALLOW_SELF_SIGNED=1` is the local-only escape hatch for the ASP.NET dev certificate.
Both are validated at server start via `src/instrumentation.ts` — **not at module load**, and that
distinction is load-bearing: `next build` collects page data by importing every route handler with
`NODE_ENV=production`, so a module-level check made the build itself demand a runtime-only variable
and `docker build` failed at `RUN pnpm build`. Resolve configuration behind a function; let
`instrumentation.ts` force it at start.

## The other repository

The API is **`buildcv-v2`** (`BuildCv.Api`), a separate repo with its own lifecycle. Its
`docs/api-contract.md` carries what OpenAPI cannot — the auth sequence, why refresh must be proactive,
which refusals come back unparseable. When code comments or the README here mention "CLAUDE.md", they
mean **that repo's** CLAUDE.md, not this file.

`openapi.json` is committed so `next build` never needs a running API. `src/lib/api-schema.d.ts` is
**generated, never edited**.

## Architecture: a BFF, and every rule follows from that

Browser → Next.js route handler (`src/app/api/**`) → `src/lib/backend.ts` → `BuildCv.Api /v1`.
Tokens live in two httpOnly cookies on **this** origin; the browser never holds a BuildCv credential.

The consequences that constrain new code:

- **The browser never calls the API directly.** `connect-src 'self'` in `next.config.ts` enforces it,
  and there are deliberately no rewrites to the API. Going direct would reintroduce CORS with
  credentials, the double-submit `X-XSRF-TOKEN` header, and the 401→403 flip that `CsrfGuardMiddleware`
  produces for idle cookie clients.
- **No API call from a Server Component.** Next.js forbids writing cookies outside a Route Handler or
  Server Action, so a Server Component that triggered the proactive refresh would discard the rotated
  refresh token and kill the session at the next expiry. Server Components may only `readSession()` as
  a gate (see `src/app/(app)/layout.tsx`).
- **Every authenticated call goes through `apiFetch` / `apiPost`** in `src/lib/backend.ts`. Refresh is
  proactive off the token's `exp`; the 401 retry is a clock-skew safety net, not the mechanism.
  Anonymous routes (`login`, `register`) bypass it because there is no session yet.
- **Route handlers are thin**: validate what came off the URL, then `withSession(async () =>
  relay(await apiPost(...)))`. `relay` passes status, body and `content-type` through unchanged so the
  API's ProblemDetails — including the `errors` map keyed by field path — reaches the form that needs
  it. `Retry-After` and `X-Correlation-ID` are copied across; nothing else is.
- **Path segments that reach the API path must be gated against a closed list** (`isResumeSection` in
  `src/lib/sections.ts`). Without it the BFF is an open proxy for any future `/v1/resumes/{id}/…` route.

Screens are `'use client'` components that `fetch('/api/…')` and go through `readJson` / `failureOf`
in `src/lib/http.ts`. `SessionExpired` (401) means redirect to `/login`, never a banner.

`/analysis` sits outside the `(app)` route group on purpose — it is a focused stepper flow with no
sidebar, and it does its own session handling.

## Contract invariants that are easy to break

`src/lib/contracts.ts` is hand-written on top of the generated types and is where the *meaning* lives.
Read it before touching anything score-shaped.

- **A section `score` is meaningless when its `weight` is 0.** Render "not measured", never a score.
  There is no separate applicable flag — the weight is the signal.
- **`impact` is 0..1; `overallScore` is 0..100.** Points are `impact × 100`, kept to one decimal
  (`impactPoints`), because the API's claim is that the number was measured, not estimated.
- **Colour follows `analysis.band`, never client-side thresholds.** The source design cut at 90/70/50;
  `Analysis.Band` cuts at 40/60/80. One rule, one statement — `bandTone` in `src/lib/format.ts`.
- **Never re-implement a server rule.** No client-side skill matcher, no band arithmetic. The scoring
  engine recognises alternative spellings (`React.js` satisfies `React`), so a local comparison would
  contradict the score next to it — see `missingSkills`, which reads the server's own recommendations.
- **Entry `id`s are opaque.** Never address an entry by array position; the store returns collections
  as sets. Only `ResumeResponse` (the full CV) carries ids — `ResumeSummaryResponse` (list rows) carries
  counts and contact basics, nothing more.
- **Match score and readability score are different models and must never be added.**
- **`readJson<T>` is an assertion, not a check.** Naming a type the route does not return is exactly
  how the bug that motivated the e2e suite got past `tsc`. Name what the route actually returns.
- Enums arrive as bare strings and are narrowed here with `(string & {})` so an append-only server enum
  cannot break type-checking. Unknown values must degrade, not crash.

## The e2e suite

`e2e/smoke.spec.ts` runs against a **real** API and **fails on any console error** — that assertion is
the point, because the regression it was written for still rendered its shell while React threw inside
it. Nothing is mocked: a mock is written from the same belief that was wrong.

Playwright starts its own dev server on :3210 unless `BUILDCV_WEB_ORIGIN` is set, so a run cannot pass
against a stale server. Timeouts are generous because the dev server compiles each route on first hit.

The throttling test is **last on purpose** — it spends this machine's sign-in rate-limit window (5/min
per address) and then polls until the window is clean. Re-running the file inside that window fails at
registration.

## Skills

Vendored by `npx autoskills` into `.agents/skills/` and symlinked from `.claude/skills/`. Both are
gitignored and reconstructible; only `skills-lock.json` is committed, so run `npx autoskills` after a
fresh clone. Several are also available from plugins under a `vercel:` prefix — prefer the local copy,
since the lockfile is what makes it reproducible.

Load these for the work they name:

| Work | Skill |
|---|---|
| Keyboard and ARIA behaviour on any screen | `accessibility` |
| Anything under `e2e/` | `playwright-best-practices` |
| `src/lib/contracts.ts` and the generated-type layer | `typescript-advanced-types` |
| Client screens, hook usage, re-render cost | `react-best-practices`, `composition-patterns` |
| Route handlers, RSC boundaries, metadata | `next-best-practices` |

**Where a skill's generic advice contradicts a decision this repo already made, the repo wins** — and
the reason is in the comment beside the code, not just here:

- **`playwright-best-practices` recommends mocking the API.** This suite deliberately does not. A mock
  is written from the same belief that was wrong, and every bug it exists to catch lives in the seam
  between the two systems. Take its Page Object, tagging and CI guidance; skip the mocking chapter.
- **`next-best-practices` and `react-best-practices` will push data fetching into Server Components.**
  Not here. A Server Component cannot write cookies, so it cannot carry the proactive refresh — see the
  BFF section above.

### Removed on purpose

`npx autoskills` detects React / Next.js / Node.js and installs twelve skills. Six were removed
because their advice does not describe this project:

| Removed | Why |
|---|---|
| `nodejs-backend-patterns` | Express/Fastify services. There is no Node backend; the server is ASP.NET in `buildcv-v2`, and route handlers here are a four-line relay by design. |
| `next-cache-components` | Next.js 16 `use cache` and PPR. This project is on 15.5.4 and every API call is `cache: 'no-store'` per-user data behind a session. |
| `seo` | Targets public pages. Everything but `/login` and `/register` is behind a session gate, and `frame-ancestors 'none'` says this app is not meant to be indexed. |
| `nodejs-best-practices` | Framework selection and general architecture, for a project whose framework and architecture are settled. |
| `next-upgrade` | Only applies during a version migration. |
| `frontend-design` | Proposes aesthetic direction. The design is fixed by the source mockup, and every deliberate deviation is recorded in the README table. |

**autoskills has no exclude mechanism** — `skills-lock.json` records what is installed, not what was
rejected. A future `npx autoskills` re-detects the same stack and restores all six. Re-prune after
running it, or decide knowingly to keep them.

## Conventions

- Path alias `@/*` → `./src/*`. Styling is CSS Modules per screen plus tokens in `src/app/globals.css`.
- `tsconfig` has `strict` **and** `noUncheckedIndexedAccess` — indexing gives you `T | undefined`.
- Server-only modules import `'server-only'` as their first line.
- New dependencies with install scripts must be answered explicitly in `pnpm-workspace.yaml`
  (`allowBuilds`); pnpm refuses to run any command while one is undecided.
- Comments here carry the *why*, often with the measurement that motivated a decision. When you change
  such code, update the reasoning rather than deleting it.
