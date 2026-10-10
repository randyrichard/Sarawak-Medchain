# PILOT RUNBOOK

Operating SafeChain for one customer, day to day. Written for whoever is on the end of the
phone when they call.

---

## Before day one

- [ ] Images built and the stack up — [DEPLOYMENT.md](DEPLOYMENT.md)
- [ ] `security-probe.ts` against the deployed API returns 21/21
- [ ] `headers-probe.ts` shows the refresh cookie `HttpOnly; Secure; SameSite=Strict`
- [ ] TLS terminating in front of both containers, HTTP redirecting to HTTPS
- [ ] Nightly `pg_dump` and uploads tarball in cron, writing off-host
- [ ] **A restore drill performed on a scratch host, and timed**
- [ ] Customer's company, site and administrator created; demo seed *not* run
- [ ] Their administrator has signed in and set their own password
- [ ] Someone named on your side owns this pilot

---

## Daily, two minutes

```bash
curl -fsS https://api.example.com/health/ready
```

```bash
docker compose -f docker-compose.prod.yml logs --since 24h api | grep '"status":5' | head
```

Expect nothing. A `503` means the database was briefly unreachable and the API recovered on
its own — worth noting, not worth waking up for. A `500` is a genuine fault; get the JSON
line and the timestamp.

```bash
ls -lh /backups | tail -3
```

Last night's dump should be there and should not be dramatically smaller than the one
before it.

---

## Weekly

```bash
docker compose -f docker-compose.prod.yml logs --since 168h api \
  | grep -c '"status":429'
```

Sustained 429s mean someone is hitting the API harder than a person can — an integration
looping, or a stuck browser tab. The ceiling is 600 requests/min/IP.

```bash
docker stats --no-stream
```

The API sits around 200 MB after sustained use. Steady growth week on week is worth
investigating; sawtooth is normal.

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='safeops';"
```

Around 12 under load. Climbing and never falling means connections are leaking.

---

## Monthly

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore --list /backups/db-$(date +%F).dump | head
```

Restore last night's dump into a scratch database and open the application against it. See
[RESTORE.md](RESTORE.md).

---

## When they call

### "I can't sign in"

Five failures locks the account for fifteen minutes. It clears itself.

```bash
docker compose -f docker-compose.prod.yml logs --since 1h api | grep '/auth/login'
```

A `401` is a wrong password. A `429` is the login throttle. A `503` is the database.

To unlock immediately, an administrator can reset the password from Administration → Users.
That also revokes their refresh tokens, so every session they have ends.

### "It logged me out"

Access tokens last 15 minutes and refresh silently. Being logged out repeatedly almost
always means the refresh cookie is not reaching the API:

- Web and API must share a registrable domain — the cookie is `sameSite=strict`.
- The cookie is `Secure`, so the site must be HTTPS.
- Check for `POST /auth/refresh` in the logs. If it is absent, the browser is not sending
  the cookie. If it returns 401, the token was revoked or expired.

### "My data is missing"

Ask what they expect to see and where.

- **A list looks short.** Lists load up to 2,000 records. Above that the browser console
  says how many exist. Have them filter or search — both run server-side and reach
  everything.
- **A record is genuinely gone.** Do not restore anything yet. Check the audit trail:

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c \
  "SELECT at, actor, action, target FROM \"AdminAuditEntry\" ORDER BY at DESC LIMIT 20;"
```

Incidents are soft-deleted — archived, never removed. An archived incident is still in the
database and can be un-archived rather than restored.

### "I'm not getting reminders"

Reminders come from the in-process scheduler, every 15 minutes.

```bash
docker compose -f docker-compose.prod.yml logs --since 1h api | grep safeops-scheduler
```

Things worth knowing before you go looking for a bug:

- It only looks back **45 days**. Something a year overdue is a backlog for the register,
  not a notification.
- Each reminder fires **once**, keyed by record and reason. A second sweep will not
  re-announce what the first one did.
- **There is no email.** Notifications are in-app only. If they expected email, that is a
  gap in the product, not a fault in the deployment.

### "The site is down"

```bash
docker compose -f docker-compose.prod.yml ps
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://api.example.com/health
```

| Symptom | Cause | Action |
|---|---|---|
| `/health` 200, `/health/ready` 503 | Database unreachable | Check the `db` container. The API recovers on its own — no restart needed |
| No response at all | API container down | `docker compose ... up -d api` |
| Web loads, every call fails | CORS or a bundle built with the wrong API URL | Check `CORS_ORIGINS`; rebuild web if `VITE_API_BASE_URL` is wrong |
| Everything 429 | Rate limit | Find the source IP in the logs |

A database outage has been exercised: the API stayed up, returned 503s for the duration,
logged them, and resumed fully when the database returned — without a restart.

---

## Restarting things

```bash
docker compose -f docker-compose.prod.yml restart api
```

Safe at any time. In-flight requests drain, the scheduler stops cleanly, and the process
exits within 10 seconds. Reminders are idempotent, so a restart mid-sweep re-runs it
harmlessly.

```bash
docker compose -f docker-compose.prod.yml restart db
```

The API will return 503 for a few seconds and recover on its own.

---

## Known limitations — say these before they find them

| | |
|---|---|
| No email | Notifications are in-app only |
| Lists cap at 2,000 rows | Search and filters reach everything |
| In-app restore is parent-only | Incident timelines and permit checklists are not in it. Real recovery is `pg_dump` |
| Trend charts and Safety Score are illustrative | Every KPI tile, the priority queue and the site map are real |
| Permission matrix is display-only | Roles are enforced in the services; editing the matrix changes nothing |
| Global search does nothing | Labelled "coming with data modules" |
| Single instance | The scheduler runs in the API process |

---

## Escalate when

- Any 500 that is not a database outage
- Tenant isolation failing in `security-probe.ts` — **stop the pilot, this is a breach**
- A backup that will not `pg_restore --list`
- Memory climbing across a whole week
- A customer reporting missing data that is not explained by the 2,000-row cap

---

## Ending the pilot

Give them their data, whatever the outcome. It is theirs.

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U safeops -d safeops --format=custom > safeops-handover.dump
```

```bash
docker run --rm -v safeops_uploads:/data -v "$PWD":/out alpine \
  tar czf /out/uploads-handover.tar.gz -C /data .
```

CSV exports for incidents, actions, certificates and the audit register are available from
the application itself, which is usually what they actually want.
