# Deployment verification — results

The ten-item deployment and operational checklist, run on 31 July 2026 against
`feature/permit-to-work` at `025f350`. Every result below was produced by executing
something. Where an item could not be executed, it says so and why, and it is not marked
as passed.

**Verdict: Not Yet Pilot Ready — one gate item cannot be verified on this machine.**

---

## The gate

| Gate item | Status | Evidence |
|---|---|---|
| Docker builds successfully | **NOT VERIFIED** | No container runtime on this machine — see item 1 |
| Fresh install succeeds | PASS | Empty database → 15 migrations → seed → demo → 407 rows across 27 tables |
| Upgrade succeeds | PASS | N-1 → latest on a populated database, all 27 tables byte-identical |
| Backup and restore verified | **PASS WITH A DOCUMENTED GAP** | Parents restore; incident timelines and permit checklists do not |
| Scheduler verified | PASS | 12 notifications raised on a fresh install; idempotent across restart |
| Uploads verified | PARTIAL | Path configurable and writability checked at boot; volume mount unproven |
| HTTPS verified | **NOT VERIFIED** | No TLS terminator here. Cookie `Secure` flag and HSTS confirmed |
| Authentication verified | PASS | 3/3 checks; forged and tampered tokens rejected |
| Multi-tenant isolation verified | PASS | 10/10 endpoints return 403 across tenants |
| Security checks pass | PASS | 21/21 |
| All automated tests pass | PASS | 298 API, 36 web, both typechecks, both builds |
| No critical defects remain | PASS | Four found and fixed during this pass |

Two items cannot be verified here, so the system is **Not Yet Pilot Ready**. Both are
retired by one session on a host with Docker and TLS — neither is a code defect.

---

## 1. Docker — NOT VERIFIED

```
docker, docker-compose, podman, nerdctl : none on PATH
C:\Program Files\Docker\...              : absent
C:\ProgramData\DockerDesktop             : absent
wsl                                      : "The Windows Subsystem for Linux is not installed"
```

`docker build`, `docker compose build` and `docker compose up` could not be run. Installing
Docker Desktop needs administrator rights and a reboot, which is not mine to do.

What *was* verified, natively, is every command the images run:

| Step | Result |
|---|---|
| `npm ci --omit=dev` (the runtime layer) | Succeeds. Confirmed the `prisma` CLI is present — `@prisma/client@5.22.0` depends on `prisma@5.22.0`, so `migrate deploy` will run in the container. This was checked because a devDependency-only CLI would have broken every container start |
| `npx prisma generate` | Succeeds |
| `npm run build` | Succeeds; emits `dist/server.js` |
| `npm start` → `node dist/server.js` | Boots, serves, both health endpoints respond |
| `prisma migrate deploy` | Applies 15 migrations to an empty database |

**One real defect was found here and fixed.** `npm start` had never worked: `package.json`
names `dist/server.js` while `tsc` emitted `dist/src/server.js`, because `scripts/` was in
the compile. Split into `tsconfig.build.json`. Without this, every container would have
crash-looped on start.

**Not applicable:** no Redis and no object storage — uploads are a filesystem volume.

---

## 2. Fresh installation — PASS

```
scratch-db create safeops_fresh   → empty database
prisma migrate deploy             → "All migrations have been successfully applied"
npm run seed                      → 2 companies, 9 sites, 14 departments, 8 teams, 20 employees, 6 users
npm run demo                      → 16 incidents, 18 actions, 7 permits, 12 assets, 7 audits, 76 certificates
db-census                         → 407 rows across 27 tables (from 0)
NODE_ENV=production npm start     → listening, scheduler running
security-probe                    → 21/21
```

Login and the full workflow set were verified in the browser in the previous session
(incident lifecycle to Closed, permit lifecycle including both refusals and auto-suspend,
inspection with an auto-raised defect, audit close gate, training, notifications, tenant
switching).

---

## 3. Upgrade — PASS

Built a database at `20260728172004_organisation_structure`, populated it, upgraded to
`20260729044823_notifications`.

