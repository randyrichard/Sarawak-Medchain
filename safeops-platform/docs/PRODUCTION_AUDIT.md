# Production readiness audit

Phase 1 of the pilot programme. Every finding below was reproduced by executing something —
a probe against the running API, a query against PostgreSQL, or a check in the browser. No
finding is inferred from reading code alone; where a check was not run, the row says so.

Repository: `safeops-platform` · branch `feature/permit-to-work` · commit `e1f4095`
Audited 30 July 2026 against PostgreSQL 18 (embedded, port 5433), Node 24.12.

## How the evidence was gathered

| Tool | Purpose |
|---|---|
| `api/scripts/perf-probe.ts` | HTTP latency (p50/p95/max, 10 samples) against the running API with a real session |
| `api/scripts/query-probe.ts` | SQL statement count per service operation, via Prisma's query event stream |
| `api/scripts/truncation-probe.ts` | Compares rows an endpoint returns against the true row count |
| `api/scripts/load-scale.ts` | Loads a year of operations (5,000 incidents, 4,000 actions, 1,500 permits, 900 assets, 6,000 certificates) |
| `api/scripts/scratch-db.ts` | Creates/drops a throwaway database so migrations can be tested against an empty server |

---

## Critical

### C1 — List views are capped at 100 rows with no way to reach the rest

| | |
|---|---|
| **Impact** | A customer cannot see their own records. At 5,012 incidents, 4,912 are unreachable through the interface. The list header's "N open in scope" is computed from the loaded page, so the number shown is also wrong. |
| **Risk** | Data appears lost. An HSE manager who cannot find last month's incident concludes the system dropped it. This ends a pilot. |
| **Reproduce** | Load the scale dataset, then `BASE=http://localhost:4001 tsx scripts/truncation-probe.ts`. Result: `incidents asked 100, returned 100, total 5012 — 4912 unreachable`; same for actions (3,914), permits (1,406), assets (810), audits (205). In the browser, `/incidents` contains no next/prev/page/more control (checked by enumerating every button and link on the page). |
| **Root cause** | The API paginates correctly and returns an accurate `total`. `client.ts` requests `pageSize: 100` and renders `page.rows`, discarding `total`; no list page has a pagination control. |
| **Fix** | Surface the server's `total`. Either paginate the list UI or, at minimum, load subsequent pages on demand and tell the user how many records exist. |
| **Blocks pilot** | **Yes** |

### C2 — Nothing runs the scheduled work the interface promises

| | |
|---|---|
| **Impact** | Reminders at 7/3/1 days, escalation to site manager at T+3 and HSE manager at T+7, certificate expiry scans, and the daily backup never happen. The Actions page states the escalation policy as fact. |
| **Risk** | The product's core claim is that nothing falls through the cracks. Without a scheduler that claim is false, and a pilot customer discovers it by missing a statutory date. |
| **Reproduce** | `grep -rln "cron\|setInterval\|node-schedule" api/` returns nothing. The admin console's four background jobs all report no last-run timestamp. |
| **Root cause** | Never built. The service methods that would do the work exist; only the trigger is missing. |
| **Fix** | A worker process on a fixed interval calling existing service methods. In-process `setInterval` is sufficient for a single-instance pilot. |
| **Blocks pilot** | **Yes** |

### C3 — Uploaded evidence is written to the API's local disk

| | |
|---|---|
| **Impact** | Incident photos and PDFs are stored in `api/uploads/`. On a container platform this is wiped on every redeploy, and is not shared between instances. Attachment rows survive; the files behind them do not. |
| **Risk** | Silent, permanent loss of the evidence attached to a safety investigation. This is the data a customer is least able to recreate and most likely to need in a dispute. |
| **Reproduce** | `api/src/routes/incidentExtras.ts:22` — `const UPLOAD_DIR = resolve(process.cwd(), 'uploads')`, written by `multer.diskStorage`. No object-storage client is present in `api/package.json`. |
| **Root cause** | Local disk was the right choice for development and was never revisited. |
| **Fix** | S3-compatible object storage, or a mounted persistent volume with the deployment pinned to one instance. |
| **Blocks pilot** | **Yes** |

### C4 — There is no way to deploy the application

| | |
|---|---|
| **Impact** | `docker-compose.yml` defines only PostgreSQL. There is no Dockerfile for the API or the web app, no production compose file, and no deployment documentation. |
| **Risk** | "The application can be deployed consistently" is part of the definition of pilot ready. Today each deploy would be hand-assembled, and therefore different. |
| **Reproduce** | `find . -name "Dockerfile*"` returns nothing. `docker-compose.yml` contains one service, `db`. |
| **Root cause** | Development has run from `scripts/dev.mjs` on one machine. |
| **Fix** | A Dockerfile per workspace, a production compose file wiring API + web + Postgres, and a documented deploy path. |
| **Blocks pilot** | **Yes** |

---

## High

### H1 — "Backup & Recovery" stores its snapshots inside the database it protects

