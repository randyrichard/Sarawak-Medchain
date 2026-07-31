#!/usr/bin/env bash
#
# Is SafeOps healthy?
#
# Exits 0 when everything is well, 1 when something needs attention. Suitable for cron,
# a monitoring agent, or an operator who has just been telephoned.
#
#   deploy/healthcheck.sh
#   deploy/healthcheck.sh --quiet    # exit code only
#
# Checks the things that actually go wrong, in the order they matter: is it serving, can
# it reach the database, is the scheduler running, is the disk filling, are backups fresh.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1
say() { [ "$QUIET" = 1 ] || printf '%s\n' "$*"; }

PROBLEMS=0
report_ok()   { [ "$QUIET" = 1 ] || printf '  \033[32m✓\033[0m %s\n' "$*"; }
report_bad()  { PROBLEMS=$((PROBLEMS + 1)); printf '  \033[31m✗\033[0m %s\n' "$*"; }
report_warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

require_docker
require_env

API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-8080}"

say ""
say "SafeOps health — $(date '+%F %H:%M:%S')"
say ""

# ── Containers ───────────────────────────────────────────────────────────────
for svc in db api web; do
  cid="$($DC ps -q "$svc" 2>/dev/null || true)"
  if [ -z "$cid" ]; then
    report_bad "$svc is not running"
    continue
  fi
  state="$(docker inspect --format '{{.State.Status}}' "$cid")"
  restarts="$(docker inspect --format '{{.RestartCount}}' "$cid")"
  if [ "$state" = running ]; then
    if [ "$restarts" -gt 5 ]; then
      report_warn "$svc is running but has restarted $restarts times — something is crashing"
    else
      report_ok "$svc running"
    fi
  else
    report_bad "$svc is $state"
  fi
done

# ── Serving ──────────────────────────────────────────────────────────────────
if curl -fsS --max-time 5 "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
  report_ok "API responding"
else
  report_bad "API is not responding on :${API_PORT}"
fi

# Readiness is the one that matters: it reports on the database, not just the process.
READY="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/health/ready" 2>/dev/null || echo 000)"
case "$READY" in
  200) report_ok "database reachable" ;;
  503) report_bad "database unreachable — the API is up but cannot serve data" ;;
  *)   report_bad "readiness check returned $READY" ;;
esac

curl -fsS --max-time 5 "http://localhost:${WEB_PORT}/" >/dev/null 2>&1 \
  && report_ok "web serving" || report_bad "web is not serving on :${WEB_PORT}"

# ── Scheduler ────────────────────────────────────────────────────────────────
# Reminders are the product's central promise. A stack that is up but not sweeping is
# quietly failing at the thing the customer bought.
if $DC logs --since 24h api 2>/dev/null | grep -q 'scheduler running'; then
  report_ok "scheduler started within the last 24h"
elif $DC logs api 2>/dev/null | tail -200 | grep -q 'scheduler running'; then
  report_ok "scheduler started (before the 24h window)"
else
  report_bad "no scheduler start in the logs — reminders and escalations are not firing"
fi

SWEEP_FAILURES=$($DC logs --since 24h api 2>/dev/null | grep -c 'sweep failed' || true)
[ "${SWEEP_FAILURES:-0}" -gt 0 ] && report_warn "$SWEEP_FAILURES sweep failure(s) in 24h"

# ── Errors ───────────────────────────────────────────────────────────────────
FIVES=$($DC logs --since 24h api 2>/dev/null | grep -c '"status":5' || true)
if [ "${FIVES:-0}" -eq 0 ]; then
  report_ok "no 5xx responses in 24h"
else
  UNAVAILABLE=$($DC logs --since 24h api 2>/dev/null | grep -c '"status":503' || true)
  if [ "${FIVES:-0}" -eq "${UNAVAILABLE:-0}" ]; then
    report_warn "$FIVES × 503 in 24h — the database was briefly unreachable and the API recovered"
  else
    report_bad "$FIVES 5xx response(s) in 24h, $((FIVES - UNAVAILABLE)) of them genuine faults"
  fi
fi

# ── Database ─────────────────────────────────────────────────────────────────
CONNS=$($DC exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='${POSTGRES_DB}';" 2>/dev/null | tr -d ' ' || echo "?")
MAXC=$($DC exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SHOW max_connections;' 2>/dev/null | tr -d ' ' || echo "?")
if [ "$CONNS" != "?" ] && [ "$MAXC" != "?" ]; then
  if [ "$CONNS" -gt $((MAXC * 80 / 100)) ]; then
    report_bad "database connections ${CONNS}/${MAXC} — above 80%, the pool is close to exhaustion"
  else
    report_ok "database connections ${CONNS}/${MAXC}"
  fi
fi

# ── Disk ─────────────────────────────────────────────────────────────────────
# A full disk stops PostgreSQL, and it is the failure most likely to arrive unannounced.
USE=$(df -P "$ROOT" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "${USE:-0}" -ge 90 ]; then
  report_bad "disk ${USE}% full — PostgreSQL stops when it runs out"
elif [ "${USE:-0}" -ge 75 ]; then
  report_warn "disk ${USE}% full"
else
  report_ok "disk ${USE}% used"
fi

# ── Backups ──────────────────────────────────────────────────────────────────
if [ -d "$BACKUP_DIR" ]; then
  NEWEST=$(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*.dump' -mtime -2 2>/dev/null | head -1)
  if [ -n "$NEWEST" ]; then
    report_ok "backup within 48h  ($(basename "$NEWEST"), $(du -h "$NEWEST" | cut -f1))"
  else
    report_bad "no database backup in the last 48 hours"
  fi
else
  report_warn "$BACKUP_DIR does not exist — backups are not configured"
fi

say ""
if [ "$PROBLEMS" -eq 0 ]; then
  say "Healthy."
  exit 0
fi
printf '\033[31m%s problem(s) need attention.\033[0m See docs/SUPPORT_RUNBOOK.md\n' "$PROBLEMS"
exit 1
