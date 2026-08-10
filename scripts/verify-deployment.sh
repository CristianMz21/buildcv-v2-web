#!/usr/bin/env bash
#
# Checks the deployment, which is a different claim from checking the image.
#
# `verify-image.sh` asserts how the artifact behaves on this machine. Everything between that and a
# user — the ingress, its TLS termination, which revision holds the traffic — is unasserted, and two
# of tonight's findings lived exactly there: the security headers had never been measured through
# Azure's front door, and `SameSite` turned out to protect nothing on the hostname we deploy to.
#
#   ./scripts/verify-deployment.sh [expected-image-tag]
#
# IT ESTABLISHES WHICH REVISION IT IS MEASURING BEFORE IT MEASURES ANYTHING. That order is the whole
# design. Tonight the Origin check was nearly reported broken in production: the script waited for
# `/api/health` to answer 200 and the PREVIOUS revision answered it while the new one was still
# starting, so five assertions ran against the old deployment and every one of them returned a
# plausible wrong number. A health endpoint answering means something is alive, not that the thing
# you just shipped is.

set -euo pipefail

GROUP="${BUILDCV_RG:-buildcv-rg}"
APP="${BUILDCV_APP:-buildcv-web}"
EXPECTED_TAG="${1:-}"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

command -v az > /dev/null || fail "az is required — without it this cannot tell which revision it is measuring"

# ── 0. What am I actually looking at? ─────────────────────────────────────────
echo "Deployment:"

FQDN=$(az containerapp show -g "$GROUP" -n "$APP" --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null)
[ -n "$FQDN" ] || fail "no ingress FQDN for $APP in $GROUP"
URL="https://$FQDN"

# The revision holding ALL the traffic, not merely the newest or the healthiest. During a rollout
# both are active and only one is answering.
LIVE=$(az containerapp revision list -g "$GROUP" -n "$APP" \
  --query "[?properties.trafficWeight==\`100\`] | [0].{n:name,h:properties.healthState,i:properties.template.containers[0].image}" -o tsv 2>/dev/null)
[ -n "$LIVE" ] || fail "no single revision holds 100% of traffic — a rollout is in progress, so any measurement now is of an unknown mixture"

REV=$(echo "$LIVE" | cut -f1)
HEALTH=$(echo "$LIVE" | cut -f2)
IMAGE=$(echo "$LIVE" | cut -f3)

[ "$HEALTH" = "Healthy" ] || fail "$REV holds the traffic but reports $HEALTH"
pass "$REV holds 100% of traffic, Healthy"
pass "running $IMAGE"

if [ -n "$EXPECTED_TAG" ]; then
  case "$IMAGE" in
    *"$EXPECTED_TAG") pass "matches the expected tag $EXPECTED_TAG" ;;
    *) fail "expected $EXPECTED_TAG, the live revision runs $IMAGE" ;;
  esac
fi

# Overwritten on failure, never appended to. `|| echo 000` produces a two-line "000\n000" that equals
# no status you will ever compare against — the same bug this repo already fixed once in
# verify-image.sh, written again here from memory and caught the same way: by a result that made no
# sense next to a working curl.
status() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 30 "$@" 2>/dev/null) || code=000
  printf '%s' "$code"
}

# ── 1. It serves ──────────────────────────────────────────────────────────────
#
# WOKEN FIRST, ON A LONGER LEASH. This app runs at `min-replicas 0`, so the first request after an
# idle period pays for a container start and can take far longer than any request a user will see.
# Measuring that as a failure would make this script report an outage every time it ran second.
echo "Serving:"
printf '  waking'
for _ in $(seq 1 20); do
  [ "$(status "$URL/api/health")" = "200" ] && break
  printf '.'
  sleep 5
done
printf '\r\033[K'

[ "$(status "$URL/api/health")" = "200" ] || fail "/api/health did not answer 200 after 100s"
pass "/api/health answers"
[ "$(status "$URL/login")" = "200" ] || fail "/login did not answer 200"
pass "/login answers"

# ── 2. The headers survive the ingress ────────────────────────────────────────
#
# Measured here rather than only on the container because a front door may add, strip or rewrite.
# Until this ran, "HSTS ships" was a claim about the image and not about what a browser receives.
echo "Headers through the ingress:"
headers=$(curl -sSI -m 30 "$URL/login" | tr '[:upper:]' '[:lower:]')

for header in 'strict-transport-security:' 'content-security-policy:' 'x-content-type-options:' \
              'referrer-policy:' 'x-frame-options:' 'permissions-policy:'; do
  case "$headers" in *"$header"*) ;; *) fail "missing ${header%:}" ;; esac
done
pass "all six security headers present"

case "$headers" in *"connect-src 'self'"*) pass "CSP carries connect-src 'self'" ;; *) fail "CSP lost connect-src 'self'" ;; esac
case "$headers" in *"unsafe-eval"*) fail "CSP carries 'unsafe-eval' in production" ;; *) pass "CSP carries no 'unsafe-eval'" ;; esac
case "$headers" in *'x-powered-by:'*) fail "X-Powered-By is present" ;; *) pass "no X-Powered-By" ;; esac

# ── 3. Cross-origin writes are refused ────────────────────────────────────────
#
# `SameSite` does not protect this hostname: `azurecontainerapps.io` is not in the Public Suffix List,
# so every Container App is same-site with this one. The middleware is the control, and this is the
# attack it exists to stop — sent as a request rather than asserted from the source.
echo "Cross-origin:"
code=$(status -X POST -H 'content-type: application/json' \
  -H 'Origin: https://evil.some-other-env.azurecontainerapps.io' -d '{}' "$URL/api/auth/login")
[ "$code" = "403" ] || fail "a POST from another Container App answered $code, expected 403"
pass "a forged POST from another Container App is refused (403)"

code=$(status -X POST -H 'content-type: application/json' -d '{}' "$URL/api/auth/login")
[ "$code" = "403" ] || fail "a POST with no Origin answered $code, expected 403"
pass "a POST with no Origin is refused (403)"

# The positive case, deliberately on a route that needs a session: it proves the request PASSED the
# middleware without spending one of the API's five sign-in attempts per minute — a budget that is
# currently shared by the whole deployment.
code=$(status -X POST -H "Origin: $URL" "$URL/api/auth/logout")
[ "$code" = "403" ] && fail "a same-origin POST was refused — the middleware is rejecting real traffic"
pass "a same-origin POST passes the check ($code)"

# ── 4. Bodies are bounded ─────────────────────────────────────────────────────
#
# App Router handlers inherit no body cap. One 121 MB POST to an unauthenticated route took the
# container from 56 MiB to 305 MiB before this was fixed.
echo "Request bodies:"
big=$(mktemp)
head -c 1000000 /dev/zero | tr '\0' 'x' > "$big"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 60 -X POST \
  -H 'content-type: application/json' -H "Origin: $URL" \
  --data-binary "@$big" "$URL/api/auth/login" 2>/dev/null || echo 000)
rm -f "$big"
[ "$code" = "413" ] || fail "a 1 MB body to an anonymous route answered $code, expected 413"
pass "an oversized body is refused (413)"

echo
echo "The deployment is what it claims to be."
