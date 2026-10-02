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
#   deploy/rollback.sh                # to the release the last deploy replaced
#   deploy/rollback.sh --to <tag>     # to any kept or published release, e.g. before-2026-10-02-0912
#                                     # or a registry tag such as a commit sha

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_env

RELEASE_DIR="$ROOT/.releases"
PREVIOUS="$RELEASE_DIR/previous.env"

API_TARGET=""
WEB_TARGET=""
if [ "${1:-}" = "--to" ] && [ -n "${2:-}" ]; then
  API_TARGET="$API_REPO:$2"
  WEB_TARGET="$WEB_REPO:$2"
  GIT_SHA="$2"
else
  [ -f "$PREVIOUS" ] || die "no recorded previous release at $PREVIOUS. Name one: deploy/rollback.sh --to <tag>"
  # shellcheck disable=SC1090
  . "$PREVIOUS"
  if [ -n "${PREVIOUS_TAG:-}" ]; then
    API_TARGET="$API_REPO:$PREVIOUS_TAG"
    WEB_TARGET="$WEB_REPO:$PREVIOUS_TAG"
  else
    # A record written before releases were tagged: image ids.
    API_TARGET="${API_IMAGE:-}"
    WEB_TARGET="${WEB_IMAGE:-}"
  fi
fi

info "rolling back"
echo "  to   : ${GIT_SHA:-unknown}"
echo "  api  : ${API_TARGET:-unknown}"
echo "  web  : ${WEB_TARGET:-unknown}"
[ -n "$API_TARGET" ] && [ "$API_TARGET" != unknown ] || die "the recorded release names no api image"

# A published release may not be on this host yet; a kept one must be.
for img in "$API_TARGET" ${WEB_TARGET:+"$WEB_TARGET"}; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    case "$img" in
      */*) docker pull "$img" || die "$img is not on this host and could not be pulled. Nothing was changed." ;;
      *) die "$img is no longer on this host. Nothing was changed. Kept releases: docker images $API_REPO" ;;
    esac
  fi
done

confirm "Roll the application back to ${GIT_SHA:-that release}? The database is NOT touched."

# Point `:local` - the tag the containers run - at the release, then recreate. The worker
# runs the API's image, so it moves with it.
docker tag "$API_TARGET" "$API_REPO:local"
[ -n "$WEB_TARGET" ] && docker tag "$WEB_TARGET" "$WEB_REPO:local"

info "restarting on the previous release"
$DC up -d --no-build --force-recreate api worker web \
  || die "the rollback failed to start. The database is untouched — investigate before retrying."

wait_for_ready 60

[ "$(running_image api)" = "$(docker image inspect --format '{{.Id}}' "$API_TARGET")" ] \
  || die "the API is not running the requested image after the rollback. Check: $DC ps"
echo "${GIT_SHA:-unknown}" > "$RELEASE_DIR/current.sha"

"$DEPLOY_DIR/smoke.sh" "http://localhost:${API_PORT:-4000}" "http://localhost:${WEB_PORT:-8080}" \
  || warn "the rolled-back release fails the smoke test - see above"

echo
ok "rolled back to ${GIT_SHA:-the recorded release}"
echo
warn "The database was NOT rolled back."
echo "  SafeOps migrations are additive, so the previous release runs against the newer"
echo "  schema unchanged. If the release you are backing out of introduced a DESTRUCTIVE"
echo "  migration, the data it dropped is only in the pre-deploy backup:"
echo
echo "    deploy/restore.sh $BACKUP_DIR/db-pre-deploy-<stamp>.dump"
echo
