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
