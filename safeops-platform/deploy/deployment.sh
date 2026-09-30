#!/usr/bin/env bash
#
# Deploy SafeOps.
#
# Takes a backup first, records the image digests it is replacing so rollback.sh has
# something exact to return to, builds, starts, and refuses to declare success until the
# API reports ready.
#
#   deploy/deployment.sh
#   deploy/deployment.sh --skip-backup     # first deploy only, when there is nothing to lose
#   deploy/deployment.sh --behind-cdn      # passed to preflight.sh: DNS points at a CDN

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SKIP_BACKUP=0
PREFLIGHT_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=1 ;;
    --behind-cdn)  PREFLIGHT_ARGS+=(--behind-cdn) ;;
    *) die "unknown option: $arg" ;;
  esac
done

require_docker
require_env

# Before anything is built or stopped: a deployment whose domains do not point here, or
# whose app and API cannot share a cookie, boots cleanly and serves nobody.
"$DEPLOY_DIR/preflight.sh" ${PREFLIGHT_ARGS[@]+"${PREFLIGHT_ARGS[@]}"} \
  || die "pre-flight failed - fix the above, then deploy again. Nothing was changed."

STAMP="$(date +%F-%H%M%S)"
RELEASE_DIR="$ROOT/.releases"
mkdir -p "$RELEASE_DIR"

info "SafeOps deploy $STAMP"

# ── 1. Record what is running now ────────────────────────────────────────────
# Image IDs rather than tags: a tag can be moved, an ID cannot. This is what makes a
# rollback exact rather than approximate.
if $DC ps -q api >/dev/null 2>&1 && [ -n "$($DC ps -q api 2>/dev/null)" ]; then
  {
    echo "# SafeOps release recorded $STAMP"
    echo "GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    echo "API_IMAGE=$(docker inspect --format '{{.Image}}' "$($DC ps -q api)" 2>/dev/null || echo unknown)"
    echo "WEB_IMAGE=$(docker inspect --format '{{.Image}}' "$($DC ps -q web)" 2>/dev/null || echo unknown)"
  } > "$RELEASE_DIR/previous.env"
  ok "recorded the running release for rollback"
else
  warn "nothing is running — this looks like a first deploy"
fi

# ── 2. Back up before changing anything ──────────────────────────────────────
if [ "$SKIP_BACKUP" = 0 ]; then
  info "taking a pre-deploy backup"
  "$DEPLOY_DIR/backup.sh" --tag "pre-deploy-$STAMP"
else
  warn "skipping the backup because --skip-backup was passed"
fi

# ── 3. Build ─────────────────────────────────────────────────────────────────
info "building images"
$DC build
ok "images built"

# ── 4. Start ─────────────────────────────────────────────────────────────────
# Migrations run inside the API container before it serves, so there is no separate
# migration step here — and therefore no window where the app is up against a schema it
# does not expect.
info "starting the stack"
$DC up -d
ok "containers started"

wait_for_ready 60

# ── 5. Verify before declaring success ───────────────────────────────────────
info "verifying the deployment"

$DC ps --format '  {{.Service}}  {{.Status}}'

if ! worker_started; then
  warn "the worker did not report starting — reminders will not fire. Check: $DC logs worker"
fi

MIGRATIONS_PENDING=$($DC exec -T api npx prisma migrate status 2>&1 | grep -ci 'not yet been applied' || true)
if [ "$MIGRATIONS_PENDING" -gt 0 ]; then
  die "migrations are still pending after start. Check: $DC logs api"
fi
ok "schema is up to date"

if command -v npx >/dev/null && [ -d api ]; then
  info "running the security probe against the deployment"
  ( cd api && npx tsx scripts/security-probe.ts "http://localhost:${API_PORT:-4000}" ) \
    || die "the security probe failed — DO NOT hand this to a customer. Roll back: deploy/rollback.sh"
  ok "security probe passed"
else
  warn "node is unavailable here; run api/scripts/security-probe.ts from a machine that has it"
fi

echo
ok "deploy $STAMP complete"
echo "  rollback with : deploy/rollback.sh"
echo "  logs          : $DC logs -f api"
