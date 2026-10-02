#!/usr/bin/env bash
#
# Back up the database and the uploaded evidence.
#
# Both, always. A database dump alone leaves every attachment row pointing at a file that
# is not there — which is worse than having neither, because the record claims evidence
# exists.
#
#   deploy/backup.sh
#   deploy/backup.sh --tag pre-deploy-2026-08-01
#   BACKUP_DIR=/mnt/backups deploy/backup.sh
#
# For cron, see docs/BACKUP.md.

. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
require_env

TAG=""
[ "${1:-}" = "--tag" ] && TAG="${2:-}"
STAMP="${TAG:-$(date +%F-%H%M%S)}"

mkdir -p "$BACKUP_DIR"
[ -w "$BACKUP_DIR" ] || die "$BACKUP_DIR is not writable"

DUMP="$BACKUP_DIR/db-${STAMP}.dump"
UPLOADS="$BACKUP_DIR/uploads-${STAMP}.tar.gz"

info "backing up to $BACKUP_DIR"

# ── Database ─────────────────────────────────────────────────────────────────
# Custom format: it compresses, and pg_restore can then restore selected tables — which is
# what you want when one table is damaged and the rest is fine.
$DC exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 > "$DUMP" \
  || die "pg_dump failed. Nothing was written. Is the db container running?"

[ -s "$DUMP" ] || die "the dump is empty — treat this as a failed backup"

# A dump that cannot be listed cannot be restored. Checking now costs a second; finding
# out during an outage costs the pilot.
# No filename: pg_restore then reads the archive from stdin. Naming /dev/stdin instead made
# it read nothing through `docker compose exec`, so every valid dump "failed" this check.
$DC exec -T db pg_restore --list < "$DUMP" >/dev/null 2>&1 \
  || die "the dump is unreadable by pg_restore — treat this as a failed backup"

ok "database  $(du -h "$DUMP" | cut -f1)  $DUMP"

# ── Uploads ──────────────────────────────────────────────────────────────────
docker run --rm \
  -v safeops_uploads:/data:ro \
  -v "$(cd "$BACKUP_DIR" && pwd)":/out \
  alpine tar czf "/out/$(basename "$UPLOADS")" -C /data . \
  || die "the uploads backup failed"

ok "uploads   $(du -h "$UPLOADS" | cut -f1)  $UPLOADS"

# ── Manifest ─────────────────────────────────────────────────────────────────
# Row counts recorded at backup time, so restore.sh can prove the restore matched rather
# than merely completing without an error.
MANIFEST="$BACKUP_DIR/manifest-${STAMP}.txt"
$DC exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAF' ' -c '
SELECT
  (SELECT count(*) FROM "Company")           AS companies,
  (SELECT count(*) FROM "User")              AS users,
  (SELECT count(*) FROM "Site")              AS sites,
  (SELECT count(*) FROM "Employee")          AS employees,
  (SELECT count(*) FROM "Incident")          AS incidents,
  (SELECT count(*) FROM "IncidentEvent")     AS incident_events,
  (SELECT count(*) FROM "CorrectiveAction")  AS actions,
  (SELECT count(*) FROM "Permit")            AS permits,
  (SELECT count(*) FROM "PermitControl")     AS permit_controls,
  (SELECT count(*) FROM "Asset")             AS assets,
  (SELECT count(*) FROM "Inspection")        AS inspections,
  (SELECT count(*) FROM "Audit")             AS audits,
  (SELECT count(*) FROM "AuditFinding")      AS findings,
  (SELECT count(*) FROM "Certificate")       AS certificates,
  (SELECT count(*) FROM "Notification")      AS notifications,
  (SELECT count(*) FROM "AdminAuditEntry")   AS audit_log;' > "$MANIFEST"

ok "manifest  $MANIFEST"

# ── Retention ────────────────────────────────────────────────────────────────
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' -o -name 'manifest-*.txt' \) -mtime +"$KEEP_DAYS" -print -delete | wc -l)
[ "$DELETED" -gt 0 ] && ok "pruned $DELETED file(s) older than ${KEEP_DAYS} days"

echo
ok "backup $STAMP complete"
warn "This is on the same host as the data it protects. Copy it off:"
echo "    rclone copy $BACKUP_DIR remote:safeops-backups --max-age 48h"
