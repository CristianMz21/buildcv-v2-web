#!/usr/bin/env bash
#
# Checks the container that actually ships, rather than the source that CI already checks.
#
# EVERY EXISTING CHECK RUNS AGAINST SOURCE. `next build` proves the code compiles; it says nothing
# about whether the image starts, whether it refuses a misconfigured deploy, or whether the headers
# this app argues about all day survive into the artifact. Those are properties of the container, and
# until this script existed the first place they would have been tested is production.
#
#   ./scripts/verify-image.sh [image-tag]
#
# Builds the image if the tag is absent, then asserts three things end to end. Written in plain bash
# with no grep/rg: the assertions are string matches a shell can do itself, and a deploy check that
# needed a tool the runner might not have would be one more thing to go wrong.

set -euo pipefail

IMAGE="${1:-buildcv-web:verify}"
PORT="${PORT:-3999}"
NAME="buildcv-web-verify-$$"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

# curl already prints 000 when it cannot connect, but it also exits non-zero, so the failure has to be
# absorbed by OVERWRITING the variable. An `|| echo 000` appends a second line instead, and a two-line
# "000\n000" is not equal to "000" — which silently satisfies the readiness gate below and makes every
# later assertion race a server that has not bound its port. That was this script's first bug.
status_of() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://localhost:$PORT$1" 2>/dev/null) || code=000
  printf '%s' "$code"
}

# Polls rather than sleeping a fixed span: a cold container and a warm one differ by seconds, and a
# guess long enough to be safe would be paid on every run. Any HTTP answer counts as up — a
# misconfigured container is supposed to answer 500, and waiting for 200 would hang on the case
# section 1 exists to test.
settle() {
  local waited=0
  until [ "$(status_of /api/health)" != "000" ]; do
    waited=$((waited + 1))
    if [ "$waited" -gt 60 ]; then fail "the container never answered on :$PORT"; fi
    sleep 1
  done
}

# WITH NO ARGUMENT, ALWAYS REBUILD. Never "reuse the tag if it already exists" — the first version of
# this script did, and its very first run reported HSTS missing from an image that turned out to
# predate the commit adding it by twenty-one minutes. A check that can quietly pass, or quietly fail,
# against a stale artifact is worse than no check: it answers a question about some other build.
# Layer caching already makes the honest path cheap.
#
# With an argument, verify exactly that image and build nothing — the caller means the artifact CI
# produced, and rebuilding it here would test a different one.
if [ "$#" -eq 0 ]; then
  echo "Building $IMAGE from the working tree…"
  docker build -q -t "$IMAGE" . > /dev/null
elif ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  fail "no such image: $IMAGE"
fi

# ── 1. A deploy with no API origin must refuse to serve ───────────────────────
#
# The Dockerfile omits BUILDCV_API_ORIGIN deliberately — it is a runtime value — and
# instrumentation.ts forces the check at start so a misconfigured deploy fails immediately rather
# than on a candidate's first sign-in. A container that served 200 here would mean that check is gone.
echo "Misconfigured deploy:"
docker run -d --name "$NAME" -p "$PORT:3000" "$IMAGE" > /dev/null
settle

code=$(status_of /login)
[ "$code" = "500" ] || fail "expected 500 with no BUILDCV_API_ORIGIN, got $code"
pass "refuses to serve without BUILDCV_API_ORIGIN ($code)"

logs=$(docker logs "$NAME" 2>&1)
[[ $logs == *"BUILDCV_API_ORIGIN"* ]] || fail "the log never names the missing variable"
pass "names the missing variable in its log"

cleanup

# ── 2. A configured deploy must serve, and its liveness probe must not need the API ──
echo "Configured deploy:"
docker run -d --name "$NAME" -p "$PORT:3000" \
  -e BUILDCV_API_ORIGIN=http://buildcv-api-that-does-not-resolve:8080 "$IMAGE" > /dev/null
settle

# Pointed at an origin that does not resolve, on purpose. The liveness probe must answer from the
# process alone: one that reached the API would restart the whole fleet the moment the API hiccuped,
# turning a partial outage into a total one.
code=$(status_of /api/health)
[ "$code" = "200" ] || fail "expected 200 on /api/health with an unreachable API, got $code"
pass "liveness probe answers without the API ($code)"

code=$(status_of /login)
[ "$code" = "200" ] || fail "expected 200 on /login, got $code"
pass "serves /login ($code)"

# ── 2b. The image's own HEALTHCHECK must actually turn it healthy ─────────────
#
# EVERY CHECK ABOVE PROBES FROM THE HOST, through the published port, and that is precisely the blind
# spot that let a real defect live: the container was permanently UNHEALTHY while answering every one
# of those probes correctly, because its healthcheck ran INSIDE and resolved `localhost` to ::1 while
# Node listens on IPv4. Serving correctly and reporting healthy are two different claims.
echo "Health status:"
waited=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null)" = "healthy" ]; do
  waited=$((waited + 1))
  if [ "$waited" -gt 90 ]; then
    fail "never reported healthy (last: $(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null))"
  fi
  sleep 1
done
pass "reports healthy in ${waited}s"

# Pins the reason rather than the symptom. If a future change makes the server dual-stack this line
# starts passing on `localhost` too and can go; until then, it documents why the probe is written the
# way it is, in a place that fails when someone "tidies" it back.
docker exec "$NAME" wget -qO- -T3 http://127.0.0.1:3000/api/health > /dev/null 2>&1 \
  || fail "127.0.0.1 is refused from inside the container — the healthcheck cannot work"
pass "127.0.0.1 answers from inside"

# ── 3. The headers this app argues about must survive into the artifact ───────
echo "Response headers:"
headers=$(curl -sSI -m 10 "http://localhost:$PORT/login" | tr '[:upper:]' '[:lower:]')

[[ $headers == *"strict-transport-security:"* ]] \
  || fail "no Strict-Transport-Security — it is production-only, so the image is where it is provable"
pass "Strict-Transport-Security present"

[[ $headers == *"connect-src 'self'"* ]] \
  || fail "connect-src 'self' missing — the header the BFF's whole argument rests on"
pass "CSP carries connect-src 'self'"

# 'unsafe-eval' is a dev-only concession for Next's hot reload. Shipped, it would hand an injected
# script the one primitive this policy is most worth denying.
[[ $headers != *"unsafe-eval"* ]] || fail "CSP carries 'unsafe-eval' in a production image"
pass "CSP carries no 'unsafe-eval'"

[[ $headers != *"x-powered-by:"* ]] || fail "X-Powered-By is present"
pass "no X-Powered-By"

echo
echo "The image is deployable."
