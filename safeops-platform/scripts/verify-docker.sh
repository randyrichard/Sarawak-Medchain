#!/usr/bin/env bash
#
# Docker deployment verification for SafeChain.
#
# Could not be run on the development machine — it has no Docker, no WSL2 and no
# administrator rights. Run it on a host that does. It stops at the first failure, because
# a later check passing while an earlier one failed tells you nothing useful.
#
#   bash scripts/verify-docker.sh
#
# Requires .env.prod alongside docker-compose.prod.yml. See docs/DEPLOYMENT.md.

set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-8080}"

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

cd "$(dirname "$0")/.."

step "0. Prerequisites"
command -v docker >/dev/null || fail "docker is not on PATH"
docker info >/dev/null 2>&1 || fail "the docker daemon is not reachable — is it running?"
[ -f .env.prod ] || fail ".env.prod is missing — copy .env.prod.example and fill it in"
pass "docker $(docker --version | awk '{print $3}' | tr -d ,) and .env.prod present"

step "1. Build each image on its own"
docker build -f api/Dockerfile -t safeops-api:verify . >/dev/null
pass "api image built"
docker build -f web/Dockerfile --build-arg VITE_API_BASE_URL="http://localhost:${API_PORT}" \
  -t safeops-web:verify . >/dev/null
pass "web image built"

# The web build must refuse to produce a bundle with no backend configured.
if docker build -f web/Dockerfile -t safeops-web:should-fail . >/dev/null 2>&1; then
  fail "the web image built without VITE_API_BASE_URL — that bundle cannot reach any API"
fi
pass "web build correctly refuses a missing VITE_API_BASE_URL"

step "2. Compose build and up"
$COMPOSE build >/dev/null
$COMPOSE up -d >/dev/null
pass "stack started"

printf '  waiting for the database to report healthy'
for _ in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' "$($COMPOSE ps -q db)" 2>/dev/null)" = healthy ]; then
    printf '\n'; pass "db healthy"; break
  fi
  printf '.'; sleep 2
done
[ "$(docker inspect --format '{{.State.Health.Status}}' "$($COMPOSE ps -q db)")" = healthy ] \
  || fail "the database never became healthy"

step "3. Container networking"
$COMPOSE exec -T api getent hosts db >/dev/null || fail "the api container cannot resolve 'db'"
pass "api resolves db over the compose network"

if $COMPOSE port db 5432 >/dev/null 2>&1; then
  fail "postgres is published to the host — it must only be reachable inside the network"
fi
pass "postgres is not published to the host"

step "4. Health endpoints"
for _ in $(seq 1 30); do
  curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://localhost:${API_PORT}/health" | grep -q '"status":"ok"' || fail "/health did not report ok"
pass "/health reports ok"
curl -fsS "http://localhost:${API_PORT}/health/ready" | grep -q '"status":"ready"' || fail "/health/ready did not report ready"
pass "/health/ready reports ready"
curl -fsS "http://localhost:${WEB_PORT}/" >/dev/null || fail "the web container is not serving"
pass "web container serving on ${WEB_PORT}"

health="$(docker inspect --format '{{.State.Health.Status}}' "$($COMPOSE ps -q api)")"
[ "$health" = healthy ] || fail "the api container health check reports '$health'"
pass "api container health check reports healthy"

step "5. Persistent volumes"
for v in pgdata uploads backups; do
  docker volume ls --format '{{.Name}}' | grep -q "safeops_${v}" || fail "volume safeops_${v} is missing"
done
pass "all three named volumes exist"

$COMPOSE exec -T api sh -c 'touch /data/uploads/.probe' || fail "/data/uploads is not writable"
$COMPOSE exec -T api sh -c 'rm -f /data/uploads/.probe'
pass "/data/uploads is writable"

$COMPOSE exec -T api sh -c 'mount | grep -q " /data/uploads "' \
  || fail "/data/uploads is not a mount — uploaded evidence would be lost on redeploy"
pass "/data/uploads is a real mount, not container filesystem"

step "6. Database persistence across a full teardown"
before="$($COMPOSE exec -T db psql -U "${POSTGRES_USER:-safeops}" -d "${POSTGRES_DB:-safeops}" -tAc 'SELECT count(*) FROM "Company";' || echo 0)"
[ "$before" -gt 0 ] || fail "no companies in the database — seed it before running this check"
$COMPOSE exec -T api sh -c 'echo persistence-probe > /data/uploads/.persist'

$COMPOSE down >/dev/null
$COMPOSE up -d >/dev/null
for _ in $(seq 1 30); do
  curl -fsS "http://localhost:${API_PORT}/health/ready" >/dev/null 2>&1 && break
  sleep 2
done

after="$($COMPOSE exec -T db psql -U "${POSTGRES_USER:-safeops}" -d "${POSTGRES_DB:-safeops}" -tAc 'SELECT count(*) FROM "Company";')"
[ "$before" = "$after" ] || fail "companies went from ${before} to ${after} across a restart — THE VOLUME IS NOT PERSISTING"
pass "database survived a full down/up (${after} companies)"

$COMPOSE exec -T api sh -c 'grep -q persistence-probe /data/uploads/.persist' \
  || fail "the uploads volume did not survive a restart"
$COMPOSE exec -T api sh -c 'rm -f /data/uploads/.persist'
pass "uploads survived a full down/up"

step "7. Restart behaviour"
$COMPOSE restart api >/dev/null
sleep 8
$COMPOSE logs --tail=30 api | grep -q 'listening on' || fail "the api did not come back after restart"
pass "api restarts cleanly"

$COMPOSE logs --tail=60 api | grep -q 'scheduler running' || fail "the scheduler did not start"
pass "scheduler started"

# The restart policy must bring it back after an unexpected death.
$COMPOSE exec -T api sh -c 'kill 1' >/dev/null 2>&1 || true
sleep 15
[ "$(docker inspect --format '{{.State.Running}}' "$($COMPOSE ps -q api)")" = true ] \
  || fail "the api did not restart after its process was killed"
pass "restart policy recovers the api after an unexpected exit"

step "8. Image size"
docker images safeops-api:verify safeops-web:verify --format '  {{.Repository}}:{{.Tag}}  {{.Size}}'

step "9. Production startup and security posture"
$COMPOSE logs api | grep -q 'production' || fail "the api is not running in production mode"
pass "api running with NODE_ENV=production"

if command -v npx >/dev/null; then
  ( cd api && npx tsx scripts/security-probe.ts "http://localhost:${API_PORT}" ) \
    || fail "the security probe failed against the running container"
  pass "security probe passed against the container"
  ( cd api && npx tsx scripts/headers-probe.ts "http://localhost:${API_PORT}" "http://localhost:${WEB_PORT}" )
else
  printf '  \033[33mSKIP\033[0m  node is not available here; run the probes from a machine that has it\n'
fi

printf '\n\033[32mAll Docker deployment checks passed.\033[0m\n'
printf 'Tear down with:  %s down\n' "$COMPOSE"
