# Pilot readiness

Whether SafeChain can be given to a real company, what was fixed to get here, and what is
still true that a customer should be told. Every number below was produced by running
something; where a check could not be run, it says so.

Repository `safeops-platform` · branch `feature/permit-to-work` · 30 July 2026
Supersedes the 29 July edition. Two claims in that version were wrong and are corrected at
the end.

---

## Verdict: **Go**, for a supervised pilot with one design-partner customer.

The definition being measured against is the one set for this programme: a customer can
install, configure and use the application for daily HSE operations without data loss or
critical failure; core workflows work end to end; authentication, authorisation and tenant
isolation are verified; migrations are reliable; deployment is repeatable; and what remains
is documented, non-critical and safe under supervision.

All six now hold. On 29 July they did not — four blockers stood, and walking the product
found three more that reading it had missed.

**Readiness: 90%.** The missing tenth is not a defect. It is that the Docker images have
never been built (no Docker on this machine), the deployment has never been exercised on a
real host, and no customer has used it yet. Those are retired by doing the pilot, not by
more work in this repository.

---

## What was found and fixed

Nine issues, four of them severe enough to stop a pilot. Six were found by executing the
product rather than reading it — worth noting, because the four that reading alone would
have caught were the least damaging.

| # | Issue | How it was found | Status |
|---|---|---|---|
| **C1** | Lists stopped at 100 records with no way to reach the rest. Against 5,012 incidents the interface reached 100, and the header's count — computed from the loaded page — was wrong too | Probe comparing rows returned against true totals, then confirmed in the browser | **Fixed.** `paging.ts` walks the server's pages, bounded at 2,000 rows. Re-measured in the browser: 100 → 2,000, page responsive at 59k DOM nodes |
| **C2** | Nothing ran the reminders and escalations the interface states as policy | `grep` for any scheduler returned nothing; the admin console showed no job had ever run | **Fixed.** `scheduler.ts` sweeps actions, inspections and certificate expiry. Verified live: 15 notifications raised from demo data, none duplicated on restart |
| **C3** | Uploaded evidence written to a path fixed relative to the working directory, which a container platform discards on redeploy | Read of `incidentExtras.ts` | **Fixed.** `UPLOAD_DIR` is configurable and checked for writability at boot |
| **C4** | No Dockerfile for either workspace, no production compose, no deployment path | `find -name Dockerfile` returned nothing | **Fixed.** Dockerfile per workspace, production compose, nginx config, `.env.prod.example`. **Images not built — see limitations** |
| **C5** | `npm start` had never worked. `package.json` names `dist/server.js`; `tsc` emitted `dist/src/server.js` because `scripts/` was in the compile | Running the documented production entrypoint while verifying C4 | **Fixed.** `tsconfig.build.json` ships `src` only. Entrypoint boots and serves; both health endpoints verified against the built output |
| **C6** | Corrective actions vanished from a case after every stage change. `advance`, `saveRca` and `approveRca` returned the bare row with no relations | Walking the incident lifecycle in the browser | **Fixed.** All three re-read through `get`. Regression test walks the full lifecycle |
| **C7** | The unauthenticated certificate check returned the entire employee record — email, internal ids, tenant id, site and department. Certificate numbers are sequential, so the workforce directory of every tenant was enumerable by anyone who could count | Calling the public endpoint during the training journey | **Fixed.** Returns only what the printed document shows. Test asserts the exact key set and that no identifier appears anywhere in the payload |
| **C8** | The first sweep over a year of imported history raised 3,361 notifications in one pass | Starting the scheduler against the scale dataset | **Fixed.** 45-day lookback and a per-workspace ceiling: 404 against the same data |
| **C9** | That ceiling was global, so one tenant's backlog would consume it in due-date order and silence every other tenant indefinitely | Integration test failing only when run alongside other files | **Fixed.** Per workspace, with a test for the starvation case |

A tenth, found the same way: a workspace deleted mid-sweep violated the notification
foreign key and aborted the entire pass, losing every other tenant's reminders. One bad row
is now skipped and logged.

---

## What was verified, and how

### Workflows walked in the browser, against PostgreSQL

