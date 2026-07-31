# Release candidate — RC1

Release engineering assessment, 31 July 2026, `feature/permit-to-work`. Every "verified"
below was produced by executing something on this machine. Anything that could not be
executed says so and is not counted.

---

# Verdict: **READY FOR DESIGN PARTNER PILOT**

Not READY FOR LIMITED PRODUCTION. One thing prevents it, and it is not in the code:
**the container images have never been built**, because this machine has no Docker, no
WSL2 and no administrator rights. Everything needed to close that is written, and the exact
work is at the bottom of this page.

---

## 1. Remaining blockers

| # | Blocker | Severity | Why it blocks LIMITED PRODUCTION |
|---|---|---|---|
| B1 | **Docker images never built.** `docker build`, `docker compose build`, `docker compose up` have not been run | Blocking | Nobody has seen the deployment artefact work. Every command *inside* the images is verified; the images themselves are not |
| B2 | **No TLS handshake performed.** Configs written for both Caddy and nginx; the `Secure` cookie flag and HSTS confirmed in production mode | Blocking | HTTPS is the boundary the session model depends on |
| B3 | **Restore never exercised with `pg_dump`.** The embedded PostgreSQL here ships only `initdb`, `pg_ctl`, `postgres` | Blocking | The documented recovery path is unproven. `restore.sh` is written and syntax-checked but has never run |

None is a defect. All three are the same missing host.

## 2. Deployment blockers

| # | Item | Status |
|---|---|---|
| D1 | Docker build | **Not executed** — no runtime. `scripts/verify-docker.sh` runs all nine checks |
| D2 | Docker Compose | **Structurally validated**, not run. `scripts/validate-compose.mjs` parses it, resolves anchors, checks for keys under the wrong parent, confirms the db is unpublished, all three named volumes exist, every service has logging and a restart policy, and every required `${VAR}` is in the env file. Proven non-vacuous against a deliberately broken copy |
| D3 | Environment variables | **Verified** — 6 required, all present in `.env.prod.example`; 2 optional documented |
| D4 | Production `.env` | **Verified** — template complete, gitignored (`git check-ignore` confirms) |
| D5 | Database migrations | **Verified** — 15 applied to an empty database, zero drift, upgrade byte-identical across 27 tables |
| D6 | Seed strategy | **Verified** — base seed and demo seed separate; demo is idempotent with a reset. DEPLOYMENT.md creates the customer's admin directly and never runs the demo seed |
| D7 | Image optimization | **Not measured** — multi-stage with `--omit=dev`; expected sizes documented, unconfirmed |
| D8 | Health endpoints | **Verified** — `/health` 200, `/health/ready` 503 when the database is unreachable |
| D9 | Restart policy | **Set, not exercised** — `unless-stopped` on all three services |
| D10 | Graceful shutdown | **Verified** — SIGTERM drains, disconnects Prisma, force-exits after 10 s |
| D11 | Persistent storage | **Declared, not exercised** — three named volumes; the down/up persistence check is in `verify-docker.sh` |
| D12 | File uploads | **Verified in-process** — MIME allowlist, 10 MB × 5, UUID filenames, writability checked at boot |
| D13 | Backup directories | **Verified** — `safeops_backups` volume, `BACKUP_DIR` configurable, retention pruning |
| D14 | Log directories | **Fixed this pass** — see I3 |
| D15 | `prisma migrate deploy` | **Verified** — 15 migrations to an empty database |
| D16 | `prisma generate` | **Verified**, and that the CLI survives `npm ci --omit=dev` |

## 3. Infrastructure blockers

**None open.** Three real risks were found this pass and fixed:

| # | Was | Now |
|---|---|---|
| **I1** | `DATABASE_URL` had no `connection_limit`. Prisma sizes the pool from the host CPU count — 17 connections on 8 cores, **65 on 32** — so two instances could exhaust PostgreSQL's 100 and lock everyone out | `connection_limit=${DB_POOL_SIZE:-20}` and `pool_timeout=15`, with `max_connections=100` set explicitly on the database |
| **I2** | Rate limit 600/min **per IP**, hardcoded. A customer behind corporate NAT is one IP: forty people on a nine-request dashboard would throttle their own company | 3,000/min, tunable via `RATE_LIMIT_PER_MIN`, with the NAT reasoning in the code |
| **I3** | **No logging config.** Docker's json-file driver is unbounded and the API writes a line per request. A retry storm fills the disk, and a full disk stops PostgreSQL | `max-size: 20m`, `max-file: 3` on every service — 60 MB ceiling each |

Remaining infrastructure notes, none blocking:

| Item | Status |
|---|---|
| Memory | **Measured** — API 196 MB after sustained load, 465 MB peak under 1000 concurrent; PostgreSQL 28 MB |
| CPU | **Measured** — 204 s across the full load campaign |
| Disk / storage growth | **Bounded** — logs capped, backups pruned at 30 days. Uploads grow with use and are the customer's data |
| Automatic cleanup | Backup retention only. No upload cleanup — evidence is never deleted, by design |
| Scheduler reliability | **Verified** — 12 notifications on a fresh install, none duplicated across restart, one bad row cannot abort a sweep |
| **Email** | **NOT IMPLEMENTED.** Notifications are in-app only. Listed as commented-out keys in `.env.prod.example` so the gap is explicit |
| Notification delivery | **Verified in-app** — rendering in the bell with real record references, correctly tenant-scoped |

## 4. Customer risks

