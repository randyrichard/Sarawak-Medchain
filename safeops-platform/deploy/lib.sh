#!/usr/bin/env bash
# Shared by every script in this directory. Sourced, not executed.
#
# The rules these encode: fail loudly rather than continue in an unknown state, never
# assume the working directory, and never print a secret.

set -euo pipefail

# Every script resolves the repository root from its own location, so they work from
# anywhere — a cron entry, a CI job, or an operator's home directory.
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

DC="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

info()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '\033[31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

require_docker() {
  command -v docker >/dev/null || die "docker is not installed. See docs/DOCKER_VERIFICATION.md"
  docker info >/dev/null 2>&1 || die "the docker daemon is not reachable — is it running?"
}

require_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing. Copy .env.prod.example and fill it in."
  # Sourced only to read values for psql/pg_dump. Nothing is echoed.
  set -a; . "./$ENV_FILE"; set +a
  : "${POSTGRES_USER:?POSTGRES_USER is not set in $ENV_FILE}"
  : "${POSTGRES_DB:=safeops}"
  # Caddy is the only thing listening on 80/443, and it runs under the `tls` profile. A
  # bare `up` leaves it stopped: the stack reports healthy on loopback and nobody outside
  # the machine can reach it. So a configured domain turns the profile on for every script
  # here; leave SAFEOPS_APP_DOMAIN empty when something else terminates TLS.
  if [ -n "${SAFEOPS_APP_DOMAIN:-}" ]; then
    DC="$DC --profile tls"
  fi
  # Image repositories. Local names by default; a registry path (ghcr.io/owner/safeops-api)
  # when releases are pulled rather than built - see docs/PRODUCTION_PLATFORM.md.
  # shellcheck disable=SC2034  # used by the scripts that source this file
  API_REPO="${SAFEOPS_API_IMAGE:-safeops-api}"
  # shellcheck disable=SC2034
  WEB_REPO="${SAFEOPS_WEB_IMAGE:-safeops-web}"
  # The containers always run `:local`; a release is chosen by what `:local` points at.
  # Exported so a stray SAFEOPS_VERSION in the env file cannot point compose elsewhere.
  export SAFEOPS_VERSION=local
}

# The image a running service's container was created from, by id, or empty.
running_image() {
  local cid
  cid="$($DC ps -q "$1" 2>/dev/null | head -n1)"
  [ -n "$cid" ] && docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || true
}

# Waits for the API to report ready rather than merely alive: readiness checks the
# database, and a container that is up but cannot reach Postgres is not a deploy that
# succeeded.
wait_for_ready() {
  local port="${API_PORT:-4000}" tries="${1:-60}"
  info "waiting for the API to report ready"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS "http://localhost:${port}/health/ready" >/dev/null 2>&1; then
      ok "API ready"
      return 0
    fi
    sleep 2
  done
  die "the API did not become ready within $((tries * 2))s. Check: $DC logs api"
}

confirm() {
  # Skipped when non-interactive, so cron and CI are not blocked by a prompt. Anything
  # destructive should also require an explicit flag, not just this.
  [ -t 0 ] || return 0
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || die "cancelled"
}

# The worker starts once the API is healthy and logs "scheduler running" a moment later;
# asking once, immediately, reported a healthy stack as broken.
worker_started() {
  for _ in $(seq 1 15); do
    $DC logs --tail=50 worker 2>/dev/null | grep -q 'scheduler running' && return 0
    sleep 2
  done
  return 1
}
