# Support runbook

For whoever answers when the customer calls. Symptom first, because that is what they give
you.

**Before anything else:**

```bash
cd /srv/safeops && deploy/healthcheck.sh
```

It checks containers, serving, readiness, the scheduler, 5xx in 24h, connection usage, disk
and backup freshness, and exits non-zero if anything needs attention. Most calls are
answered by that one command.

---

## "I can't sign in"

| Cause | How to tell | Fix |
|---|---|---|
| Wrong password | `401` on `/auth/login` in the logs | They retype it. Five failures locks the account for 15 minutes and it clears itself |
| Account locked | `423`, or the user shows Locked in Administration → Users | Wait it out, or an admin resets the password (which also ends every session they have) |
| Login throttle | `429` on `/auth/login` | 20 attempts per 15 minutes per IP. A whole office behind one IP can hit this — it clears itself |
| Database down | `503` | `deploy/healthcheck.sh` |

```bash
docker compose -f docker-compose.prod.yml logs --since 1h api | grep '/auth/login'
```

---

## "It keeps logging me out"

Almost always the refresh cookie not reaching the API. Access tokens last 15 minutes and
refresh silently; if the refresh fails, the user is ejected a quarter of an hour after
every sign-in.

```bash
docker compose -f docker-compose.prod.yml logs --since 1h api | grep '/auth/refresh'
```

- **No `/auth/refresh` at all** — the browser is not sending the cookie. Check that the web
  app and API share a registrable domain: the cookie is `SameSite=Strict`. Check the site
  is HTTPS: the cookie is `Secure`.
- **`/auth/refresh` returning 401** — the token was revoked or expired. If it happens to one
  user repeatedly, they may have a second tab replaying an old token; refresh tokens are
  single-use and a replay revokes the family by design.
- **Only on Safari** — see [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md). This is the
  predicted failure there.

---

## "My data is missing"

Do not restore anything yet. Restoring is almost never the right answer and it destroys
whatever they have entered since.

1. **How many records do they expect?** Lists load up to 2,000. Above that the browser
   console states how many exist. Filtering and search run server-side and reach
   everything — have them search instead of scroll.

2. **Is it archived rather than deleted?** Incidents are soft-deleted; an archived incident
   is still in the database.

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c \
  'SELECT number, title, archived FROM "Incident" WHERE title ILIKE $$%their words%$$ LIMIT 10;'
```

3. **Who touched it?**

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c \
  'SELECT at, actor, action, target FROM "AdminAuditEntry" ORDER BY at DESC LIMIT 30;'
```

4. Only if it is genuinely gone: recover **that record** from a dump into a scratch
   database and copy it across. [RESTORE.md](RESTORE.md) §2. Never restore over a live
   database to retrieve one row.

---

## "I'm not getting reminders"

```bash
docker compose -f docker-compose.prod.yml logs --since 2h api | grep safeops-scheduler
```

Before hunting a bug, check it is not working as designed:

- **No email exists.** Notifications are in-app only. If they were expecting email, that is
  a product gap, not a fault. Say so plainly.
- **45-day lookback.** Something a year overdue is a backlog for the register, not a
  notification.
- **Once per reason.** Each reminder fires once, keyed by record and reason. A second sweep
  will not re-announce it.
- **200 per workspace per sweep.** A large import is announced over several sweeps rather
  than all at once.

If the log shows no `scheduler running` line at all, reminders genuinely are not firing:

```bash
docker compose -f docker-compose.prod.yml restart api
```

---

## "The site is down"

```bash
deploy/healthcheck.sh
```

| Health | Ready | Meaning | Action |
|---|---|---|---|
| 200 | 200 | The API is fine — the problem is the browser, the network, or the proxy | Check the proxy and TLS |
| 200 | 503 | Database unreachable | Check the `db` container. **The API recovers on its own** — no restart needed |
| no response | — | API container down | `docker compose -f docker-compose.prod.yml up -d api` |
| — | — | Everything 429 | Rate limit. Find the source IP in the logs; raise `RATE_LIMIT_PER_MIN` if it is legitimate traffic |

A database outage has been exercised: the API stays up, returns 503 with `Retry-After` for
the duration, and resumes when the database returns.

---

## "It's slow"

```bash
docker stats --no-stream
```

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='safeops';"
```

Measured behaviour: 100 concurrent users give p95 563 ms; 500 give 2.7 s. A pilot of 20–40
should be nowhere near that. If it is slow at pilot volume, look at connections first — if
they are at the pool ceiling (20 by default), requests are queuing for one.

Queries over a second are logged by PostgreSQL:

```bash
docker compose -f docker-compose.prod.yml logs --since 1h db | grep duration
```

---

## Escalate immediately

- Any 5xx that is not a 503 during a database outage.
- `security-probe.ts` failing a tenant-isolation check — **stop the pilot, this is a breach**.
- A backup that will not `pg_restore --list`.
- Disk above 90%: PostgreSQL stops when it fills.

```bash
cd api && npx tsx scripts/security-probe.ts https://api.customer.example
```

---

## Things that look like faults and are not

| Report | Reality |
|---|---|
| "Search does nothing" | The header search box is unbuilt and labelled "coming with data modules" |
| "The safety score never changes" | It is illustrative, not computed. Every other tile is real |
| "I edited permissions and nothing happened" | The matrix is display-only; roles are enforced in the services |
| "The restore didn't bring back the permit's checklist" | Correct, and stated in the dialog. The in-app restore covers records, not their history — full recovery is `pg_dump` |
| "A permit expired while I was working on it" | Permits are time-bounded by design; status is derived from the clock |
