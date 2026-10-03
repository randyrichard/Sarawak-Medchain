# BACKUP

There are two different things in SafeOps called a backup. They protect against different
failures and only one of them is disaster recovery.

| | In-app restore point | `pg_dump` |
|---|---|---|
| Where it lives | A row in the database it protects | A file, off the host |
| Survives losing the server | **No** | Yes |
| Covers | Parent records only — see below | Everything |
| Good for | Undoing a bad import or bulk edit | Everything else |
| Taken by | An admin, in Administration → Backup | Cron |

**The in-app restore point is not a backup.** It is stored inside the database, so it is
gone in exactly the situation you would reach for a backup. Use it as an undo button.

## What the in-app restore point does not cover

Measured with `api/scripts/backup-restore-drill.ts` against a workspace of 12 incidents and
6 permits: every parent record came back, and these did not.

| Entity | Restored |
|---|---|
| Incidents, actions, permits, assets, inspections, audits, obligations, documents, certificates, sessions | yes |
| **Incident timelines** (`IncidentEvent`) | **no — 11 of 32 lost** |
| **Permit precaution checklists** (`PermitControl`) | **no — 20 of 38 lost** |
| Gas tests, isolations, signatures, comments, attachments | no |

A restored permit comes back **without the controls that were signed off on it**. For a
safety record, that is not a restoration. The restore dialog says so before you confirm.

## Automatic daily backup (the `backup` service)

The production compose stack now takes its own backups. Before this, nothing backed up a
fresh install unless someone added the cron job below by hand. The `backup` service runs
`scripts/backup-loop.sh` every `BACKUP_INTERVAL_HOURS` (default 24). Each run:

1. runs `pg_dump` (custom format, compressed) to a temporary file, then renames it, so a
   dump that dies half-way is never left looking like a good one;
2. checks the dump is a readable archive with `pg_restore --list`;
3. archives the uploads (evidence photos, permit documents) as `uploads-<date>.tgz`;
4. deletes copies older than `BACKUP_KEEP_DAYS` (default 30);
5. writes `LAST_SUCCESS`. The container turns **unhealthy** once that is over 26 hours old,
   and the go-live check fails.

**Where the backups go is `BACKUP_LOCATION`.** The default is a Docker volume **on the same
machine as the database**, which does not survive losing the machine. Point it at a folder
that leaves the host:

```env
# .env.prod
BACKUP_LOCATION=/mnt/nas/safeops-backups            # Linux: a NAS or network share
BACKUP_LOCATION=D:/OneDrive/SafeOps-Backups         # Windows: a synced cloud folder
```

`node dist/cli/goLive.js` warns until `BACKUP_LOCATION` is a path rather than a volume name.

**Restore drill (run 2026-10-04):** demo dataset backed up by the service script, then
restored with `pg_restore --no-owner --no-privileges` into an empty database. Every table's
row count matched: 480 rows across all tables, 0 differences.

## Daily database backup (manual / host cron)

This is the one that matters. `pg_dump` is inside the API image, so no extra tooling is
needed.

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U safeops -d safeops --format=custom --compress=9 \
  > "safeops-$(date +%F-%H%M).dump"
```

Custom format because it compresses, and because `pg_restore` can then restore selected
tables — which is what you want when one table has been damaged and the rest is fine.

### On a schedule

```bash
crontab -e
```

```cron
# 02:00 daily — database, then uploads. Keep 30 days.
0 2 * * * cd /srv/safeops && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U safeops -d safeops --format=custom --compress=9 > /backups/db-$(date +\%F).dump 2>>/var/log/safeops-backup.log
15 2 * * * cd /srv/safeops && docker run --rm -v safeops_uploads:/data -v /backups:/out alpine tar czf /out/uploads-$(date +\%F).tar.gz -C /data . 2>>/var/log/safeops-backup.log
30 3 * * * find /backups -name '*.dump' -mtime +30 -delete && find /backups -name 'uploads-*.tar.gz' -mtime +30 -delete
```

## Uploaded evidence

Incident photographs and PDFs are on a volume, not in the database. **A database dump does
not contain them.** Attachment rows without their files are worse than neither — the record
says evidence exists and it does not.

```bash
docker run --rm -v safeops_uploads:/data -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /data .
```

Back it up on the same schedule as the database, and restore the two together.

## Get the backups off the host

A backup on the machine it protects is not a backup.

```bash
rclone copy /backups remote:safeops-backups --max-age 48h
```

Any of rclone, `aws s3 sync`, `rsync` to another host, or your existing agent will do. The
requirement is only that it is somewhere the loss of this server does not reach.

## Before every upgrade

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U safeops -d safeops --format=custom --compress=9 \
  > "pre-upgrade-$(date +%F-%H%M).dump"
```

Migrations here are additive and an upgrade has been verified lossless on a populated
database. Take the dump anyway — it costs seconds and it is the only thing that makes a
destructive migration survivable.

## Check the backup is real

A dump nobody has restored is a hope. Every month:

```bash
ls -lh /backups | tail -5
```

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore --list /backups/db-$(date +%F).dump | head -20
```

If `pg_restore --list` cannot read the file, the backup is worthless and you have found out
on a quiet Tuesday instead of during an outage. Then do a real restore drill — see
[RESTORE.md](RESTORE.md).
