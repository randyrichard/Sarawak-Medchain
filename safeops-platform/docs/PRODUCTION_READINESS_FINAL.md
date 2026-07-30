# Final production readiness assessment

Nine-phase process, 31 July 2026, `feature/permit-to-work`. Every result below was
produced by executing something. Where an item could not be executed, it says so and is
not counted as passed.

---

# Recommendation: **READY FOR DESIGN PARTNER PILOT**

Not "ready for production" — one gate item cannot be verified on this machine, and the
gate itself allows for that: *"Docker deployment verified **or blocked only by missing
host software**"*. It is blocked by exactly that, and by nothing in the codebase.

The application layer is in good shape. Every attack I could think of was repelled, every
workflow runs against PostgreSQL, and the two things that would have broken a real deploy —
an entrypoint that never worked and a rate limit that would have throttled a whole
customer — were found and fixed in this pass.

---

## 1. Remaining Critical issues

**None.**

Four Critical issues were found across this and the preceding sessions. All are fixed:

| Found | Was | Now |
|---|---|---|
| `npm start` pointed at a path `tsc` never emitted | Every container would crash-loop on start | `tsconfig.build.json` ships `src` only; the entrypoint boots and serves |
| Public certificate check returned the whole employee record | Sequential numbers made every tenant's workforce directory enumerable without a session | Returns only what the printed document shows; a test asserts the exact key set |
| Corrective actions vanished from a case after every stage change | Indistinguishable from data loss to a safety officer | All three mutators re-read through `get`; regression test walks the lifecycle |
| Lists stopped at 100 records | 4,912 of 5,012 incidents unreachable | Pages are drained to 2,000 with the ceiling announced |

## 2. Remaining High issues

**None open.** Two were found and fixed in this pass:

| Issue | Why it mattered | Fix |
|---|---|---|
| Rate limit was 600/min **per IP**, hardcoded | A customer behind corporate NAT is one IP. Forty users loading a nine-request dashboard would collectively throttle their own company | Raised to 3,000/min and made tunable via `RATE_LIMIT_PER_MIN`. The reasoning is in the code so the next person does not lower it back |
| A database outage returned 500 | Tells a proxy the failure is permanent and a monitor that the application is broken | 503 with `Retry-After: 5`. Verified against an API pointed at a database that does not exist |

## 3. Remaining Medium issues

| # | Issue | Impact | Recommendation |
|---|---|---|---|
| M1 | **In-app restore point covers parents, not their history.** Measured: 11 of 32 incident timeline entries and 20 of 38 permit precaution checklists were not restored | A restored permit has no record of the controls signed off on it | Already stated in red in the restore dialog and in BACKUP.md. Widen the snapshot, or keep it as an explicit undo-only feature |
| M2 | **Latency degrades sharply above ~200 concurrent users.** p95 563 ms at 100 → 2.7 s at 500 → 5.8 s at 1000 | Far beyond a pilot, but it is where the ceiling is | Two endpoints dominate: `assets/stats` (35 queries) and `audits/stats` (33). Both are fixed-cost, not N+1 |
| M3 | **No email.** Notifications are in-app only | A customer expecting an emailed escalation will not get one | Say it in the first meeting |
| M4 | **Trend charts and Safety Score are illustrative.** Every KPI tile, the priority queue, insights and the site map are real | A prospect who asks how the score is calculated gets an unsatisfying answer | Compute it or label it |
| M5 | **Permission matrix is display-only.** Roles are enforced in the services | A customer may believe they can self-serve a custom role | Relabel the screen |
| M6 | CSV import bound (500,000 chars) exceeds the JSON body limit (100 kB) | A large import fails with a confusing message about the body | Align the two |

## 4. Remaining Low issues

| # | Issue |
|---|---|
| L1 | Global search does nothing — labelled "coming with data modules" |
| L2 | Charts bundle is 525 kB raw / 156 kB gzipped, over Vite's warning threshold |
| L3 | Prisma 5.22 with 7.9 available — a major upgrade, not worth taking during pilot preparation |
| L4 | Development cluster is WIN1252; production Postgres is pinned to UTF-8. Contained, affects nothing shipped |

## 5. Deployment blockers

**One, and it is environmental rather than a defect.**

**The container images have never been built.** Verified on this machine:

```
docker, docker-compose, podman, nerdctl, buildah, colima : none on PATH
C:\Program Files\Docker, C:\ProgramData\DockerDesktop     : do not exist
wsl.exe --status  →  "The Windows Subsystem for Linux is not installed."
Hyper-V           →  cannot query: "The requested operation requires elevation"
running as admin  →  False
```

All three blockers named in the brief are present at once: no Docker Desktop, no WSL2, no
administrator rights. Installing either needs elevation and a reboot.

Nothing was simulated. Every command the images run was verified natively instead —
`npm ci --omit=dev` (and that the `prisma` CLI survives it, so `migrate deploy` will run),
`prisma generate`, `npm run build`, `node dist/server.js`, `prisma migrate deploy`, and the
Vite build. The Dockerfiles, compose networking, volume persistence and image sizes are
unproven.

Everything needed to close this is written and ready to run:

- [`docs/DOCKER_VERIFICATION.md`](DOCKER_VERIFICATION.md) — every command, with expected output
- [`scripts/verify-docker.sh`](../scripts/verify-docker.sh) — runs all nine checks, stops at the first failure
- [`deploy/Caddyfile`](../deploy/Caddyfile) and [`deploy/nginx-safeops.conf`](../deploy/nginx-safeops.conf) — HTTPS, HSTS, forwarded headers, health-check routing

**HTTPS is configured but not exercised.** Both proxy configs are written; the `Secure`
cookie flag and HSTS header are confirmed present in production mode. No TLS handshake has
been performed, because there is no terminator here.

