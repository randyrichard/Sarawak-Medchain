# SafeOps API: structure and dependency rules

How `api/src` is organised, which way dependencies may point, and what comes next.
The rules are enforced by `api/src/architecture.test.ts`, so they don't depend on anyone
remembering them.

## Folder structure

```
api/src/
├── app.ts            composition root: Express app, middleware order, routers, error handler
├── server.ts         process entry: listen, scheduler start, graceful shutdown
├── env.ts            validated environment (refuses to start on a bad config)
│
├── domain/           innermost. Pure rules; imports nothing else in src/
│   ├── caller.ts     Caller (who is asking), Membership, membershipOf()
│   ├── errors.ts     DomainError: the base every service refusal extends
│   └── access.ts     row-level access policy: incidentScopeWhere, actionScopeWhere,
│                     ownedByWhere / isOwnedBy, overdueActionWhere, startOfToday
│
├── lib/              services and infrastructure. May import domain/
│   ├── *Service.ts   one per module: business rules, role checks, Prisma queries
│   ├── *Catalog.ts   labels, enums and classifiers per module
│   ├── scheduler.ts  reminder sweeps, report runs, webhook queue
│   ├── leaderLock.ts one-replica-at-a-time guard for background work
│   ├── email/        mail providers (Resend, SMTP)
│   └── …             PDFs, tokens, rate-limit store, secret box, webhooks
│
├── http/             Express-specific concerns. May import domain/ and lib/
│   ├── requireAuth.ts    bearer token → req.auth; forced password change
│   ├── requireApiKey.ts  integration API keys
│   ├── caller.ts         callerOf(req): the Caller from a verified token
│   └── asyncRoute.ts     async handler → rejections reach the error handler
│
├── routes/           outermost. One router per module: parse with Zod, call a
│                     service, answer. May import everything above
├── cli/              operator commands (seed, create-admin, verify-evidence…)
└── test/             shared test helpers
```

## Dependency rule

```
routes/  ──▶  http/  ──▶  lib/  ──▶  domain/
```

- Arrows point inwards only.
- `domain/` knows nothing about Express, services or routes.
- `lib/` knows nothing about HTTP.
- A new import that points outwards fails `architecture.test.ts`. The test recognises every
  import form: `from '…'`, a bare `import '…'`, and `import('…')`.

Why this matters here:
- **Identity:** `Caller` used to live in `incidentService.ts`. Every one of 34 files had to
  depend on the incident module just to know who was asking.
- **Access policy:** it lived there too. The dashboard, search, the site comparison and the
  reports need exactly the same rules as the register. Having them in one domain module,
  owned by none of those consumers, is what keeps a wider count on one screen from leaking
  what the list one click away hides.

## Request lifecycle

```
Caddy (TLS, proxy secret)
  → app.ts: proxy-secret check → helmet → CORS → JSON(100 kB) → request log
            → global rate limit
  → routes/<module>.ts
        router.use(requireAuth)                            http/requireAuth.ts
        router.get(path, asyncRoute(async (req, res) => {  http/asyncRoute.ts
          const input = schema.safeParse(req.query)        Zod at the edge
          res.json(await svc.method(callerOf(req), input)) http/caller.ts
        }))
  → lib/<module>Service.ts
        membershipOf(caller, companyId, ModuleError)       domain/caller.ts
        where = { ...scope(caller) }                       domain/access.ts
        Prisma query → shape response
  → errors: any DomainError → { error: code, message } at its status   app.ts
```

## What changed in this refactor (behaviour preserved)

| Before | After |
|---|---|
| `Caller` defined in `incidentService.ts`; 34 files imported the incident module | `domain/caller.ts`; 13 files still import the incident service, all because they use it |
| The same `membership()` body copied into 20 services | One `membershipOf()`; each service keeps its own error class, so refusals still name their module |
| Access policy spread across `incidentService.ts` and `actionOwner.ts`, with docblocks attached to the wrong functions | `domain/access.ts`, each rule with its own explanation |
| `DomainError` in `lib/` | `domain/errors.ts`; its guard test still scans every service in `lib/` |
| `middleware/` holding three unrelated Express helpers | `http/`, alongside `asyncRoute` |
| 287 handlers wrapped in hand-written `try { … } catch (e) { next(e) }` | 284 use `asyncRoute`. 3 keep their own `try` because their `catch` does real work (`admin.ts` tenant export, `auth.ts` refresh and forgot-password) |
| Nothing stopped a service from importing a router | `architecture.test.ts` fails on any outward import |

## Next slices

Do these one at a time, each as its own pull request, each proven by the existing suite.

1. **Retire `MockApiClient`** (web). The per-module `*Api.ts` files are the real client.
   - Move the remaining `SERVER_*`-gated callers to them.
   - Keep the offline demo as a separate build entry.
   - The demo stores already load lazily (`mock/demo.ts`).
2. **Split the four largest services** (`adminService`, `reportService`, `orgAdminService`,
   `incidentService`, each 1.4k–1.7k lines) along the seams they already have:
   - queries and scoping;
   - rules and writes;
   - response shaping.

   Do it when a module next needs a feature, not as a standalone rewrite.
3. **Move the scheduler to its own process** (same image, a second compose service), so API
   replicas scale on traffic and sweeps scale on data. `leaderLock` already makes more than
   one instance safe.
4. **Express 5**, which forwards rejected promises natively. After that, `asyncRoute` can go.