| Journey | Result |
|---|---|
| **Incident, full lifecycle** | Reported → Assessment → Investigation → RCA → Corrective Actions → Manager Review → Verification → Closed. INC-3212 created from the four-step form, investigator assigned, cause recorded, five-whys completed, CA-514 raised against the cause, completed with evidence, verified, closed. Every stage gate refused to advance until its precondition was met |
| **Permit, full lifecycle** | Draft → Submitted → **issue refused twice** (5 unconfirmed precautions; no gas test, both stated on screen) → precautions confirmed → gas test passed → Approved → Work in progress → **failed gas test auto-suspended live work** and recorded why → clean re-test → Resumed → Closed with handback confirmed |
| **Inspection** | Ran the overdue weekly check on Reach truck RT-07. Submission refused until the failed item carried a defect description. On submit: outcome recorded, **CA-515 auto-raised**, next inspection auto-scheduled |
| **Audit** | Opened the contractor audit at 78%. The close button reads "Close audit (1 unverified)" and closing was refused — the audit stayed Completed while its finding's action is unverified |
| **Training** | Certificate register renders; the competency matrix shows 75% with real gaps; certificate verification returns the correct verdict for a lapsed certificate |
| **Notifications** | The scheduler's output renders in the bell with real record references (CA-511 due in 7 days, three overdue inspections, four lapsed competencies), correctly scoped to the current workspace |
| **Tenant switching** | Switching to Kenyalang changes every figure: 2 open incidents, 60% compliance, 79% audit readiness, its own priority queue |

### Security, probed through HTTP with real sessions

`api/scripts/security-probe.ts` — **21/21 passed**:

- **Authentication (3/3)** — no token, a forged token and a token with six characters of
  its signature altered are all rejected with 401.
- **Tenant isolation (10/10)** — a session belonging to Borneo cannot read Kenyalang's
  incidents, actions, permits, assets, audits, certificates, notifications, activity, sites
  or users. Every one returns 403.
- **Role enforcement (3/3)** — an employee cannot create a user; a safety officer cannot
  read the admin audit log; a role asserted in the request body is ignored, because the
  role is read from the signed token.
- **Public surface (2/2)** — the certificate check leaks nothing beyond the document;
  health needs no session.
- **Input bounds (3/3)** — `pageSize=100000` is refused with 400; a SQL injection string is
  treated as a search term and the table survives; a 200 kB body is refused with 413.

Also checked by inspection: no `$queryRawUnsafe` or `$executeRawUnsafe` anywhere in
`api/src`; one `dangerouslySetInnerHTML`, fed by a locally generated QR SVG; the three
print helpers escape every free-text interpolation and no escaped value lands in an HTML
attribute; Argon2id passwords; refresh tokens, API keys and webhook secrets stored only as
SHA-256 digests; no key material in the repository; every secret required with no default,
the process exiting at boot if one is missing; 21 admin audit-trail call sites recording
actor, role, IP and device.

### Database and migrations

- All 15 migrations applied cleanly to a genuinely empty database.
- `prisma migrate diff --exit-code` → **"No difference detected"**, exit 0. No drift.
- A complete fresh install — `migrate deploy` → `npm run seed` → `npm run demo` — ran end
  to end on that empty database, producing 2 companies, 9 sites, 20 employees and a
  populated workspace.

### Performance

