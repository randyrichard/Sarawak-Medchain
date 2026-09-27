#!/usr/bin/env bash
#
# Can this server go live?
#
# Reads .env.prod and checks the things that each pass the API's own boot validation
# and still leave a deployment nobody can use: domains that do not point here, an app and
# API on different registrable domains, a mail password that is still the template's. Run
# it on the server, after DNS is set and before the first `up`. Nothing is started,
# nothing is changed, and no secret is printed - only the names of variables.
#
#   deploy/preflight.sh
#   deploy/preflight.sh --behind-cdn   # the domains resolve to a CDN (Cloudflare), not here
#
# Exits 1 if anything would stop a customer signing in, 0 otherwise. Warnings do not fail
# it: they are the things you can go live without and should know you are.
#
# deploy/deployment.sh runs this first, so a deploy that cannot work stops before it builds.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BEHIND_CDN=0
[ "${1:-}" = "--behind-cdn" ] && BEHIND_CDN=1

FAILS=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { FAILS=$((FAILS + 1)); printf '  \033[31m✗\033[0m %s\n' "$*"; }
note() { printf '  \033[33m!\033[0m %s\n' "$*"; }

require_env

host_of() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://##; s#[:/].*##' | tr 'A-Z' 'a-z'; }

# The registrable domain, closely enough to catch the mistake that matters. The browser
# decides this from the Public Suffix List; this knows the common two-level suffixes
# (com.my, co.uk, com.sg ...) and otherwise takes the last two labels. It can be fooled by
# an unusual suffix, never into failing a pair that shares one.
registrable() {
  local h="$1" last2 last3
  last2="$(printf '%s' "$h" | awk -F. 'NF>=2 {print $(NF-1)"."$NF}')"
  last3="$(printf '%s' "$h" | awk -F. 'NF>=3 {print $(NF-2)"."$(NF-1)"."$NF}')"
  if printf '%s' "$last2" | grep -qE '^(com|net|org|edu|gov|co|ac|mil|biz|name|info)\.[a-z]{2}$' && [ -n "$last3" ]; then
    printf '%s' "$last3"
  else
    printf '%s' "$last2"
  fi
}

# Addresses a name resolves to, one per line. getent is authoritative on Linux, which is
# the deployment target.
addresses_of() {
  if command -v getent >/dev/null 2>&1; then
    getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u || true
  elif command -v dig >/dev/null 2>&1; then
    { dig +short A "$1"; dig +short AAAA "$1"; } 2>/dev/null | grep -E '^[0-9a-fA-F:.]+$' | sort -u || true
  fi
}

# This server's own addresses: every interface, plus the public address as the internet
# sees it, which on a cloud VM behind 1:1 NAT is on no interface at all.
own_addresses() {
  { hostname -I 2>/dev/null | tr ' ' '\n'
    ip -o addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1
    curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null; echo
    curl -6 -fsS --max-time 5 https://api64.ipify.org 2>/dev/null; echo
  } | grep -E '^[0-9a-fA-F:.]+$' | sort -u || true
}

echo
echo "SafeOps pre-flight — $ENV_FILE"
echo

# ── Nothing left from the template ───────────────────────────────────────────
# Names only. The values in this file are secrets.
LEFTOVER="$(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE" | grep -iE 'REPLACE_ME|example\.(com|org|net)' | cut -d= -f1 | tr '\n' ' ' || true)"
if [ -n "$LEFTOVER" ]; then
  fail "still set to a template placeholder: $LEFTOVER"
else
  pass "no template placeholders left"
fi

# ── Secrets ──────────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ] && [ -z "${POSTGRES_PASSWORD:-}" ]; then
  fail "POSTGRES_PASSWORD is empty (openssl rand -base64 24)"
else
  pass "database credential set"
fi
if [ -z "${JWT_PRIVATE_KEY_B64:-}" ] || [ -z "${JWT_PUBLIC_KEY_B64:-}" ]; then
  fail "JWT_PRIVATE_KEY_B64 / JWT_PUBLIC_KEY_B64 are empty (npm run keygen)"
