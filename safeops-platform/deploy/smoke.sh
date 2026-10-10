#!/usr/bin/env bash
#
# Smoke-test a running SafeChain deployment from the outside. Read-only and anonymous.
#
# The last step of every deploy and rollback, and of CI's docker job: it answers "is what
# just started actually serving, and serving safely?" without a login and without touching
# customer data, so it is safe against production.
#
#   deploy/smoke.sh                                  # API and web on this host's ports
#   deploy/smoke.sh https://api.example.com https://app.example.com
#
# Needs only bash and curl. Exits non-zero if any check fails.
set -uo pipefail

API="${1:-http://localhost:${API_PORT:-4000}}"
WEB="${2:-http://localhost:${WEB_PORT:-8080}}"
FAILS=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { FAILS=$((FAILS + 1)); printf '  \033[31m✗\033[0m %s\n' "$*"; }

# status <url> [curl args...] -> HTTP status code, or 000 when nothing answered
status() { local u="$1"; shift; curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$u"; }
# headers <url> [curl args...] -> response headers, lower-cased names
headers() { local u="$1"; shift; curl -s -D - -o /dev/null --max-time 10 "$@" "$u" | tr -d '\r'; }

expect() { # expect <description> <expected> <actual>
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (expected $2, got $3)"; fi
}
has() { # has <description> <header regex> <headers>
  if grep -qi "$2" <<<"$3"; then pass "$1"; else fail "$1"; fi
}
lacks() { # lacks <description> <header regex> <headers>
  if grep -qi "$2" <<<"$3"; then fail "$1"; else pass "$1"; fi
}

echo "SafeChain smoke test — api $API, web $WEB"

# ── Up ───────────────────────────────────────────────────────────────────────
expect "API is alive (/health)" 200 "$(status "$API/health")"
expect "API can reach the database (/health/ready)" 200 "$(status "$API/health/ready")"

# ── Closed to anonymous callers ──────────────────────────────────────────────
expect "who-am-I refuses a request with no session" 401 "$(status "$API/auth/me")"
expect "who-am-I refuses a forged token" 401 "$(status "$API/auth/me" -H 'Authorization: Bearer not-a-real-token')"
expect "incident register refuses a request with no session" 401 "$(status "$API/incidents?companyId=any")"
expect "integration API refuses a request with no key" 401 "$(status "$API/v1/incidents")"
METRICS="$(status "$API/metrics")"
if [ "$METRICS" = 404 ] || [ "$METRICS" = 401 ]; then
  pass "metrics are not public (HTTP $METRICS)"
else
  fail "metrics answered HTTP $METRICS to an anonymous request"
fi

# ── Headers ──────────────────────────────────────────────────────────────────
API_H="$(headers "$API/health" -H 'Origin: https://not-allowed.invalid')"
has   "API sends nosniff" '^x-content-type-options: nosniff' "$API_H"
lacks "API hides its framework (no X-Powered-By)" '^x-powered-by' "$API_H"
has   "API tags responses with a request id" '^x-request-id: ' "$API_H"
lacks "API refuses unknown origins (CORS)" '^access-control-allow-origin' "$API_H"

# ── Web ──────────────────────────────────────────────────────────────────────
expect "web app is served" 200 "$(status "$WEB/")"
expect "deep links reach the app (SPA routing)" 200 "$(status "$WEB/incidents")"
WEB_H="$(headers "$WEB/")"
has "web sends a Content-Security-Policy" '^content-security-policy: ' "$WEB_H"
has "web refuses to be framed" '^x-frame-options: deny' "$WEB_H"
has "index.html is not cached (new releases load at once)" '^cache-control: no-store' "$WEB_H"

echo
if [ "$FAILS" -gt 0 ]; then
  printf '\033[31m%s smoke check(s) failed.\033[0m\n' "$FAILS"
  exit 1
fi
printf '\033[32mAll smoke checks passed.\033[0m\n'