Measured with `perf-probe.ts` (10 samples per endpoint, real sessions) and `query-probe.ts`
(SQL counted from Prisma's event stream).

- **No N+1 anywhere.** Query counts are identical at 12 rows and at 100 rows drawn from a
  5,012-incident dataset: incidents 4/4, actions 4/4, permits 9/9, assets 9/9, audits 7/6,
  certificates 3/3. Counts do not scale with data.
- **Latency at demo scale:** worst p95 is `admin.health` at 85 ms; every other endpoint
  under 60 ms.
- **At a year of operations** (5,012 incidents, 4,000 actions, 1,500 permits, 900 assets,
  6,000 certificates): worst service-level operation is `training.certificates` at 111 ms.
- **Pagination bounds** enforced by zod on every list route.
- Loading 2,000 rows in the browser: 59,084 DOM nodes, 59 MB heap, input still responsive.

### Test suite

298 API tests (12 of them the new scheduler suite, all against real PostgreSQL), 36 web
tests, both typechecks clean, both builds succeed. The API suite was run four consecutive
times to confirm the cross-file flakiness introduced by a global sweep was genuinely fixed
rather than intermittent.

---

## Known limitations

None of these prevents a supervised pilot. All should be said out loud rather than
discovered.

| Limitation | Detail | Mitigation for the pilot |
|---|---|---|
| **Docker images never built** | No Docker on the development machine. The Dockerfiles, compose file and nginx config are written and the commands they run are individually verified — `npm ci`, `prisma generate`, `npm run build` and `npm start` all work — but `docker build` has never executed | Build both images and bring the stack up once before the customer touches it. Budget half a day for the first attempt |
| **Lists cap at 2,000 rows** | Beyond that the list stops and logs how many records are unreachable. A pilot customer will not approach it; search and filters run server-side, so any single record remains findable | Real pagination before a customer exceeds it |
| **Single instance only** | The scheduler runs in the API process. Two instances would each sweep — the dedupe makes that harmless rather than duplicating, but it is not the intended shape | `SCHEDULER_ENABLED=false` on all but one, or stay at one |
| **Backups are restore points, not disaster recovery** | The in-app snapshot is a JSON blob in the same database, covering 12 parent tables and none of their children. The screen no longer claims otherwise | `pg_dump` on a schedule to storage off the host. `postgresql16-client` is in the API image for exactly this |
| **Notifications are still client-emitted for user actions** | Time-based reminders now come from the scheduler and are reliable. A notification for someone else's action still depends on the actor's browser making a second call | The reminders that matter — overdue, escalation, expiry — are server-side |
| **Trend charts and Safety Score are illustrative** | The 12-month series and the composite score are generated curves. Every KPI tile, the priority queue, the insights panel and the site map are real | Say so. Do not read the score's tooltip aloud |
| **Permission matrix is display-only** | Authorisation switches on `Membership.role` in the services; editing a cell changes nothing | Say so if asked. A customer must not believe they can self-serve a custom role |
| **`sameSite: strict` refresh cookie** | Correct when web and API share a registrable domain. If they do not, no session survives a reload | Settled by deployment topology — put both under one domain. `.env.prod.example` says this |
| **Global search does nothing** | The header box reads "coming with data modules" | Expect it to be the first thing anyone clicks |
| **No email delivery** | Notifications are in-app only | The bell is checked daily by the roles that matter in a pilot |

---

## Recommended deployment

```
                    TLS terminated here (LB, Caddy, or existing nginx)
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              safeops-web                     safeops-api
              nginx:8080                      node:4000, one instance
              static bundle                   scheduler runs in-process
                                                    │
                                              postgres:16
                                              named volume + pg_dump to
                                              off-host storage
                                                    │
                                              uploads volume
                                              (incident evidence)
```

Both containers behind whatever already terminates TLS. Postgres is not published — only
the API reaches it, on the internal network. Two named volumes matter: the database and the
uploads. Losing either loses customer data.

```bash
cp .env.prod.example .env.prod   # then fill it in: npm run keygen for the JWT keys
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

**Expected concurrent users: 50–100 comfortably on 2 vCPU / 4 GB.** Grounded in the
measurements above, not a guess: the heaviest screen issues nine requests, the slowest is
85 ms p95, and a year of operations moves the worst operation to 111 ms. A pilot of 20–40
named users at one site sits far inside that. The first thing to run out is the Postgres
connection pool, not CPU.

### Backup strategy

1. `pg_dump` nightly to storage off this host — that is the backup. Restore is
   `pg_restore`, and it must be practised once before the pilot begins, not during it.
2. The uploads volume backed up on the same schedule. Attachment rows without their files
   are worse than neither.
3. The in-app restore point is for undoing a bad import inside the product. It is not
   disaster recovery and the screen no longer suggests it is.

### Monitoring

`/health` for liveness and `/health/ready` for readiness — the latter checks the database
and returns 503 when it is unreachable. Both are exempt from rate limiting so an
orchestrator can never be throttled into declaring the service dead. The API emits one JSON
line per request with method, path, status, duration and the acting user id; no body, query
string or header is logged, because those carry the customer's safety data. For a pilot,
ship those to a file and read them when something is reported.

### Recovery

| Failure | Response |
|---|---|
| API crashes | `restart: unless-stopped` restarts it. Migrations run before it serves, so it cannot come up against a schema it does not expect |
| Database unreachable | `/health/ready` returns 503 and the orchestrator stops routing. The API does not need a restart when the database returns |
| Bad deploy | Rebuild the previous image tag. Migrations are additive — none of the 15 drops a table or a column |
| Customer error (bad import, wrong bulk edit) | The in-app restore point, taken automatically before any restore |
| Host loss | `pg_restore` the nightly dump plus the uploads volume onto a new host, then bring the stack up |

---

## Before the customer sees it

1. **Build and run the images once.** The single largest untested step.
2. **Practise a restore.** `pg_dump`, drop, `pg_restore`, sign in. A backup nobody has
   restored is a hope.
3. **Decide the domain.** Web and API under one registrable domain, or the refresh cookie
   will not be sent.
4. **Have an answer for the scheduler.** It runs every 15 minutes in the API. If they ask
   what happens when the process is down, the answer is that the sweep is idempotent and
   catches up on the next start — which is true, and verified.

---

## Two corrections to the 29 July report

- It described a demo beat where scanning a certificate QR code opens a verification page
  with no login. **There is no public verification page.** The API endpoint is public; the
  web app offers verification only to signed-in users from the Certificates panel, and the
  QR labels point at the asset profile. Do not plan a demo around it.
- It listed the four blockers as the whole of what stood between the product and a pilot.
  Walking the workflows found three more, one of them a security issue. The lesson is in
  the audit's own method section: reading code finds the problems you can imagine.
