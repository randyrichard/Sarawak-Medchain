# SafeOps architecture review

A senior-engineer read of `safeops-platform/`: how it is built, where data flows, what is
wrong with it, what was fixed in this pass and what should come next. Written
September 2026 against `feature/permit-to-work`.

## 1. What the repository contains

| Path | What it is | Status |
|---|---|---|
| `safeops-platform/` | **SafeOps** - the product. API, web app, deploy tooling. | Active, CI: `safeops-platform-ci.yml` |
| `platform/` | Sarawak MedChain e-MC platform (enterprise redesign) | Active, CI: `emc-platform-ci.yml` |
| repo root (`contracts/`, `backend/`, `frontend/`) | Original Sarawak MedChain prototype (Hardhat + IPFS) | Prototype |
| `safeops/` | First SafeOps design prototype, mock data only | **Superseded** - its README says so |

Three products and a dead prototype share one repository and one git history. Nothing
builds across them, so the cost is navigation and review noise, not coupling.

## 2. SafeOps architecture

```
Browser (React 18 + Vite + Tailwind, lazy-loaded pages)
   │  fetch, Bearer access token in memory, refresh token in httpOnly cookie
   ▼
Caddy (TLS, sets X-SafeOps-Proxy shared secret)            docker-compose.prod.yml
   ▼
Express API (Node 24, one process)
   ├─ middleware: proxy-secret check → helmet → CORS → JSON(100 kB) → request log
   │              → global rate limit (Postgres-backed) → per-router requireAuth
   ├─ routes/*.ts        29 routers, 294 endpoints. Zod validation, callerOf(req),
   │                     then one service call. No business logic.
   ├─ lib/*Service.ts    Business rules, role checks, row scoping, audit events.
   │                     One class per module, each constructed with the Prisma client.
   ├─ lib/scheduler.ts   In-process timers: 11 reminder sweeps + report runs
   │                     + webhook delivery queue.
   └─ central error handler: DomainError → {status, code}; Zod → 400; DB down → 503
   ▼
PostgreSQL 16 via Prisma (79 models, 48 migrations)
   + local volume for uploaded evidence (SHA-256 recorded)
```

### Request lifecycle (for example `GET /toolbox/today?companyId=…`)

1. **Caddy** terminates TLS and adds the proxy secret. The API deletes any
   `X-Forwarded-For` that doesn't arrive with that secret, so `req.ip` (used for the rate
   limit and the audit trail) can't be forged.
2. **Global limiter**: one atomic `INSERT … ON CONFLICT` per request into `RateLimit`.
3. **Router**: `requireAuth` verifies the RS256 access token, enforces the forced password
   change, and sets `req.auth`.
4. **Handler**: Zod parses the query, then `callerOf(req)` builds the `Caller`
   (`userId`, `name`, `roles[]`, each role scoped to a company and optionally to sites).
5. **Service**:
   - checks membership and role;
   - builds a Prisma `where` from `incidentScopeWhere` / `actionScopeWhere`, the row
     scope, so an employee sees only their own records;
   - queries;
   - shapes the response.
6. **Errors**: any `DomainError` becomes `{error: code, message}` with its status.
   Anything unknown is logged and answered with a 500 that carries no details.

### Tenancy and authorisation model

- Every row carries `companyId`. Every service method takes it explicitly and checks
  membership of the caller before any query runs.
- Role is per membership, and a membership can be restricted to a set of sites. Site
  restriction is combined with `AND`, never merged by spreading one filter over another.
- The web app has a capability matrix (`web/src/features/permissions/permissions.ts`).
  It decides what is shown. The server decides what is allowed. A test
  (`serverAgreement.test.ts`) reads the server's role lists from source and fails if the
  two disagree.

### Web app

- Pages are lazy routes (`app/App.tsx`), each behind `RequireCapability`.
- Each module has a typed API file (`api/*Api.ts`), all built on `api/http.ts`, which
  handles token refresh, detection of a different account, and network-error wording.
- `api/client.ts` (`MockApiClient`, 1,643 lines) is the older seam. Each method checks a
  `SERVER_*` flag and either calls the real API file or serves demo fixtures from
  `api/mock/`.

## 3. Critical problem areas

Ordered by what they would cost in production.