else
  pass "signing keys set"
fi
if [ "${TRUST_PROXY:-loopback,linklocal,uniquelocal}" != "false" ] && [ -z "${PROXY_TOKEN:-}" ]; then
  fail "PROXY_TOKEN is empty (openssl rand -hex 32)"
else
  pass "proxy token set"
fi

# ── Addresses agree with each other ──────────────────────────────────────────
APP_HOST="$(host_of "${APP_PUBLIC_URL:-}")"
API_HOST="$(host_of "${VITE_API_BASE_URL:-}")"
APP_DOMAIN="$(printf '%s' "${SAFEOPS_APP_DOMAIN:-}" | tr 'A-Z' 'a-z')"
API_DOMAIN="$(printf '%s' "${SAFEOPS_API_DOMAIN:-}" | tr 'A-Z' 'a-z')"

case "${APP_PUBLIC_URL:-}" in
  https://*) pass "APP_PUBLIC_URL is https" ;;
  "")        fail "APP_PUBLIC_URL is empty - no invitation or reset link can be built" ;;
  *)         fail "APP_PUBLIC_URL must be https - the API refuses to boot otherwise" ;;
esac
case "${VITE_API_BASE_URL:-}" in
  https://*) pass "VITE_API_BASE_URL is https" ;;
  *)         fail "VITE_API_BASE_URL must be an https URL of the API" ;;
esac

if [ -n "$APP_DOMAIN" ]; then
  [ -n "$API_DOMAIN" ] || fail "SAFEOPS_APP_DOMAIN is set but SAFEOPS_API_DOMAIN is not"
  [ -n "${ACME_EMAIL:-}" ] || fail "ACME_EMAIL is empty - Caddy will not start without it"
  [ "$APP_HOST" = "$APP_DOMAIN" ] \
    && pass "APP_PUBLIC_URL matches SAFEOPS_APP_DOMAIN" \
    || fail "APP_PUBLIC_URL ($APP_HOST) is not SAFEOPS_APP_DOMAIN ($APP_DOMAIN) - links would point somewhere Caddy does not serve"
  [ "$API_HOST" = "$API_DOMAIN" ] \
    && pass "VITE_API_BASE_URL matches SAFEOPS_API_DOMAIN" \
    || fail "VITE_API_BASE_URL ($API_HOST) is not SAFEOPS_API_DOMAIN ($API_DOMAIN) - the app would call an address Caddy does not serve"
else
  note "SAFEOPS_APP_DOMAIN is empty, so the tls profile is off - something else must terminate TLS"
fi

# The refresh cookie is SameSite=Strict: split domains sign everybody out on every reload,
# and nothing reports it.
if [ -n "$APP_HOST" ] && [ -n "$API_HOST" ]; then
  if [ "$(registrable "$APP_HOST")" = "$(registrable "$API_HOST")" ]; then
    pass "app and API share a registrable domain ($(registrable "$APP_HOST"))"
  else
    fail "app ($APP_HOST) and API ($API_HOST) are on different registrable domains - the SameSite=Strict refresh cookie will not be sent and nobody stays signed in"
  fi
fi

if [ -n "${COOKIE_DOMAIN:-}" ] && [ -n "$APP_HOST" ]; then
  CD="$(printf '%s' "$COOKIE_DOMAIN" | sed 's/^\.//' | tr 'A-Z' 'a-z')"
  case ".$APP_HOST" in *".$CD") ;; *) fail "COOKIE_DOMAIN ($COOKIE_DOMAIN) does not cover $APP_HOST" ;; esac
  case ".$API_HOST" in *".$CD") pass "COOKIE_DOMAIN covers both hosts" ;; *) fail "COOKIE_DOMAIN ($COOKIE_DOMAIN) does not cover $API_HOST" ;; esac
fi

