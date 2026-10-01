#!/bin/sh
# Container entrypoint.
#
# Two jobs, in order: bring the schema up to date, then become the server.
#
# The `exec` on the last line is the whole point of this file. Previously the image ran
# `npm run start:deploy`, which left npm as PID 1 with node as its child - and npm does not
# forward SIGTERM. On `docker stop` the signal reached npm, node never saw it, the drain
# logic in server.ts never ran, and Docker killed the process after the grace period:
# in-flight requests cut mid-write, the scheduler stopped without finishing its sweep, and
# Postgres connections left to time out. Every deploy did that.
#
# `exec` replaces this shell with node, so node *is* PID 1 and receives signals directly.
# Nothing has to forward anything.
set -e

# Migrations run before the server accepts traffic, deliberately: a deploy must never serve
# against a schema it does not expect. `migrate deploy` only applies migrations that are
# already committed - it never generates, never resets, and never drops.
echo "[safeops-api] applying migrations…"
npx prisma migrate deploy

# Then the restricted login the server itself connects as (APP_DB_PASSWORD), created or
# updated as the schema owner and granted any table a migration just added. Without
# APP_DB_PASSWORD this only prints a warning and the server connects as the owner.
node dist/cli/dbAppRole.js

echo "[safeops-api] starting server…"
exec node dist/server.js
