# Incident response

For when SafeOps itself is the incident. Severity, then the specific playbook.

## Severity

| | Definition | Response | Example |
|---|---|---|---|
| **SEV-1** | Customer data exposed to the wrong party, or lost | Immediately, whatever the hour | Tenant isolation failing; a restore that did not restore |
| **SEV-2** | The customer cannot work | Within the hour, business hours or not | Site down; nobody can sign in; database unreachable |
| **SEV-3** | A module is unusable, the rest works | Same business day | Permits will not issue; uploads failing |
| **SEV-4** | Degraded or cosmetic | Next working day | Slow lists; a screen rendering oddly |

When unsure, treat it as one level worse and downgrade once you know more.

---

## First five minutes, every time

```bash
cd /srv/safeops && deploy/healthcheck.sh
```

```bash
docker compose -f docker-compose.prod.yml logs --since 30m api | grep '"status":5' | tail -20
```

Write down the time it started and what changed recently — a deploy, a restore, a config
edit. Most incidents follow a change.

**Do not restart anything yet.** A restart destroys the evidence of what happened, and the
API recovers from a database outage on its own.

---

## SEV-1 — Tenant isolation

The one that ends a pilot. Suspect it if a customer reports seeing a name, site or record
they do not recognise.

```bash
cd api && npx tsx scripts/security-probe.ts https://api.customer.example
```

Ten of those checks are cross-tenant reads. **If any fail:**

1. **Take the application offline.** Continuing to serve is worse than being down.

```bash
docker compose -f docker-compose.prod.yml stop api web
```

2. Preserve evidence before touching anything:

```bash
docker compose -f docker-compose.prod.yml logs api > /tmp/incident-$(date +%F-%H%M).log
deploy/backup.sh --tag incident-$(date +%F-%H%M)
```

3. Determine the scope from the request log — it records the acting user id and path for
   every request, so you can establish who read what.
4. Notify the customer. A suspected data exposure is theirs to know about, and telling them
   late is worse than telling them early with an incomplete picture.
5. Do not restart until the cause is understood. This one does not fix itself.

---

## SEV-1 — Data loss

1. **Stop writes immediately.** Every minute of continued use makes the recovery worse.

```bash
docker compose -f docker-compose.prod.yml stop api web
```

2. Establish what is missing and when it went, from the audit trail:

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c \
  'SELECT at, actor, action, target FROM "AdminAuditEntry" ORDER BY at DESC LIMIT 50;'
```

3. Find a backup from before it:

```bash
ls -lht /backups/db-*.dump | head
```

4. **Restore into a scratch database first** and confirm the data is actually in it. Do not
   restore over production on the assumption that the backup is good.

5. Then either copy the missing records across ([RESTORE.md](RESTORE.md) §2) or do a full
   restore ([RESTORE.md](RESTORE.md) §3). Prefer the former: a full restore discards
   everything entered since the backup.

---

## SEV-2 — Site down

Work down. Stop when it comes back.

```bash
docker compose -f docker-compose.prod.yml ps
```

| Finding | Action |
|---|---|
| A container is not running | `docker compose -f docker-compose.prod.yml up -d` |
| `api` restarting repeatedly | `docker compose ... logs --tail=100 api`. A migration failure or a missing env var will be in the first twenty lines |
| `db` unhealthy | Check disk first: `df -h`. A full disk stops PostgreSQL and looks like a database fault |
| All containers healthy, still unreachable | The proxy or TLS. Test the API directly: `curl -fsS http://localhost:4000/health` |

If it followed a deploy:

```bash
deploy/rollback.sh
```

The database is not rolled back, and that is correct — migrations are additive so the
previous release runs against the newer schema.

---

## SEV-2 — Nobody can sign in

```bash
docker compose -f docker-compose.prod.yml logs --since 1h api | grep '/auth/login' | tail -20
```

| Pattern | Cause |
|---|---|
| All `503` | Database. Treat as an outage |
| All `429` | Rate limit — a whole office shares one IP. Raise `RATE_LIMIT_PER_MIN` and restart the API |
| All `401` | Check the JWT keys have not changed. Rotating them invalidates every session |
| Nothing in the log at all | Requests are not arriving. Proxy, DNS or TLS |

---

## SEV-3 — Uploads failing

```bash
docker compose -f docker-compose.prod.yml exec api sh -c 'touch /data/uploads/.probe && rm /data/uploads/.probe'
```

```bash
df -h
```

The API refuses to start if `UPLOAD_DIR` is not writable, so a running container had a
writable directory at boot. If it is failing now, the disk has filled or the mount has gone.

---

## Disk full

The failure most likely to arrive unannounced, and it stops PostgreSQL.

```bash
df -h && du -sh /var/lib/docker/volumes/* 2>/dev/null | sort -h | tail
```

| Culprit | Action |
|---|---|
| Container logs | Bounded at 60 MB per service by the compose logging config. If they are larger, the config is not being applied — check you are using `docker-compose.prod.yml` |
| `/backups` | `BACKUP_KEEP_DAYS` prunes on each run. Copy them off-host and delete locally |
| `safeops_uploads` | Customer evidence. Do not delete. Grow the volume |
| Docker build cache | `docker system prune -f` — safe, removes no volumes |

---

## After every SEV-1 and SEV-2

Within two working days, write down:

- What the customer experienced, and for how long.
- What actually happened.
- What was done, in order, including anything that did not work.
- Why it was possible — the condition, not the person.
- What changes so it cannot recur, with an owner and a date.

Send the customer the first two and the last one. A pilot customer who sees a clear account
of a failure trusts you more afterwards, not less.

---

## Contacts

Fill these in before day one. An escalation path improvised during an incident is not one.

| Role | Name | Contact | Hours |
|---|---|---|---|
| Primary on-call | | | |
| Engineering escalation | | | |
| Customer's HSE lead | | | |
| Customer's IT contact | | | |
| Hosting provider | | | |