# Invitation links open APP_PUBLIC_URL, which then calls the API from that origin.
if [ -n "${APP_PUBLIC_URL:-}" ]; then
  ORIGIN="$(printf '%s' "$APP_PUBLIC_URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
  if printf '%s' ",${CORS_ORIGINS:-}," | tr -d ' ' | grep -qiF ",$ORIGIN,"; then
    pass "CORS_ORIGINS allows $ORIGIN"
  else
    fail "CORS_ORIGINS does not include $ORIGIN - every invitation and reset link opens a page whose API calls the browser refuses"
  fi
fi

# ── DNS points here ──────────────────────────────────────────────────────────
# Caddy proves control of each name to get a certificate. A name that points elsewhere
# fails validation, and repeated failures hit Let's Encrypt's rate limit - so this is
# checked before the stack starts, not discovered from Caddy's logs after.
if [ -n "$APP_DOMAIN" ] && [ -n "$API_DOMAIN" ]; then
  OWN="$(own_addresses)"
  for name in "$APP_DOMAIN" "$API_DOMAIN"; do
    ADDRS="$(addresses_of "$name")"
    if [ -z "$ADDRS" ]; then
      fail "$name does not resolve - create its A record, pointing at this server, and wait for it to propagate"
      continue
    fi
    if [ "$BEHIND_CDN" = 1 ]; then
      pass "$name resolves ($(echo "$ADDRS" | tr '\n' ' ')) - not compared with this server, --behind-cdn"
    elif [ -z "$OWN" ]; then
      note "$name resolves, but this server's own address could not be determined to compare"
    elif printf '%s\n' "$ADDRS" | grep -qxF -f <(printf '%s\n' "$OWN"); then
      pass "$name resolves to this server"
    else
      fail "$name resolves to $(echo "$ADDRS" | tr '\n' ' ')which is not this server ($(echo "$OWN" | tr '\n' ' ')). Behind Cloudflare? re-run with --behind-cdn"
    fi
  done
fi

# ── Ports ────────────────────────────────────────────────────────────────────
case "${BIND_HOST:-127.0.0.1}" in
  127.0.0.1|localhost|::1) pass "API and web ports bound to loopback" ;;
  *) note "BIND_HOST=${BIND_HOST} publishes plaintext HTTP past TLS - make sure the firewall closes $WEB_PORT and $API_PORT" ;;
esac

# ── Mail ─────────────────────────────────────────────────────────────────────
# Optional to boot, not optional to onboard: without it a customer's administrator cannot
# invite their own staff or reset a password without contacting you.
if [ -n "${RESEND_API_KEY:-}" ] || [ -n "${SMTP_URL:-}" ]; then
  [ -n "${REPORT_EMAIL_FROM:-}" ] || fail "a mail transport is set but REPORT_EMAIL_FROM is empty - the API refuses to boot"
  if [ -z "${RESEND_API_KEY:-}" ]; then
    SMTP_PASS="$(printf '%s' "$SMTP_URL" | sed -nE 's#^[a-z]+://[^:@/]*:([^@]*)@.*#\1#p')"
    if [ -z "$SMTP_PASS" ]; then
      note "SMTP_URL has no password - fine only for a relay that authenticates by address"
    elif printf '%s' "$SMTP_PASS" | grep -qiE '^(app_?password|password|pass|changeme|secret|replace_?me|x+|\*+|<.*>|\[.*\]|\{.*\})$'; then
      note "SMTP_URL's password is still the template's - mail will not send. Invitations and resets fall back to a link you pass on by hand"
    else
      pass "SMTP transport configured - prove it once up: $DC exec api node dist/cli/verifyMail.js"
    fi
  else
    pass "Resend transport configured"
  fi
else
  note "no mail transport - invitations, password resets and scheduled reports will not be emailed"
fi

echo
if [ "$FAILS" -eq 0 ]; then
  echo "Ready."
  exit 0
fi
printf '\033[31m%s problem(s) would stop this deployment working.\033[0m\n' "$FAILS"
exit 1