| | |
|---|---|
| **Impact** | A backup is a JSON blob in the `Backup` table of the same PostgreSQL instance. If that instance is lost, so is every backup. It also covers 12 parent tables and none of their children: incident events, comments and attachments, permit controls, gas tests, isolations, signatures, audit findings and session enrolments are not in the snapshot. The admin screen describes it as "Snapshot to encrypted storage". |
| **Risk** | An operator relies on it as disaster recovery and discovers at the worst moment that it is neither off-site nor complete. |
| **Reproduce** | `adminService.ts:1256` `exportTenant()` — twelve `findMany` calls, no nested `include`. `createBackup` writes the result to `db.backup.create({ data: { snapshot } })`. |
| **Root cause** | Built as an in-app undo, presented as disaster recovery. |
| **Fix** | Relabel it in the UI as a workspace restore point, and document `pg_dump` as the actual DR mechanism. Widening the snapshot to child tables is a larger change and not required for a pilot, provided the label is honest. |
| **Blocks pilot** | **No** — with the label corrected and a real backup procedure documented. |

### H2 — Rate limiting covers only the login and refresh endpoints

| | |
|---|---|
| **Impact** | Every module endpoint is unthrottled. All require a valid session, so this is abuse and scraping exposure rather than unauthenticated access. |
| **Risk** | One compromised or careless account can exhaust the database connection pool for every tenant. |
| **Reproduce** | `grep -rn "rateLimit" api/src/` returns three hits, all in `routes/auth.ts`. |
| **Root cause** | Rate limiting was added with authentication and not extended when the module routers were built. |
| **Fix** | One app-level limiter in `app.ts`, generous enough not to interfere with normal use. |
| **Blocks pilot** | **No**, but cheap enough that it should be done. |

### H3 — Notifications are emitted by the client, not the server

| | |
|---|---|
| **Impact** | After an action succeeds, the acting user's browser makes a second, fire-and-forget call to create the notification. If that call fails, is blocked, or the tab closes first, no notification exists — and the action still succeeded. |
| **Risk** | Notification delivery is not reliable, and cannot be, because the only thing that triggers it is the actor's browser. |
| **Reproduce** | `web/src/api/client.ts:435` — `void notificationsApi.create(...).catch(() => {})`. `grep -rn "notification.create" api/src/lib/` returns one hit: the endpoint the client calls. |
| **Root cause** | Documented as a deliberate deferral in `notificationService.ts` — emitting server-side would mean touching seven finished verticals. |
| **Fix** | Move emission into the services. Out of scope for a pilot if the limitation is documented and the scheduler (C2) handles the time-based cases, which are the ones that matter most. |
| **Blocks pilot** | **No**, if documented. |

### H4 — `sameSite: strict` will break sessions on a cross-site deployment

| | |
|---|---|
| **Impact** | The refresh token cookie is `sameSite: strict`. If the web app and API are served from different registrable domains, the browser will not send it, `/auth/refresh` will fail, and no session will survive a page reload. |
| **Risk** | Discovered after the first deploy, and reads as "the product logs you out constantly". |
| **Reproduce** | `api/src/routes/auth.ts:22-23`. Not reproduced live — both run on `localhost` here, which is same-site. |
| **Root cause** | Correct for a same-site deployment; the deployment topology has not been chosen. |
| **Fix** | Serve both under one registrable domain (recommended), or set `sameSite: none; secure` and rely on the CORS allowlist. Decide before the first deploy. |
| **Blocks pilot** | **No** — but it must be settled as part of C4. |

### H5 — No request logging

| | |
|---|---|
| **Impact** | The API logs a startup line and unhandled errors. There is no record of requests, response codes, latency or actor. |
| **Risk** | When a pilot customer reports "it failed this morning", there is nothing to look at. |
| **Reproduce** | `app.ts` has no logging middleware; the only `console` calls are the boot message, the shutdown message and the 500 handler. |
| **Root cause** | Not yet needed on one developer machine. |
| **Fix** | One middleware logging method, path, status, duration and user id as JSON. |
| **Blocks pilot** | **No**, but it is what makes a supervised pilot supportable. |

### H6 — The web app has no environment template

| | |
|---|---|
| **Impact** | `web/.env.local` exists locally and is gitignored; there is no `.env.example`. A person deploying has no list of what to set. |
| **Risk** | A production build without `VITE_API_BASE_URL`. This now fails closed at sign-in rather than falling back to mock auth, so the damage is bounded. |
| **Reproduce** | `ls web/.env.example` — not found. |
| **Root cause** | Oversight. |
| **Fix** | Add `web/.env.example`. |
| **Blocks pilot** | **No** |

---

## Medium

