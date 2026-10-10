#!/usr/bin/env bash
#
# Deploy SafeChain.
#
# Takes a backup first, records the image digests it is replacing so rollback.sh has
# something exact to return to, builds, starts, and refuses to declare success until the
# API reports ready.
#
#   deploy/deployment.sh
#   deploy/deployment.sh --skip-backup     # first deploy only, when there is nothing to lose
#   deploy/deployment.sh --behind-cdn      # passed to preflight.sh: DNS points at a CDN
#   deploy/deployment.sh --demo-probe      # also run the signed-in security probe (needs
#                                          # the demo seed accounts: staging/demo only)
#   deploy/deployment.sh --version <tag>   # pull a published release instead of building
#                                          # (needs SAFEOPS_API_IMAGE/SAFEOPS_WEB_IMAGE set
#                                          # to registry repositories in .env.prod)

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SKIP_BACKUP=0
DEMO_PROBE=0
VERSION=""
PREFLIGHT_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-backup) SKIP_BACKUP=1 ;;
    --behind-cdn)  PREFLIGHT_ARGS+=(--behind-cdn) ;;
    --demo-probe)  DEMO_PROBE=1 ;;
    --version)     VERSION="${2:-}"; [ -n "$VERSION" ] || die "--version needs a tag"; shift ;;
    *) die "unknown option: $1" ;;
  esac
  shift
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

info "SafeChain deploy $STAMP"

# ── 1. Keep what is running now ──────────────────────────────────────────────
# The running images are tagged `before-<stamp>` by id before anything changes. A tag on
# the exact image is what makes rollback exact, and a tagged image is never pruned as
# dangling. (This used to record the ids and have rollback tag `safeops-api:rollback`,
# a name compose never read - so a rollback restarted whatever was built last.)
PREVIOUS_TAG="before-$STAMP"
API_NOW="$(running_image api)"
WEB_NOW="$(running_image web)"
if [ -n "$API_NOW" ]; then
  docker tag "$API_NOW" "$API_REPO:$PREVIOUS_TAG"
  [ -n "$WEB_NOW" ] && docker tag "$WEB_NOW" "$WEB_REPO:$PREVIOUS_TAG"
  {
    echo "# SafeChain release replaced by the deploy at $STAMP"
    echo "PREVIOUS_TAG=$PREVIOUS_TAG"
    echo "GIT_SHA=$(cat "$RELEASE_DIR/current.sha" 2>/dev/null || echo unknown)"
  } > "$RELEASE_DIR/previous.env"
  ok "kept the running release as :$PREVIOUS_TAG for rollback"
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

# ── 3. Get the new release ───────────────────────────────────────────────────
# Either pull a published, tested release by tag (the CD pipeline publishes one per merge,
# see .github/workflows/safeops-platform-release.yml), or build from this checkout.
# Either way it ends up as `:local`, which is what the containers run.
if [ -n "$VERSION" ]; then
  for repo in "$API_REPO" "$WEB_REPO"; do
    case "$repo" in
      */*) ;;
      *) die "--version pulls from a registry: set SAFEOPS_API_IMAGE and SAFEOPS_WEB_IMAGE in $ENV_FILE (e.g. ghcr.io/<owner>/safeops-api)" ;;
    esac
  done
  info "fetching release $VERSION"
  # Release tags are immutable (one per commit), so an image already on this host is the
  # release; only a missing one is pulled.
  for img in "$API_REPO:$VERSION" "$WEB_REPO:$VERSION"; do
    docker image inspect "$img" >/dev/null 2>&1 || docker pull "$img" \
      || die "could not pull $img. Nothing was changed."
  done
  docker tag "$API_REPO:$VERSION" "$API_REPO:local"
  docker tag "$WEB_REPO:$VERSION" "$WEB_REPO:local"
  RELEASE="$VERSION"
  ok "release $VERSION ready"
else
  info "building images"
  $DC build
  RELEASE="$(git rev-parse --short HEAD 2>/dev/null || echo "build-$STAMP")"
  # A second name for the same image, so `docker images` shows which commit is which.
  docker tag "$API_REPO:local" "$API_REPO:$RELEASE"
  docker tag "$WEB_REPO:local" "$WEB_REPO:$RELEASE"
  ok "images built ($RELEASE)"
fi

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

echo "$RELEASE" > "$RELEASE_DIR/current.sha"

# Keep the five most recent `before-*` images for rollback; older ones go, or every deploy
# would leave a full image behind until the disk filled.
for repo in "$API_REPO" "$WEB_REPO"; do
  docker images --format '{{.Tag}}' "$repo" | { grep '^before-' || true; } | sort -r | tail -n +6 \
    | while read -r old; do docker rmi "$repo:$old" >/dev/null 2>&1 || true; done
done

# ── 6. Smoke test from the outside ───────────────────────────────────────────
# Anonymous and read-only, so it is safe against a customer's data: is it serving, is it
# closed to callers without a session, are the security headers on. This used to run the
# authenticated security probe, which signs in as the demo accounts - and a production
# database has none, so every real deploy ended in "DO NOT hand this to a customer".
info "smoke-testing the deployment"
"$DEPLOY_DIR/smoke.sh" "http://localhost:${API_PORT:-4000}" "http://localhost:${WEB_PORT:-8080}" \
  || die "the smoke test failed — DO NOT hand this to a customer. Roll back: deploy/rollback.sh"

# The authenticated probe, for a demo or staging deployment that has the seeded accounts.
if [ "$DEMO_PROBE" = 1 ]; then
  info "running the security probe (demo accounts)"
  ( cd api && npx tsx scripts/security-probe.ts "http://localhost:${API_PORT:-4000}" ) \
    || die "the security probe failed — DO NOT hand this to a customer. Roll back: deploy/rollback.sh"
  ok "security probe passed"
fi

echo
ok "deploy $STAMP complete"
echo "  rollback with : deploy/rollback.sh"
echo "  logs          : $DC logs -f api"
