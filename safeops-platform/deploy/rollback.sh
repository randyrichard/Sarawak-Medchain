#!/usr/bin/env bash
#
# Roll back to the release deployment.sh recorded before it replaced it.
#
# Returns the application, not the database. That is deliberate and it is the safe
# direction: SafeOps migrations are additive, so an older release runs unchanged against a
# newer schema — verified by checking out the previous release and running it against an
# already-upgraded database. Restoring the database as well would discard everything the
# customer has entered since the deploy.
#
# If a migration in the new release was destructive, the application rollback is not
# enough and you need deploy/restore.sh with the pre-deploy backup. The script says so
# rather than assuming.
#
#   deploy/rollback.sh
#   deploy/rollback.sh --to <image-id>

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_env

RELEASE_DIR="$ROOT/.releases"
PREVIOUS="$RELEASE_DIR/previous.env"

if [ "${1:-}" = "--to" ] && [ -n "${2:-}" ]; then
  API_IMAGE="$2"
  WEB_IMAGE=""
  GIT_SHA="(specified on the command line)"
else
  [ -f "$PREVIOUS" ] || die "no recorded previous release at $PREVIOUS. Roll back by hand: $DC up -d --no-deps api:<tag>"
  . "$PREVIOUS"
fi

info "rolling back"
echo "  from : $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "  to   : ${GIT_SHA:-unknown}"
echo "  api  : ${API_IMAGE:-unknown}"

[ "${API_IMAGE:-unknown}" = unknown ] && die "the recorded release has no api image id — roll back by hand"
docker image inspect "$API_IMAGE" >/dev/null 2>&1 \
  || die "image $API_IMAGE is no longer on this host. It may have been pruned. Rebuild from the previous git sha instead."

confirm "Roll the application back to ${GIT_SHA:-that image}? The database is NOT touched."

# Stop before swapping, so no request is served by a half-swapped stack.
info "stopping the application"
$DC stop api web

info "starting the previous images"
docker run -d --rm --name safeops-rollback-check "$API_IMAGE" true >/dev/null 2>&1 || true
docker rm -f safeops-rollback-check >/dev/null 2>&1 || true

# Compose owns the container lifecycle, so the previous image is pinned by tagging it back
# to the name compose expects and recreating.
docker tag "$API_IMAGE" safeops-api:rollback
[ -n "${WEB_IMAGE:-}" ] && docker tag "$WEB_IMAGE" safeops-web:rollback

API_IMAGE_OVERRIDE=safeops-api:rollback $DC up -d --no-build api web \
  || die "the rollback failed to start. The database is untouched — investigate before retrying."

wait_for_ready 60

echo
ok "rolled back to ${GIT_SHA:-the recorded image}"
echo
warn "The database was NOT rolled back."
echo "  SafeOps migrations are additive, so the previous release runs against the newer"
echo "  schema unchanged. If the release you are backing out of introduced a DESTRUCTIVE"
echo "  migration, the data it dropped is only in the pre-deploy backup:"
echo
echo "    deploy/restore.sh $BACKUP_DIR/pre-deploy-<stamp>.dump"
echo