| # | Area | Problem | Impact | Status |
|---|---|---|---|---|
| 1 | Incident board (`incidentService.board`) | Loaded up to 5,000 incident rows per request and counted them in JS; `total` was `rows.length` | Past 5,000 incidents every breakdown and the total are **silently wrong**; memory and transfer grow with the register | **Fixed**: 5 `GROUP BY`s plus `count` |
| 2 | Site comparison (`siteComparison.compare`) | Loaded up to 20,000 rows, then re-filtered the whole array once per site, O(sites × rows) | Silent truncation past 20k; CPU grows with sites × incidents | **Fixed**: `GROUP BY (siteId, type, severity)`, one pass |
| 3 | Scheduler duplicate check | `notification.findFirst({companyId, href})` per candidate, and `href` wasn't indexed | Each of up to ~5,000 checks per sweep scanned the tenant's whole notification history, which only grows | **Fixed**: `@@index([companyId, href])` |
| 4 | Schema drift | Five indexes created by migrations were missing from `schema.prisma` | The next `prisma migrate dev` would generate a migration **dropping** them | **Fixed**: declared; `migrate diff` now clean |
| 5 | Error handling | 23 copy-pasted error classes, and `app.ts` listed all 23 in an `instanceof` chain | A new module not added to the list returns every 403/404 as a 500 | **Fixed**: `DomainError` base plus a guard test |
| 6 | Route boilerplate | Identical `callerOf` in 23 route files | Identity extraction is security-relevant; 23 copies can drift | **Fixed**: `middleware/caller.ts` |
| 7 | Web request helper | `incidentsApi.ts` carried a verbatim copy of `http.ts`'s `request()`, including session-refresh and wrong-account handling | A security fix to one copy misses the other | **Fixed**: uses the shared helper |
| 8 | Scheduler placement | Timers run inside the API process, so every replica ran every sweep. Notification dedupe is check-then-insert, so two replicas racing could raise duplicates, and the webhook queue read the same pending rows on each replica, sending every webhook twice | Duplicate reminders and duplicate webhooks as soon as a second replica runs | **Fixed**: each pass runs under a Postgres advisory lock (`lib/leaderLock.ts`), so exactly one replica sweeps and the lock is released even if that replica dies. Moving the scheduler to its own service (4.2 step 3) is still open |
| 9 | Hybrid mock/real client | `MockApiClient` is both the demo and a production path; production modules (`org/people.ts`, `org/departments.ts`, `AttendanceRunner`, `InspectionRunner`) import demo fixtures directly as their no-API fallback | ~4k lines of fixtures ship in every production bundle (main chunk 404 KB / 115 KB gz). The fallbacks filter by the demo's company ids, so they don't show demo data to a real tenant, but every feature carries two code paths to maintain | Open: see 4.3 |
| 10 | Route try/catch | 290 hand-written `try { … } catch (e) { next(e) }` blocks (Express 4 doesn't forward async rejections) | Noise; a forgotten wrapper hangs the request | Open: see 4.1 |
| 11 | Board action counts | `board()` counts overdue actions company-wide, while `stats()` narrows them to the owner for employees and supervisors | An employee's board shows a company-wide overdue count | Open: needs a product decision, not a refactor |
| 12 | Rate-limit hot row | All users behind one NAT share one `RateLimit` row, updated on every request | Row-lock contention at scale | Acceptable for pilot; move to Redis when running more than one replica |
| 13 | Legacy `safeops/` | Superseded prototype in the tree | Confuses newcomers and search results | Recommend deleting (owner's call) |

## 4. Refactoring strategies (next steps, in order)

### 4.1 Async route wrapper (low risk, mechanical)

Add `asyncRoute(fn)` that forwards rejections to `next`, then convert one router per PR.
Better still, move to Express 5, which forwards rejected promises natively. Its breaking
changes (path syntax, `req.query` getter) are small in this codebase because every route
already validates with Zod.

```ts
export const asyncRoute =
  <R extends Request>(fn: (req: R, res: Response) => Promise<unknown>) =>
  (req: R, res: Response, next: NextFunction) => { fn(req, res).catch(next) }
```

### 4.2 Scheduler out of the web process

1. ~~Guard each pass with a Postgres advisory lock.~~ **Done**: `withLeaderLock` takes
   `pg_try_advisory_xact_lock` in a holding transaction. The replica that gets it runs the
   pass, and the others skip that tick.
2. Make notification dedupe atomic: a partial unique index on `(companyId, href)` for
   scheduler-raised kinds, with inserts using `ON CONFLICT DO NOTHING`. Existing duplicate
   rows must be cleaned up in the migration first.
3. Later, run the scheduler as its own compose service from the same image, so API
   replicas scale on traffic and the sweeper scales on data.

### 4.3 Retire `MockApiClient`

The per-module API files are the architecture; `client.ts` is the leftover scaffolding.

1. Move each remaining `SERVER_*`-gated method's callers straight to its `*Api.ts` file.
2. Give `people.ts`, `departments.ts` and the two runners their data from the API instead
   of from `api/mock/fixtures`.
3. Keep the demo as a separate build entry (`VITE_DEMO=1`) that swaps in the mock modules
   through a Vite alias, so production bundles contain no fixtures at all.

### 4.4 Service decomposition

The largest services (`adminService` 1.7k lines, `reportService` 1.6k,
`orgAdminService` 1.4k, `incidentService` 1.4k) mix authorisation, querying and
presentation. Split each along the seams the files already have: `*Queries` (Prisma
`where` builders and scoping), `*Service` (rules and writes), `*Presenter` (response
shaping). Do it when the module next needs a feature, not as a standalone rewrite.

### 4.5 Remaining bulk loads

The other capped `findMany` calls (`take: 1000–5000` in the report builders and the
scheduler sweeps) are correct by design: a report or reminder pass needs the rows, not
counts. They should page with a cursor instead of a fixed cap once any tenant nears the
cap. `scheduler.ts` already orders them most-urgent-first, so a cap degrades gracefully.

## 5. What was verified

- API: the full suite (unit tests plus integration tests against real PostgreSQL) and
  `tsc`.
- A new test covers the board's whitespace merge and blank handling.
- A new guard test fails if any service error stops extending `DomainError`.
- Migrations were rebuilt from scratch into an empty database; `prisma migrate diff`
  between the schema and the database reports no difference.
- Web: `tsc -b --force` and the full vitest suite.
