---
name: smoke
description: Bring up BuildCv.Api from the sibling buildcv-v2 checkout and run the Playwright smoke suite against it. Use when asked to run the e2e tests, verify a change end to end, or reproduce a smoke failure.
disable-model-invocation: true
---

# Run the smoke suite

The suite runs against a **real** API. Nothing is mocked, and the run **fails on any console error**.
Starting the API is a prerequisite the test harness cannot do for you, and it lives in a different
repository — this skill is the runbook so that knowledge is not reconstructed from prose each time.

## 1. Start the API

It is in `buildcv-v2`, a sibling checkout (`../buildcv-v2` from this repo). Run it with the in-memory
store so a run needs no database:

```bash
cd ../buildcv-v2
ASPNETCORE_ENVIRONMENT=Development \
Persistence__Provider=InMemory \
Jwt__SigningKey='local-dev-signing-key-that-is-long-enough-32' \
dotnet run --project src/BuildCv.Api
```

It binds **:5062** from the API's launch settings — `ASPNETCORE_URLS` does not override it. Confirm
before going further; every failure below looks the same if nothing is listening:

```bash
curl -fsS http://localhost:5062/openapi/v1.json > /dev/null && echo "API up"
```

Leave it running in its own terminal. Run it in the background only if you can still read its log —
a 500 from the API surfaces there, not in the Playwright output.

## 2. Run the suite

From this repo, with the API up:

```bash
pnpm test:e2e
```

Playwright starts its **own** dev server on :3210 (`pnpm dev --port 3210`) unless `BUILDCV_WEB_ORIGIN`
is set, so a run cannot pass against a stale server someone left up. Timeouts are generous because
that server compiles each route on its first request, and this suite is the first request to most of
them.

One test, or one file with a visible browser:

```bash
pnpm exec playwright test -g 'a throttled sign-in'
pnpm exec playwright test e2e/smoke.spec.ts --headed --debug
```

## 3. The rate-limit window

**The throttling test is last on purpose, and it spends this machine's sign-in window.**
`/v1/auth/login` allows 5 attempts per minute per client address, and a test machine has one address.
The test drives six failures deliberately, then polls until the window is clean again — that poll is
part of the test, not slack, so let it finish.

If you re-run the file inside that window it fails **at registration**, with the 429 the last test is
about. That is not a regression. Wait a minute, or confirm the window first:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:3210/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.com","password":"x"}'
```

`401` means the window is clean. `429` means wait.

## Reading a failure

- **Console-error assertion fired, screen looked fine.** That is the suite working. The regression it
  was written for still rendered its shell while React threw inside it — read the error text, not the
  screenshot.
- **Timeout on the first navigation after registering.** Usually route compilation on a cold dev
  server, not a product failure. Re-run before investigating.
- **Fails at registration with a 429.** The rate-limit window above.
- **Everything fails.** Check the API is actually up on :5062, and check its log.

Traces are kept on failure (`trace: 'retain-on-failure'`): `pnpm exec playwright show-trace <path>`.

Do not "fix" a failure by adding a mock. Every bug this suite exists to catch lives in the seam
between the two systems, and a mock is written from the same belief that was wrong.