```
census-diff before after → No data lost, no content altered
```

All 27 tables identical. The census hashes each table's ordered contents, so a silently
emptied column would show even at an unchanged row count.

**Rollback: verified.** Prisma has no down-migrations, so the rollback path is redeploying
the previous image — which works because the migrations are additive. Proven, not assumed:
the previous release was checked out into a worktree and run against the already-upgraded
database. It started, served, and passed all 21 security checks including tenant isolation.

---

## 4. Backup / restore — PASS, with a gap that is now documented in the product

`backup-restore-drill.ts`: census → restore point → delete records across every module →
restore → census.

| Entity | Before | Restored |
|---|---|---|
| users, companies, sites, employees | 6, 1, 6, 18 | identical |
| incidents | 12 | identical |
| actions | 14 | identical |
| permits | 6 | identical |
| assets | 10 | identical |
| inspections | 20 | identical |
| audits, findings | 5, 3 | identical |
| certificates | 73 | identical |
| obligations, documents, sessions, notifications | 8, 6, 1, 9 | identical |
| **incident timelines** | 32 | **21 — 11 not restored** |
| **permit precaution checklists** | 38 | **18 — 20 not restored** |

Every parent record came back. Their history did not: a restored permit has no record of
the controls that were signed off on it, and a restored incident has no timeline.

This is now stated in the restore dialog, in red, above the confirm button — an operator
deciding whether to rely on it sees the limit at the moment they decide. `pg_dump` is
documented as the actual recovery mechanism in [BACKUP.md](BACKUP.md) and
[RESTORE.md](RESTORE.md).

**`pg_dump` itself could not be exercised here** — the embedded PostgreSQL package ships
only `initdb`, `pg_ctl` and `postgres`. It is present in the API image
(`apk add postgresql16-client`), and the restore drill must be performed once on a real
host before the pilot begins.

---

## 5. Production environment — MOSTLY PASS

Run with `NODE_ENV=production` and production variables.

| | Result |
|---|---|
| Refresh cookie | `HttpOnly` ✓ `Secure` ✓ `SameSite=Strict` ✓ `Path=/auth` — scoped to the refresh endpoint, tighter than `/` |
| HSTS | `max-age=31536000; includeSubDomains` |
| CSP | `default-src 'self'; object-src 'none'; script-src 'self'; frame-ancestors 'self'; upgrade-insecure-requests` |
| Other headers | `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, COOP and CORP `same-origin`, `X-Powered-By` absent |
| CORS | Only the configured origin is echoed; `https://attacker.example` is refused |
| Sessions | Login → access token + refresh cookie; refresh rotates; tampered signature rejected |
| Rate limiting | 600/min/IP, health exempt. Verified under load: 13,239 of 16,262 requests correctly rejected with 429 |
| Scheduler | Runs in-process, 15-minute interval, logs what it raised |
| Logging | One JSON line per request: method, path, status, duration, user id, IP. No body, query string or header |
| Uploads | `UPLOAD_DIR` configurable, checked for writability at boot |
| **HTTPS** | **NOT VERIFIED** — no TLS terminator here. The `Secure` cookie and HSTS are correct, but an actual TLS handshake was never performed |
| **Email** | **NOT IMPLEMENTED** — notifications are in-app only. A gap in the product, not the deployment |

---

## 6. Browser compatibility — PARTIAL

Only one engine is available here: the in-app Chromium-based browser
(`AppleWebKit/537.36 (KHTML, like Gecko)`).

| | Result |
|---|---|
| Chromium desktop (1280×800) | Verified across every module in this and the previous session |
| Mobile 375×812 | No horizontal overflow; no element extends past the viewport; 111 rows render |
| Tablet 768×1024 | No horizontal overflow |
| **Chrome (real)** | Not verified — same engine family, low risk |
| **Edge** | Not verified — Chromium, low risk |
| **Firefox** | **Not verified** — different engine, moderate risk |
| **Safari / iOS** | **Not verified** — different engine, highest risk. Also the platform most likely to be used on site |