| Risk | Severity | Workaround |
|---|---|---|
| Expects emailed escalations | High | None. Say it before they sign. The reminders exist and are reliable; they live in the bell |
| Uses Safari or Firefox | High | **Untested.** Half a day closes it. Safari is the predicted failure: `SameSite=Strict` + ITP. The test is *sign in, reload, stay signed in* |
| Relies on the in-app restore | Medium | Stated in red at the point of decision. Measured: 11 of 32 incident timeline entries and 20 of 38 permit checklists not restored. Real recovery is `pg_dump` |
| Imports years of history | Low | Bounded — 45-day lookback, 200 per workspace per sweep. Measured 3,361 → 404 on the same data |
| Grows past 2,000 records in a register | Low | Search and filters are server-side and reach everything |
| Asks how the Safety Score works | Low | It is not computed. Have the answer ready or remove the tile |

## 5. Operational risks

| Risk | Severity | Workaround |
|---|---|---|
| First Docker build fails | Medium | Expected. `verify-docker.sh` stops at the first failure with a specific message. Budget half a day |
| Web and API on different registrable domains | Medium | Sessions silently die on reload. Called out in DEPLOYMENT.md, both proxy configs, and line 4.5 of the acceptance checklist |
| Single instance — a restart is a brief outage | Low | Accepted for a pilot. `unless-stopped`; the scheduler is idempotent |
| Slow memory growth over weeks | Unknown | A four-minute soak shows flat connections and a sawtooth heap. A slow leak needs days. Weekly checks in the runbook |
| Nobody has restored a backup | Medium | `restore.sh` verifies against a manifest and checks for orphaned children — but it has never run. Drill it once, timed |

## 6. Open bugs

**None known.** Every defect found across this programme is fixed and covered by a test.
Two were found in this pass, both in my own tooling rather than the product:

| Found | Was | Now |
|---|---|---|
| `attack-probe.ts` summary | Counted a check that could not run as "repelled" — it would print 18/18 while two never executed | Skipped checks are excluded from the denominator, listed explicitly, and force a non-zero exit so a deploy script cannot treat an incomplete probe as green |
| `attack-probe.ts` startup | Crashed with a stack trace when the login throttle was exhausted | Explains that the limiter is working and how to clear it |

Both matter beyond the tool: a verification script that reports success it did not earn is
worse than no script.

## 7. Estimated deployment time

| Step | Time |
|---|---|
| Provision host, install Docker | 30 min |
| Clone, configure `.env.prod`, generate keys | 20 min |
| `verify-docker.sh` — first run, including fixing what it finds | **2–4 h** |
| TLS: DNS, certificates, proxy config | 1 h |
| Create the customer's company, site and administrator | 20 min |
| Backup cron, off-host copy | 30 min |
| **Restore drill, timed** | 1 h |
| Acceptance checklist with the customer | 1 h |
| Safari and Firefox pass | 2 h |

**Realistically one working day**, two if the first Docker build fights back. The only
genuinely unpredictable item is `verify-docker.sh`.

---

## What each phase actually produced

| Phase | Result |
|---|---|
| **1. Production deployment** | 16 items: 11 verified, 5 not executable without Docker |
| **2. Deployment package** | Dockerfiles, compose, `.env.prod.example`, Caddy + nginx, and six operational scripts: `deployment.sh`, `rollback.sh`, `backup.sh`, `restore.sh`, `healthcheck.sh`, `startup.sh`. All `bash -n` clean; path resolution and the Docker guard tested from a foreign working directory |
| **3. Infrastructure** | Three real risks found and fixed (I1–I3). Memory, CPU and connections measured |
| **4. Pilot reliability** | Every workflow walked in the browser against PostgreSQL in prior sessions; 21/21 controls and 18/18 attacks re-verified against a running stack today |
| **5. Browser compatibility** | Checklist produced. 2 of 6 targets verified, in one engine. Four marked Cannot verify locally / Requires customer device |
| **6. Operational readiness** | Eight guides: Deployment, Backup, Restore, Install, Pilot Runbook, Support Runbook, Incident Response, Browser Compatibility |
| **7. Customer acceptance** | 10-section checklist with sign-off, including a section that requires the eight known limitations to be read aloud |
| **8. Release candidate** | This document |

## Release gate

| | |
|---|---|
| Critical issues | **0** |
| High issues | **0** |
| Automated tests | **298 API, 36 web, all passing** |
| Typechecks / builds | **Both workspaces clean** |
| Security controls | **21/21** |
| Attack resistance | **18/18** |
| Migrations | **Verified from empty, zero drift, lossless upgrade, rollback proven** |
| Docker | **Not executed — no runtime on this machine** |
| HTTPS | **Configured, not exercised** |

---

## Exact work to reach READY FOR LIMITED PRODUCTION

Three tasks. None is code.

### 1. Build and prove the images — 2–4 hours

On any host with Docker:

```bash
cd safeops-platform && bash scripts/verify-docker.sh
```

Nine checks, stops at the first failure. The one that matters most is §6: it counts
companies, tears the stack fully down, brings it back and counts again. If the numbers
differ, the volume is not persisting and no customer data is safe.

### 2. Put it behind TLS and prove the session — 1 hour

```bash
caddy run --config deploy/Caddyfile
```

```bash
cd api && npx tsx scripts/headers-probe.ts https://api.customer.example https://app.customer.example
```

Then the test no script can do: **sign in, press F5, confirm you are still signed in.**
That is the `SameSite=Strict` cookie crossing a real domain boundary.

### 3. Drill the restore, and time it — 1 hour

```bash
deploy/backup.sh
```

```bash
deploy/restore.sh /backups/db-<stamp>.dump
```

`restore.sh` takes a safety dump first, compares every table against the manifest, and
checks for orphaned child records. Record the elapsed time on line 6.5 of the acceptance
checklist.

**When all three pass, this is READY FOR LIMITED PRODUCTION** — with the eight limitations
in section 10 of the acceptance checklist disclosed to the customer in writing.
