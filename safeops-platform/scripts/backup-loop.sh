#!/bin/sh
# Daily database + uploads backup, run by the `backup` service in docker-compose.prod.yml.
#
# Until this existed nothing took a backup unless an operator had added a host cron job by
# hand (docs/BACKUP.md), so a fresh install - and every demo stack - had none at all.
#
# Each run:
#   1. pg_dump to a temporary file, then rename: a dump that dies half-way never sits in
#      /backups looking like a good one;
#   2. pg_restore --list on the result: proves the file is a readable archive, not just a
#      file that exists;
#   3. archives the uploads (evidence photos, permit documents) when they are mounted;
#   4. deletes copies older than BACKUP_KEEP_DAYS;
#   5. writes /backups/LAST_SUCCESS - what the healthcheck and the go-live check read.
#
# /backups is BACKUP_LOCATION: a Docker volume on this host by default. Point it at a folder
# that leaves the machine (a NAS share, a synced cloud drive) so losing the host does not
# lose the backups too. That part is the operator's: docs/BACKUP.md.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
DIR=/backups
UPLOADS=/data/uploads

log() { echo "[safeops-backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

run_once() {
  stamp="$(date -u +%Y-%m-%d-%H%M)"
  tmp="$DIR/.db-$stamp.dump.partial"
  out="$DIR/db-$stamp.dump"

  pg_dump --format=custom --compress=9 --file="$tmp"
  pg_restore --list "$tmp" > /dev/null
  mv "$tmp" "$out"
  log "database: $out ($(du -h "$out" | cut -f1))"

  if [ -d "$UPLOADS" ]; then
    tar -czf "$DIR/.uploads-$stamp.tgz.partial" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
    mv "$DIR/.uploads-$stamp.tgz.partial" "$DIR/uploads-$stamp.tgz"
    log "uploads:  $DIR/uploads-$stamp.tgz"
  fi

  find "$DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tgz' \) -mtime "+$KEEP_DAYS" -print -delete \
    | sed 's/^/[safeops-backup] pruned /'
  date -u +%Y-%m-%dT%H:%M:%SZ > "$DIR/LAST_SUCCESS"
}

mkdir -p "$DIR"
log "every ${INTERVAL_HOURS}h, keeping ${KEEP_DAYS} days, into $DIR"
while true; do
  # A failed run is logged and retried in an hour, not fatal: the healthcheck goes
  # unhealthy once LAST_SUCCESS is too old, which is what an operator alerts on.
  if run_once; then sleep "$((INTERVAL_HOURS * 3600))"; else
    log "FAILED - retrying in 1h"; rm -f "$DIR"/.*.partial; sleep 3600
  fi
done
