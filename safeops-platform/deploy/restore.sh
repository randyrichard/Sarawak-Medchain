#!/usr/bin/env bash
#
# Restore the database and uploads from a backup taken by backup.sh.
#
# This is destructive: it drops the live database. It requires an explicit confirmation
# and takes a safety dump of the current state first, because "restore the wrong file" is
# a mistake people make at three in the morning.
#
#   deploy/restore.sh /backups/db-2026-08-01-0200.dump
#   deploy/restore.sh /backups/db-2026-08-01-0200.dump --yes    # non-interactive
#
# For recovering one table rather than everything, see docs/RESTORE.md — restore beside
# the live database and copy across, do not run this.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_env

DUMP="${1:-}"
[ -n "$DUMP" ] || die "usage: deploy/restore.sh <dump-file> [--yes]"
[ -f "$DUMP" ] || die "$DUMP does not exist"

AUTO=0
[ "${2:-}" = "--yes" ] && AUTO=1

STAMP="$(basename "$DUMP" | sed 's/^db-//; s/\.dump$//')"
UPLOADS="$(dirname "$DUMP")/uploads-${STAMP}.tar.gz"
MANIFEST="$(dirname "$DUMP")/manifest-${STAMP}.txt"

info "restore from $DUMP"
[ -f "$UPLOADS" ] && ok "matching uploads archive found" || warn "no matching uploads archive — attachments will point at files that are not there"
[ -f "$MANIFEST" ] && ok "manifest found — the restore will be verified against it" || warn "no manifest — the restore cannot be verified against expected counts"

# Readable before anything is dropped.
$DC exec -T db pg_restore --list /dev/stdin < "$DUMP" >/dev/null 2>&1 \
  || die "pg_restore cannot read this file. Do not proceed — the live database is intact."
ok "the dump is readable"

echo
warn "This DROPS the live database and replaces it with the contents of that file."
warn "Anything entered since the backup was taken will be gone."
[ "$AUTO" = 1 ] || confirm "Proceed?"

# ── Safety dump ──────────────────────────────────────────────────────────────
SAFETY="$BACKUP_DIR/pre-restore-$(date +%F-%H%M%S).dump"
mkdir -p "$BACKUP_DIR"
info "taking a safety dump of the current state first"
$DC exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 > "$SAFETY" \
  || die "the safety dump failed. Refusing to continue — nothing has been changed."
ok "current state saved to $SAFETY"

# ── Stop the application ─────────────────────────────────────────────────────
# Nothing must write while the database is being replaced.
info "stopping the application"
# The worker writes too: left running it would sweep a database mid-restore.
$DC stop api worker web
ok "stopped"

# ── Restore ──────────────────────────────────────────────────────────────────
info "restoring the database"
$DC exec -T db dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" \
  || die "could not drop the database. Restore your safety dump: deploy/restore.sh $SAFETY"
$DC exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

# --exit-on-error matters: without it pg_restore reports success having skipped statements
# it could not apply, and the gap is discovered much later.
#
# --no-privileges: the dump's GRANTs name `safeops_app`, a server-wide login that does not
# exist yet on a fresh server, and with --exit-on-error that one missing name would abort
# the whole restore. The grants are not lost - the API's entrypoint creates the login and
# re-grants everything on start (lib/dbRole.ts). Row-level security policies are part of
# the schema, not privileges, and are restored as normal.
$DC exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error < "$DUMP" \
  || die "the restore failed. The safety dump is at $SAFETY"
ok "database restored"

# ── Uploads ──────────────────────────────────────────────────────────────────
if [ -f "$UPLOADS" ]; then
  info "restoring uploaded evidence"
  docker run --rm \
    -v safeops_uploads:/data \
    -v "$(cd "$(dirname "$UPLOADS")" && pwd)":/in:ro \
    alpine sh -c "rm -rf /data/* && tar xzf /in/$(basename "$UPLOADS") -C /data" \
    || die "the uploads restore failed. The database is restored; attachments are not."
  ok "uploads restored"
fi

# ── Start and verify ─────────────────────────────────────────────────────────
info "starting the application"
$DC up -d
wait_for_ready 60

info "verifying the restore"
ACTUAL=$($DC exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAF' ' -c '
SELECT
  (SELECT count(*) FROM "Company"), (SELECT count(*) FROM "User"), (SELECT count(*) FROM "Site"),
  (SELECT count(*) FROM "Employee"), (SELECT count(*) FROM "Incident"), (SELECT count(*) FROM "IncidentEvent"),
  (SELECT count(*) FROM "CorrectiveAction"), (SELECT count(*) FROM "Permit"), (SELECT count(*) FROM "PermitControl"),
  (SELECT count(*) FROM "Asset"), (SELECT count(*) FROM "Inspection"), (SELECT count(*) FROM "Audit"),
  (SELECT count(*) FROM "AuditFinding"), (SELECT count(*) FROM "Certificate"),
  (SELECT count(*) FROM "Notification"), (SELECT count(*) FROM "AdminAuditEntry");')

echo "  restored: $ACTUAL"

if [ -f "$MANIFEST" ]; then
  EXPECTED="$(tr -d '\n' < "$MANIFEST" | xargs)"
  ACTUAL_TRIM="$(echo "$ACTUAL" | xargs)"
  if [ "$EXPECTED" = "$ACTUAL_TRIM" ]; then
    ok "every table matches the manifest exactly"
  else
    warn "counts differ from the manifest"
    echo "    expected: $EXPECTED"
    echo "    actual  : $ACTUAL_TRIM"
    die "the restore did not reproduce the backup. Investigate before letting anyone use this."
  fi
fi

# Foreign keys are what a partial restore breaks, and a count check would not notice.
ORPHANS=$($DC exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc '
SELECT
  (SELECT count(*) FROM "IncidentEvent" e LEFT JOIN "Incident" i ON i.id = e."incidentId" WHERE i.id IS NULL) +
  (SELECT count(*) FROM "PermitControl" c LEFT JOIN "Permit" p ON p.id = c."permitId" WHERE p.id IS NULL) +
  (SELECT count(*) FROM "AuditFinding" f LEFT JOIN "Audit" a ON a.id = f."auditId" WHERE a.id IS NULL) +
  (SELECT count(*) FROM "Certificate" c LEFT JOIN "Employee" e ON e.id = c."employeeId" WHERE e.id IS NULL);' | tr -d ' ')

if [ "$ORPHANS" = "0" ]; then
  ok "no orphaned child records — referential integrity intact"
else
  die "$ORPHANS orphaned record(s) found. The restore is incomplete."
fi

echo
ok "restore complete"
echo "  safety dump of the previous state: $SAFETY"
echo "  now sign in and open one incident, one permit and one audit — a count proves rows"
echo "  exist, opening a record proves the application can read them."
