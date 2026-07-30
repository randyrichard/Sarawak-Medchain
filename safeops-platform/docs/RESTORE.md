# RESTORE

Three situations, three different answers. Pick the smallest one that fixes the problem.

| Situation | Use |
|---|---|
| Someone made a mess — bad import, wrong bulk edit | [In-app restore point](#1-undo-a-bad-change) |
| Data is wrong or missing and the server is fine | [Restore a dump into a scratch database](#2-recover-specific-data) |
| The server is gone | [Full recovery](#3-full-recovery) |

---

## 1. Undo a bad change

Administration → Backup & Recovery → choose a restore point → Restore.

A snapshot of the current state is taken automatically first, so this is itself
reversible.

**Read this before relying on it.** The restore point brings back parent records and not
their history. Measured: incidents return without their timelines, permits return without
their precaution checklists, gas tests, isolations and signatures. A restored permit shows
as issued with no controls recorded against it.

If the audit trail matters — and for a permit or an investigation it does — use a `pg_dump`
restore instead.

---

## 2. Recover specific data

Never restore a dump over a live database to retrieve one table. Restore it beside the live
one and copy across what you need.

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  createdb -U safeops safeops_recovery
```

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U safeops -d safeops_recovery --no-owner < /backups/db-2026-07-30.dump
```

Inspect it:

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U safeops -d safeops_recovery -c 'SELECT count(*) FROM "Incident";'
```

Copy one table back:

```bash
docker compose -f docker-compose.prod.yml exec -T db bash -c \
  'pg_dump -U safeops -d safeops_recovery -t "\"Incident\"" --data-only | psql -U safeops -d safeops'
```

Foreign keys mean order matters — restore parents before children (`Incident` before
`IncidentEvent`, `Permit` before `PermitControl`). When more than two or three tables are
involved, a full restore is safer than a careful one.

Drop the scratch database when you are done:

```bash
docker compose -f docker-compose.prod.yml exec -T db dropdb -U safeops safeops_recovery
```

---

## 3. Full recovery

Losing the host. Roughly 15 minutes once you have the files.

### Stop the application, keep the database up

```bash
cd /srv/safeops && docker compose -f docker-compose.prod.yml stop api web
```

Stopping the API first means nothing writes while you restore.

### Restore the database

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  dropdb -U safeops --if-exists safeops
```

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  createdb -U safeops safeops
```

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U safeops -d safeops --no-owner --exit-on-error < /backups/db-2026-07-30.dump
```

`--exit-on-error` matters. Without it `pg_restore` reports success having skipped
statements it could not apply, and you discover the gap later.

### Restore the uploads

A database restore alone leaves every attachment row pointing at a file that is not there.

```bash
docker run --rm -v safeops_uploads:/data -v /backups:/in alpine \
  sh -c 'rm -rf /data/* && tar xzf /in/uploads-2026-07-30.tar.gz -C /data'
```

### Start up

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Any migrations newer than the dump apply automatically on start.

### Verify before telling anyone it is back

```bash
curl -fsS https://api.example.com/health/ready
```

```bash
cd safeops-platform/api && npx tsx scripts/security-probe.ts https://api.example.com
```

Expect `21/21 checks passed`.

Then check the data is actually there, not just the schema:

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c '
SELECT
  (SELECT count(*) FROM "Company")        AS companies,
  (SELECT count(*) FROM "User")           AS users,
  (SELECT count(*) FROM "Incident")       AS incidents,
  (SELECT count(*) FROM "IncidentEvent")  AS incident_events,
  (SELECT count(*) FROM "Permit")         AS permits,
  (SELECT count(*) FROM "PermitControl")  AS permit_controls,
  (SELECT count(*) FROM "Audit")          AS audits,
  (SELECT count(*) FROM "Certificate")    AS certificates;'
```

Compare against the same query run before the incident. The child tables are in that list
deliberately — they are the ones the in-app restore point misses, so they are the ones
worth confirming.

Finally, sign in and open one incident, one permit and one audit. A count proves rows
exist; opening a record proves the application can read them.

---

## Practise this

Do it once before the pilot begins, on a scratch host, with a real dump. Time it.

An untested restore procedure is a document, not a capability, and the first time you find
out which one you have should not be during an outage.