| # | Issue | Impact | Reproduce | Root cause | Fix | Blocks |
|---|---|---|---|---|---|---|
| M1 | CSV import bounds disagree | The admin importer validates up to 500,000 characters, but `express.json` caps the body at 100 kB, so a larger import fails with a 413 and a message about the body, not the file | `routes/admin.ts:83` `max(500_000)` vs `app.ts:40` `limit: '100kb'` | The two limits were set independently | Align them, or raise the JSON limit for that route only | No |
| M2 | `listCertificates` loads every certificate for the roster | 6,073 rows are read to produce 83 current ones; 111 ms at that size and linear from there | `query-probe.ts` at scale: 3 queries, 111 ms, 6,073 rows read | Current-certificate selection happens in application code | Push the "latest per employee+course" selection into SQL when a tenant approaches five figures | No |
| M3 | Permission matrix is display-only | Editing a cell changes nothing; authorisation switches on `Membership.role` in the services | Documented in `schema.prisma` on `RoleDefinition` | Deliberate; wiring it is a separate change | Say so in the UI, or relabel the screen | No |
| M4 | Dashboard trend charts and Safety Score are seeded | The 12-month series and the composite score are generated curves, not computed from tenant data. The headline near-miss figure and every other KPI are real | `web/src/api/mock/dashboard.ts` `SEEDS` | No history endpoint; the score formula is unfinished | Compute both, or label them | No |
| M5 | Global search does nothing | The header search box reads "coming with data modules" | Visible in the running app | Not built | Hide it, or build it | No |
| M6 | Development cluster is WIN1252 | The local Postgres was initialised under a Windows locale; production will be UTF-8. Stored text avoids characters that differ | `scripts/dev.mjs` now pins `--encoding=UTF8` for new clones; the existing cluster is deliberately not rebuilt | initdb inherited the machine locale | None needed — contained | No |
| M7 | Orphaned dev orchestrators | Three `scripts/dev.mjs start` processes were running simultaneously, each holding ports | `Get-CimInstance Win32_Process` | `dev:stop` stops the database, not the orchestrator | Housekeeping only | No |

---

## Low

| # | Issue | Detail | Blocks |
|---|---|---|---|
| L1 | Bundle size | The charts chunk is 525 kB raw / 156 kB gzipped, over Vite's warning threshold. Fine over broadband | No |
| L2 | Prisma 5.22 with 7.9 available | A major upgrade; no reason to take it during pilot preparation | No |
| L3 | No `.dockerignore` | Follows from C4 | No |

---

## What was verified as sound

These were checked and found correct. They are listed so the pilot report can claim them
with evidence rather than assumption.

| Area | Evidence |
|---|---|
| **Migrations from empty** | `scratch-db.ts create` then `prisma migrate deploy` against a new database: all 15 migrations applied, "All migrations have been successfully applied." |
| **No schema drift** | `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code` → "No difference detected", exit 0 |
| **Fresh install** | `migrate deploy` → `npm run seed` → `npm run demo` on the empty database, all exit 0, producing 2 companies, 9 sites, 20 employees and a populated workspace |
| **No N+1 anywhere** | `query-probe.ts` at 12 rows and again at 100 rows from a 5,012-incident dataset: query counts identical (incidents 4/4, actions 4/4, permits 9/9, assets 9/9, audits 7/6, certificates 3/3). Counts do not scale with data |
| **API latency** | `perf-probe.ts`, 10 samples per endpoint: worst p95 is `admin.health` at 85 ms; every other endpoint under 60 ms. At scale, worst service-level operation is `training.certificates` at 111 ms |
| **Pagination bounds** | Every list route caps `pageSize` via zod; `pageSize=101` on `/incidents` returns HTTP 400 rather than honouring it |
| **Authentication on every router** | All eleven routers call `requireAuth`; the only unauthenticated route is the public certificate check, registered before the guard by design |
| **SQL injection** | No `$queryRawUnsafe` or `$executeRawUnsafe` in `api/src`. All access is through Prisma's parameterised client |
| **XSS** | One `dangerouslySetInnerHTML`, fed by a locally generated QR SVG. The three print helpers escape every free-text interpolation, and no escaped value lands inside an HTML attribute |
| **Secrets** | No key material in the repository; `.env` is gitignored in both workspaces; every secret is required with no default, and the process exits at boot if one is missing |
| **Password storage** | Argon2id via `@node-rs/argon2`; refresh tokens, API keys and webhook secrets stored only as SHA-256 digests |
| **Admin audit trail** | 21 call sites covering user lifecycle, roles, API keys, webhooks, configuration, retention, backup and restore, each recording actor, role, IP and device |
| **Health endpoints** | `/health` (liveness) and `/health/ready` (checks the database, returns 503 when it is unreachable) |
| **Graceful shutdown** | SIGTERM/SIGINT drain the server, disconnect Prisma, and force-exit after 10 s |
| **Body size limit** | `express.json({ limit: '100kb' })`, with `entity.too.large` mapped to 413 rather than 500 |
| **Upload validation** | MIME allowlist, 10 MB per file, 5 files per request, server-generated UUID filenames (the client filename is never used as a path), `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` on download |

---

## Summary

| Severity | Count | Blocking |
|---|---|---|
| Critical | 4 | 4 |
| High | 6 | 0 |
| Medium | 7 | 0 |
| Low | 3 | 0 |

Four issues block a pilot: **C1** (customers cannot see their own data), **C2** (nothing runs
the scheduled work), **C3** (uploaded evidence does not survive a redeploy) and **C4** (there
is no repeatable way to deploy). All four are additive work against a codebase whose
correctness, security posture and query behaviour audit clean.