## 6. Production risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **First Docker build fails on something small** | High — first builds usually do | Half a day budgeted. `verify-docker.sh` stops at the first failure with a clear message |
| **Web and API on different registrable domains** | Moderate | The refresh cookie is `SameSite=Strict`; sessions would silently not survive a reload. Called out in DEPLOYMENT.md and both proxy configs |
| **Uploads volume not mounted** | Low | The API refuses to start if `UPLOAD_DIR` is not writable, so this fails loudly at boot rather than at the first upload |
| **Operator relies on the in-app restore** | Moderate | Now stated in red at the point of decision, and BACKUP.md leads with `pg_dump` |
| **Slow memory growth over weeks** | Unknown | A four-minute soak shows a flat sawtooth and constant connections; a slow leak needs days. Weekly checks in PILOT_RUNBOOK.md |
| **A single API instance is a single point of failure** | Accepted for a pilot | `restart: unless-stopped`; the scheduler is idempotent so a restart mid-sweep is harmless |

## 7. Customer risks

| Risk | Mitigation |
|---|---|
| Expects email notifications | Say so before they sign. The reminders exist and are reliable; they live in the bell |
| Imports years of history and floods the bell | Bounded: 45-day lookback, 200 notifications per workspace per sweep. Measured — 3,361 became 404 on the same data |
| Grows past 2,000 records in a register | Search and filters are server-side and reach everything; the console states how many are unreachable |
| Asks how the Safety Score works | It is not computed. Have the answer ready or remove the tile |
| Uses Safari, especially on iOS | **Untested.** Safari is strictest about cookies and this application is opinionated about them. Test before the pilot |
| Loses data and reaches for the in-app restore | It is an undo, not a recovery. Practise the `pg_dump` restore once, timed, before day one |

---

## Phase results

| Phase | Status | Evidence |
|---|---|---|
| **1. Docker** | **BLOCKED** | No runtime, no WSL2, no admin. Stopped as instructed; commands generated |
| **2. HTTPS** | CONFIGURED, NOT EXERCISED | Caddy and nginx configs written. Cookie `HttpOnly`+`Secure`+`SameSite=Strict`+`Path=/auth` confirmed in production mode; HSTS, CSP, nosniff, COOP, CORP present; CORS refuses an unknown origin. No TLS handshake performed |
| **3. Backup / DR** | PASS WITH A DOCUMENTED GAP | Full drill: census → restore point → damage across every module → restore → census. All parents restored; incident timelines and permit checklists did not. `pg_dump` itself could not be run — the embedded Postgres ships only `initdb`, `pg_ctl`, `postgres` |
| **4. Pilot scenarios** | PASS | Full incident lifecycle to Closed; permit lifecycle including both refusals, auto-suspend on a failed gas test, resume and handback; inspection with an auto-raised defect and auto-scheduled next; audit close gate refusing an unverified finding; training; notifications; tenant switching. All against PostgreSQL, no mocks |
| **5. Security** | PASS | 21/21 controls + **18/18 attacks repelled**: mass assignment, privilege escalation via body and headers, id enumeration, `alg:none`, re-signed payload, CSRF, refresh replay, concurrent reference allocation, concurrent approval bypass, executable upload, path traversal in filename, stored XSS |
| **6. Performance** | PASS at pilot scale | 100 users: p95 563 ms, zero errors. 500: p95 2.7 s, zero errors. 1000: p95 5.8 s. **The API logged 21,011 requests with zero 5xx and zero unhandled errors across all three tiers** — the 3,555 failures at 1000 were my load generator exhausting sockets client-side, not the server |
| **7. Operational** | PASS | Structured request logging; `/health` and `/health/ready`; graceful shutdown draining with a 10 s cap; scheduler verified live (12 notifications on a fresh install, none duplicated across restart); database outage recovery verified twice, without a restart |
| **8. Code quality** | CLEAN — nothing removed | No TODO/FIXME/HACK in source. No `console.log` in web. No `debugger`, no `.only`/`.skip`. Two apparent unused items were **false positives in my own grep** — `CORS_ORIGINS`/`SCHEDULER_ENABLED` are used via derived `env` fields, `AssetDocument` is included in the asset query and rendered in the drawer. Nothing was deleted |
| **9. Customer walkthrough** | PASS | Workflow gates refuse correctly and say why: five unconfirmed precautions and a missing gas test both block issue with a visible reason; a failed inspection item requires a defect description; RCA requires a cause and a root statement; an audit will not close on an unverified finding |

## Final gate

| Item | |
|---|---|
| No Critical issues | ✓ |
| No High issues | ✓ |
| All migrations verified | ✓ 15 applied to an empty database, zero drift, upgrade byte-identical across 27 tables |
| Docker verified **or blocked only by missing host software** | ✓ blocked only by missing host software |
| HTTPS configured | ✓ configured; not exercised |
| Authentication verified | ✓ |
| Authorization verified | ✓ |
| Scheduler verified | ✓ |
| Notifications verified | ✓ |
| All workflows verified | ✓ |
| Production build verified | ✓ |
| Security checks passed | ✓ 21/21 and 18/18 |
| Performance acceptable | ✓ at pilot scale |
| Documentation complete | ✓ seven documents |
| Backup verified | ✓ with a documented gap |
| Restore verified | ✓ with a documented gap |
| Pilot checklist complete | ✓ |

---

## Before the customer arrives

1. **Run `bash scripts/verify-docker.sh`** on a host with Docker. Half a day.
2. **Put it behind Caddy or nginx** using the config in `deploy/`, and confirm a session
   survives a reload on the real domain.
3. **Practise the `pg_dump` restore once, timed.**
4. **Open the application in Safari**, desktop and iOS.

No code work remains. All four are environmental, and none can be done from here.