Safari is the one worth actually testing before the pilot. It is the strictest about
cookies, which is exactly where this application's session handling is most opinionated.

---

## 7. Long-running stability — PASS

Four minutes of paced read and write load against the running stack.

```
requests        : 2133
5xx / transport : 0
status spread   : 200×2043  201×90
created         : 45 incidents, 45 permits
db connections  : min 12  max 13  last 12
probe heap      : min 15MB  max 18MB  last 16MB
heap trend      : sawtooth (normal)
```

API process after sustained use: RSS 196 MB, 30 threads, 353 handles. PostgreSQL: 28 MB.

An earlier unpaced run drove 16,262 requests in five minutes and got 13,239 × 429 — the
rate limiter doing its job, and the API staying healthy behind it.

Exercised during the run: scheduled reminders, notification generation, incident creation,
permit creation, and reads across inspections, audits and training. Inspections, audits and
training were driven through their full workflows in the browser in the previous session
rather than in this soak.

**Four minutes is not "continuously".** It establishes a trend — flat connections, sawtooth
heap — and rules out a fast leak. A slow leak needs days, and the pilot is where that gets
measured. Weekly checks are in [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md).

---

## 8. Failure recovery — MOSTLY PASS

| Scenario | Result |
|---|---|
| **Database restart** | **Verified, twice.** During an unplanned 100-second outage the API stayed up, returned errors for the duration, logged them, and recovered fully when the database returned — with no restart. Confirmed again deliberately against an API pointed at a database that does not exist |
| **Backend restart** | Verified — process stops cleanly, drains, restarts; the scheduler's sweep is idempotent so a restart mid-sweep re-runs it harmlessly |
| **Expired session** | Verified — access tokens expire at 15 minutes and refresh silently; a token with an altered signature is rejected with 401 |
| **Browser refresh** | Verified throughout both sessions — session restores from the httpOnly cookie |
| **Network interruption** | Partially — verified as connection-refused (the outage drill's 0-status case). Packet loss and latency were not simulated |
| **Server reboot** | **Not verified** — cannot reboot this machine. `restart: unless-stopped` is set on every service in the compose file, but that is configuration, not evidence |

**One defect found and fixed here.** During the outage every request returned **500**, which
tells a proxy the response is final and a monitor that the application is broken. Now
**503 with `Retry-After: 5`**. Verified: `/health` 200, `/health/ready` 503, a data request
503.

---

## 9. Documentation — DONE

[INSTALL.md](INSTALL.md) · [DEPLOYMENT.md](DEPLOYMENT.md) · [BACKUP.md](BACKUP.md) ·
[RESTORE.md](RESTORE.md) · [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md)

All with exact, runnable commands.

---

## What was fixed during this pass

| Defect | Consequence had it shipped |
|---|---|
| `npm start` pointed at a path `tsc` never emitted | Every container crash-loops on start |
| Database outage returned 500 instead of 503 | Proxies treat a transient outage as a permanent failure; monitors page for the wrong thing |
| Request log reported mount-relative paths | `/admin/health 403` logged as `/health 403` — sends whoever reads it somewhere the problem is not |
| Restore dialog implied a full recovery | An operator relies on it and discovers at the worst moment that permits came back without their precaution records |

---

## To reach Pilot Ready

Two sessions of work, neither of them code:

1. **On a host with Docker:** `docker compose -f docker-compose.prod.yml build` and
   `up -d`. Fix whatever the first build surfaces. Then run `security-probe.ts` and
   `headers-probe.ts` against the deployed instance.
2. **Behind real TLS:** confirm the handshake, that HTTP redirects to HTTPS, and that a
   session survives a page reload on the real domain — this is where a `sameSite=strict`
   cookie on mismatched domains would show up.
3. **One restore drill** with `pg_dump` and `pg_restore` on that host, timed.
4. **Open the app in Safari**, desktop and iOS.

Everything else on the checklist has been executed and passes.
