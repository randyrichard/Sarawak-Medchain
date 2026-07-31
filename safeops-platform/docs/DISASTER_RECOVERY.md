# Disaster recovery

For losing the host. For anything smaller — a bad import, one deleted record, a failed
deploy — see [RESTORE.md](RESTORE.md) and [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).

## Objectives

State these to the customer before the pilot, not after an outage.

| | Target | What sets it |
|---|---|---|
| **RPO** — how much data can be lost | **24 hours** | Backups run nightly at 02:00. A failure at 01:00 loses a day's work |
| **RTO** — how long to be back | **2 hours** | 45 min host build + 15 min restore + verification, with room for the first thing that goes wrong |

Both are pilot-appropriate, not production-grade. To improve RPO you need continuous
archiving (WAL shipping), which is a change to the database deployment and not something to
introduce during a pilot.

**Neither number has been demonstrated.** The restore path has never been executed —
`pg_dump` and `pg_restore` are not available on the development machine. The first drill on
a real host is what turns these from intentions into commitments.

## What must survive

| | Where | In the nightly backup |
|---|---|---|
| All customer records | PostgreSQL | Yes — `pg_dump` custom format |
| Uploaded evidence | `safeops_uploads` volume | Yes — separate tarball |
| Signing keys | `.env.prod` | **No — back this up separately, once** |
| TLS certificates | Caddy or certbot | No — they are reissued automatically |
| Application code | Git | No — it is in the repository |

**The signing keys are the one thing the nightly backup does not cover.** Losing them does
not lose data, but every session ends and every user must sign in again. Keep `.env.prod`
in a password manager. Never in the repository.

## Recovery

### 1. Assess — 5 minutes

Is the host gone, or just unreachable? A network partition looks identical from outside and
does not need a rebuild.

```bash
ssh safeops@host 'uptime && df -h && docker ps'
```

If that works, this is not a disaster — go to [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).

### 2. Confirm you have what you need — 5 minutes

Before building anything, check the backup is real:

```bash
ls -lh /backups/db-*.dump | tail -3
```

```bash
pg_restore --list /backups/db-<latest>.dump | head
```

If that fails, stop and try the previous night. Discovering a corrupt backup after
rebuilding the host wastes the hour you do not have.

### 3. Rebuild the host — 45 minutes

Follow [SERVER_SETUP.md](SERVER_SETUP.md) sections 1–6. Skip TLS for now; get the data back
first.

Restore `.env.prod` from the password manager. **The same signing keys**, or every user is
signed out.

### 4. Restore — 15 minutes

```bash
cd /srv/safeops/safeops-platform
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db
```

```bash
deploy/restore.sh /backups/db-<latest>.dump --yes
```

`restore.sh` takes a safety dump first, restores the database and the uploads together,
compares every table against the manifest recorded at backup time, and checks for orphaned
child records. It fails loudly rather than reporting a restore that did not reproduce the
backup.

### 5. TLS and DNS — 15 minutes

Point DNS at the new host, then:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Certificates reissue on their own once DNS resolves.

### 6. Verify before telling anyone — 15 minutes

```bash
deploy/healthcheck.sh
```

```bash
cd api && npx tsx scripts/security-probe.ts https://api.customer.example
```

Expect 21/21. Then **sign in and open one incident, one permit and one audit**. A row count
proves rows exist; opening a record proves the application can read them, which is what the
customer will do first.

### 7. Tell the customer

What was lost — anything entered after the backup timestamp — and what to re-enter. Be
specific about the window. "Some data may be missing" is not something anyone can act on.

## Partial disasters

| Situation | Response |
|---|---|
| Database corrupt, host fine | `deploy/restore.sh` alone. No rebuild |
| Uploads volume lost, database fine | Restore only the tarball. Records keep their metadata; the files come back |
| Signing keys lost, everything else fine | Generate new ones with `npm run keygen`. Everyone signs in again. No data lost |
| A bad deploy | `deploy/rollback.sh` — application only. The database is not touched |
| One record deleted | [RESTORE.md](RESTORE.md) §2 — restore beside the live database and copy across. **Never** restore over production for one row |

## Test this

Once before the pilot begins, then quarterly. On a scratch host, with a real backup, timed.

Record the time in [CUSTOMER_ACCEPTANCE.md](CUSTOMER_ACCEPTANCE.md) line 6.5.

An untested recovery procedure is a document. A tested one is a capability. The first time
you find out which you have should not be the day you need it.
