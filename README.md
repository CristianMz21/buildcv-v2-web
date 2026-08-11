# BuildCv web

**License: [Elastic License 2.0](LICENSE) — source-available, not OSI open source.** The code is public
and readable, but no one may offer it as a hosted or managed service. See the LICENSE file for the exact
terms.

Next.js App Router client for `BuildCv.Api`, running as a **BFF**. It covers both halves of what the
product promises — the match score against a posting, and the readability score a CV gets on its own —
against the real `/v1` contract.

## The API this talks to

The server lives in **[`buildcv-v2`](https://github.com/CristianMz21/buildcv-v2)**, a separate repo with
its own lifecycle. Two things there are worth reading before changing anything here:

- **[`docs/api-contract.md`](https://github.com/CristianMz21/buildcv-v2/blob/main/docs/api-contract.md)** —
  written for whoever consumes the API. It carries what OpenAPI structurally cannot: the auth sequence,
  why a refresh must be scheduled rather than triggered by a 401, and which refusals come back with an
  unparseable body. Its numbers are asserted against the server's own constants, so they cannot go stale
  quietly.
- The OpenAPI document at `/openapi/v1.json`, **served in Development only**, which is what the typed
  client here is generated from.

Because this client is a BFF — the browser talks to Next.js, Next.js talks to the API server-side over
bearer — CORS, `SameSite` and `Cross-Origin-Resource-Policy` never enter the picture. If a future change
moves API calls into the browser, all three become real problems at once and that is a deliberate
decision, not a configuration fix.

| Route | What it does |
|---|---|
| `/login`, `/register` | Session. Tokens never reach the browser; see the BFF section below. |
| `/forgot-password`, `/reset-password` | Recovery. Answers 503 and says so plainly until a mail provider is configured on the API — it never claims an email is on its way. |
| `/resumes` | Every CV, with what tells them apart. Create, name, delete. |
| `/resumes/[id]` | The editor: ten sections, add / correct / remove per entry, live A4 preview. |
| `/resumes/[id]/print` | The print document, and the PDF export: `@media print`, `break-inside: avoid`. With `?posting=` it is the CV composed for that job — ordered by what answered the posting's requirements, with the gaps named on screen and hidden from the print. |
| `/resumes/[id]/readability` | The second score. Five sections, renormalized weights, measured advice. |
| `/resumes/[id]/history` | Every analysis this CV has been through, oldest first. |
| `/resumes/import` | A document in, a reviewed CV out. The only path that fills `AtsParseability`. |
| `/analysis` | A CV against a job posting, from the source design. |
| `/settings` | Email, role, password, and account deletion. |
| `/legal/privacy`, `/legal/terms` | What the software does with a candidate's data, written from the code. **Not publishable as they stand** — four facts about the operator are `null` in `src/app/legal/details.ts` and the pages say so in red rather than going out looking finished. |

```bash
cp .env.example .env.local     # point BUILDCV_API_ORIGIN at the running API
pnpm install
pnpm dev                       # http://localhost:3000
```

The API lives in a **separate repository** (`buildcv-v2`). From that checkout, with the in-memory
store:

```bash
ASPNETCORE_ENVIRONMENT=Development \
Persistence__Provider=InMemory \
Jwt__SigningKey='local-dev-signing-key-that-is-long-enough-32' \
dotnet run --project src/BuildCv.Api        # listens on :5062, http only
```

That is the `http` launch profile — the first in `launchSettings.json`, and therefore the one a bare
`dotnet run` picks. **It binds 5062 and nothing else.** If you need https locally (to exercise a
`Secure` cookie, say), add `--launch-profile https`, which binds :7160 as well; only then does
`BUILDCV_ALLOW_SELF_SIGNED=1` have a certificate to forgive. Pointing at :7160 without it is a
refused connection, not a certificate error, and the flag will look broken when it was never reached.

## The contract, across two repositories

`src/lib/api-schema.d.ts` is **generated, never edited**, and `openapi.json` is committed beside it so
`next build` never needs a running API.

```bash
pnpm gen:api             # refetch the document and regenerate the types
pnpm gen:api:check       # the drift check: fails if either file moved. Needs a live API.
pnpm gen:types:check     # regenerate from the COMMITTED openapi.json. Needs nothing.
```

Two checks, because they answer different questions. `gen:api:check` asks whether the API still
serves the document this client was built against, and it can only be answered against a running
server — a diff means the contract changed underneath, which is the failure two repositories make
possible and one made impossible, because an API change and its client fix can no longer be the same
commit.

`gen:types:check` asks whether `api-schema.d.ts` is still what `openapi.json` generates. That needs
no API, so it runs on every push (see `.github/workflows/ci.yml`), and it is what catches the one
edit the file forbids: a type widened by hand to make `tsc` agree with a screen.

**`contracts.ts` stays hand-written on top, on purpose.** It aliases the generated types so a shape
change breaks the build, and carries what a generator strips: that a section `score` is meaningless
when its `weight` is 0, that `impact` is on the 0..1 scale and not 0..100, that an entry `id` is
opaque and never a position. Those are the facts that stop the UI stating things the API did not.

`openapi-typescript` rather than Orval: types only, no runtime. Orval generates a client for
react-query or axios, and every call here already goes through a route handler under `src/app/api`.

## Why a BFF and not a SPA

`BuildCv.Api` authenticates a browser two ways: an `access_token` cookie, or an
`Authorization: Bearer` header. `CsrfGuardMiddleware` skips validation entirely when the
Authorization value is non-blank — bearer requests carry no ambient credential and are not
CSRF-able.

So the tokens live on the Next.js server, in two httpOnly cookies on **this** origin, and every call
to the API goes out server-side with a bearer header. That removes, in one move:

- `Cors:AllowedOrigins` and `AllowCredentials` configuration (there is no cross-origin request),
- the double-submit `X-XSRF-TOKEN` header,
- `GET /v1/auth/antiforgery` and its re-fetch-on-every-change-of-principal contract,
- the **401 → 403 flip** documented in `CLAUDE.md`: because the access cookie outlives the JWT it
  carries and the CSRF guard gates on cookie *presence*, an idle cookie client's next unsafe request
  to any non-exempt route answers `403 "CSRF validation failed."` rather than 401. Over bearer, a 401
  is a 401.

The JWT audience is `buildcv-bff`. This is the client that API was shaped for.

Refresh is **proactive**, off the token's own `exp` — a client that only reacts to 401 is the one
that breaks. `apiFetch` also retries once on a 401 as a safety net for clock skew.

All API traffic goes through route handlers under `src/app/api`, never a Server Component: Next.js
forbids writing cookies outside a Route Handler or Server Action, so a Server Component that
refreshed would throw the rotated refresh token away and kill the session at the next expiry.

## Checks

```bash
pnpm typecheck           # tsc --noEmit
pnpm lint                # eslint, flat config, eslint-config-next through FlatCompat
pnpm build               # output: 'standalone'
pnpm test:e2e            # Playwright, against a REAL API on :5062
```

`.github/workflows/ci.yml` runs the first three plus `gen:types:check` on every push and pull
request. It deliberately stops there: `test:e2e` and `gen:api:check` both need a running
`BuildCv.Api`, which lives in another repository, and a CI job that reached for it would either need
credentials for that checkout or would quietly skip the assertion it exists to make.

**The smoke suite is the check that matters, and it exists because every other one was green.** The
CV list was narrowed to a summary while the analysis screen kept reading `resume.experiences` off it:
`tsc` passed, `next build` passed, the API's whole suite passed, and the screen threw on load. The
fetch had been annotated with an explicit generic, which is an assertion rather than a check — so the
compiler agreed with a lie. Nothing in `e2e/` mocks the API, because a mock is written from the same
belief that was wrong, and the run **fails on any console error**: the broken screen still rendered
its shell, so a check on visible text would have passed.

## Deployment

`docker-compose.app.yml` in the API repository brings up `mssql`, `api` and `web` on one network.
**Only `web` publishes a port.** `BUILDCV_API_ORIGIN=http://api:8080` keeps every call server-side,
which is what makes `Cors:AllowedOrigins` and `Network:ForwardedHeaders` unnecessary for this path —
if the API is ever exposed directly, both become required.

### The shutdown grace period must exceed 20 seconds

**Whatever runs this container has to give it at least 25s to stop, and almost nothing defaults to
that.** Docker and Compose give 10s; Kubernetes gives 30s; App Service and friends vary. Set it
explicitly — `stop_grace_period: 30s` in Compose, `terminationGracePeriodSeconds: 30` in a Pod spec.

The number is not arbitrary. A call to the API may legitimately be in flight for up to
`API_TIMEOUT_MS` (20s), and the shutdown has to outlast the longest request the app will wait on.
Measured on this image, both directions:

| In-flight request | `docker stop` | Container exit | What the caller got |
|---|---|---|---|
| Shorter than the grace period | 9.16s | **0** | a complete response |
| Longer than the grace period | 10.42s | **137** — SIGKILL | **connection cut**, no status |

So the good news is that the server drains: Next's standalone server handles `SIGTERM`, stops
accepting, and finishes what it is holding. It is the *orchestrator's* deadline that severs the
request, and it does it silently — a deploy under load quietly fails a slice of requests, and the only
trace is a client-side error nobody on the server ever sees.

There is no Dockerfile directive for this. It cannot be fixed in the image, which is exactly why it is
written here rather than left for whoever is watching the graphs after a release.

`BUILDCV_API_ORIGIN` is validated at server start via `src/instrumentation.ts`, not lazily on the
first request. In production a missing value throws; there is no localhost fallback to silently
succeed against.

## What the design asked for, and what the backend has

The source design is a mockup with invented data. Roughly a third of it has no data source. Nothing
below was faked; each was either mapped to the real thing or removed with the reason stated in the
code.

| Design | What shipped |
|---|---|
| CV picker with a score badge per CV | **Badge removed.** A match score needs a job posting; the readability score comes from a `POST` that creates a report, not a field on a list row. Shows last-edited, skill count and role count instead. |
| Paste JD → "Run analysis" | **A step was added.** `POST /v1/scoring/score` takes a `jobPostingId`. The only route from text to a posting carrying skill requirements is `/job-offers/extract` → review → `/job-offers/import`. |
| "Upload file" tab for the JD | **Removed.** No endpoint accepts a job posting as a file. |
| 4-step loading bar on a timer | **Two steps, both real** — the two round trips this screen makes. Nothing streams the engine's internal stages. |
| Breakdown: 4 fixed rows, fixed weights | **Driven by `breakdown.sections[]`** — six sections, weights renormalized per posting by the server. A section with weight 0 renders as *not measured*, never as a score. |
| "Strengths" prose bullets | **Sections that carried weight and scored ≥ 80**, with their real scores. No invented sentences. |
| "Gaps" prose bullets | **The top three `recommendations[]`** — the server's own sentences. |
| "18 of 24 keywords found", green chips | **Neutral chips, missing ones flagged red.** No green "found" chip: recommendations are capped at ten, so absence of a flag is not evidence of a match. Re-deriving the match here would also contradict the score — the engine recognises alternative spellings (`React.js` satisfies `React`). |
| "+3 pts" per suggestion | **Real** — `impact × 100`, and measured rather than estimated. |
| before/after diff | **Removed.** The API returns a sentence and an impact, no rewritten text. |
| "Apply to resume" / "Undo" | **Removed.** No endpoint edits a CV from a recommendation. The toggle only moves the projection, and says so. |
| CURRENT → PROJECTED | **Kept, with the caveat stated on screen**: impacts are each measured alone and are not guaranteed to add up. |
| — | **`isStale` added.** It has no slot in the design and it is the field that says the score describes a CV the candidate no longer has. |
| The mockup's greys and status colours | **Darkened one step, and only where they carry text.** The caption grey was 2.54:1 on white and the amber 3.07:1 on its own tint; WCAG AA asks 4.5:1 of text under 18px. Fills keep the vivid tone — a bar or a dot only owes 3:1 — so the change is invisible on every swatch and legible in every sentence. Measured, not eyeballed, and `e2e/a11y.spec.ts` fails if it drifts back. |
| Links inside a paragraph | **Underlined.** The blue sat 1.06:1 from the grey around it, which means colour alone was carrying the signal — and a reader who does not separate those hues saw no link at all. Links outside a text block are unchanged. |

Three rules the code follows that are worth not undoing:

- **Colour follows `analysis.band`, never a second set of thresholds.** The design coloured at
  90/70/50 while `Analysis.Band` cuts at 40/60/80 — keeping both would let the ring and the label
  disagree about one score.
- **Nothing re-implements a server rule.** No client-side skill matcher, no client-side band
  arithmetic. One statement per rule.
- **A colour that carries text uses the `-fg` token; a colour that fills a shape uses the vivid one.**
  `--good` and `--warn` are 3.3:1 and 3.2:1 on white — enough for a bar, short of the 4.5:1 a word
  needs. Three of the five score bands were failing that way before it was measured.

## Not implemented, and why

Every item here needs a backend that does not exist — a mailer, a file store, an aggregation
endpoint. None is a shortcut taken on the client.

Two rows left this table since it was written. **Export to PDF** ships: `/resumes/[id]/print` is a
print-media document the browser saves, which needs no server-side renderer. **Password reset** ships
end to end and answers 503 until a mail provider is configured on the API — the screen says so rather
than pretending an email is on its way.

| Missing | What it would need |
|---|---|
| Dashboard | Most of the mockup's tiles have no source. There is no per-account analysis feed — only `GET /v1/resumes/{id}/analyses` — so a cross-CV timeline cannot be assembled honestly. |
| Social login, email verification, 2FA | No external identity provider, and no mailer wired up. |
| ⌘K search | No search endpoint. |
| Notifications, billing, teams, admin analytics | No endpoints at all. |
| A per-CV ATS badge on the list | A match score needs a posting; a readability score is a `POST` that creates a report, not a field on a list row. |

Two gaps that are the API's shape rather than an absent feature, and that the editor states on screen
rather than working around:

- **A month-precision date cannot be edited without giving it a day.** `PartialDate` carries `2019-03`
  end to end and an import produces one, but `<input type="date">` cannot hold it and the per-section
  routes bind `DateOnly`. The field opens blank and the form says which date needs a day, instead of
  inventing the 1st.
- **Correcting an experience clears its bullet points, and correcting a skill clears its alternative
  spellings.** `AddExperienceRequest` has no `highlights` and `AddSkillRequest` no `keywords`, while
  the responses carry both — and `PUT` replaces an entry outright. Achievements is computed from
  nothing but the bullet points, so the editor names the loss before saving. Widening those two
  requests is the fix, and it belongs in the API repository.
