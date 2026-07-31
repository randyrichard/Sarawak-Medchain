#!/usr/bin/env bash
#
# Bring SafeOps up.
#
# For a host reboot, or after a planned stop. Not a deploy — it builds nothing and changes
# no images. Use deploy/deployment.sh to ship a new version.
#
#   deploy/startup.sh
#
# Suitable for a systemd unit or an @reboot cron entry:
#   @reboot /srv/safeops/deploy/startup.sh >> /var/log/safeops-startup.log 2>&1

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_env

info "starting SafeOps"

# Compose starts the database first and waits for its health check, so the API never comes
# up against a database that is not accepting connections yet.
$DC up -d

wait_for_ready 90

# Migrations run inside the API container before it serves. If any are still pending after
# it reports ready, something has gone wrong and the app is live against a schema it does
# not expect — worth failing loudly rather than leaving it running.
PENDING=$($DC exec -T api npx prisma migrate status 2>&1 | grep -ci 'not yet been applied' || true)
[ "$PENDING" -eq 0 ] || die "migrations are pending after startup. Check: $DC logs api"
ok "schema up to date"

$DC logs --tail=40 api 2>/dev/null | grep -q 'scheduler running' \
  && ok "scheduler running" \
  || warn "the scheduler did not report starting — reminders will not fire"

echo
"$DEPLOY_DIR/healthcheck.sh" || warn "startup completed but the health check found problems"
