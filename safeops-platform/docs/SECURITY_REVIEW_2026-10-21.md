# Security review — 21 October 2026

Phase 1 only: **inspection, no changes made.** Reviewed against the working tree at
`c22a7ed`/`adb35cb` on `safechain-production`, with the production Docker stack running
locally for live checks.

Every claim below names the file it came from. Where something was not checked, it says so.

---

## 0. A scope correction that changes what this review can mean

The URL given for audit — `https://safechain.schain.workers.dev` — **has no backend.** It is
built by `web/scripts/build-demo.mjs` with:

```
VITE_API_BASE_URL: ''
VITE_OFFLINE_DEMO: 'true'
```

There is no API, no database and no customer record behind it. Its "data" is generated in
the visitor's browser and dies with the tab. It therefore **cannot be audited for
authentication, tenant isolation or data protection, because it has none of those things** —
there is no tenancy to isolate.

This matters in both directions:

- Nothing found by probing that URL would say anything about the product's security.
- Equally, nothing found there is a customer-data risk.

The real surface is the Express + Prisma API against PostgreSQL, deployed as the Docker
stack (`docker-compose.prod.yml`). That is what this review inspects.

---

## 1. What was verified, with evidence

### 1.1 Authentication — sound

| Property | Evidence |
|---|---|
| Access tokens are RS256-signed | `api/src/lib/tokens.ts:37` |
| Algorithm pinned on verify | `tokens.ts:54` — `algorithms: ['RS256']` |
| Issuer and audience checked | `tokens.ts:55-56` |
| Refresh tokens are opaque, not JWTs | `tokens.ts:67` — revocable by design |
| Refresh tokens hashed at rest | `tokens.ts:73` — a DB dump yields no usable session |

The algorithm pin is the defence against the `alg:none` / HS256-with-the-public-key
confusion attack, and the file says so.

**Supersedes an earlier note of mine** that an unsigned token was a residual gap. It is not;
tokens are asymmetrically signed and verified.

### 1.2 Identity is never taken from the client — sound

`api/src/http/caller.ts` builds the caller **only** from `req.auth`, which only
`requireAuth` sets, and only from a signature this service produced. Not from the body, the
query, or any client-chosen header.

Every router repeats the same line: *"Identity always comes from the verified token, never
from the request body."*

### 1.3 Every route is gated — verified exhaustively

All 28 routers carry a gate: 26 use `requireAuth`, `v1.ts` uses `requireApiKey`, and the
invitation router is deliberately unauthenticated (below).

`routes/equipment.ts` looked ungated to a naive grep and is not: it is mounted at `/` so
its paths can outrank `/assets/:id`, and a blanket `.use()` there would have put a login
wall in front of `/auth/login` itself. It attaches `auth` per route instead — **checked all
19 routes, all gated.**

### 1.4 Forged organisation and site identifiers — handled

`companyId` *is* accepted as a parameter, and is then authorised server-side:

```ts
// api/src/domain/caller.ts
const m = caller.roles.find((r) => r.companyId === companyId)
if (!m) throw new Err('forbidden', 'You do not have access to this workspace.', 403)
```

A browser that rewrites `companyId` gets a 403, because the comparison is against
memberships carried in the **signed token**, not against anything the request supplied.
Already covered by tests, e.g. *"answers 404, not 403, for a project belonging to another
company"* and *"changes site assignment and refuses sites from elsewhere"*.

### 1.5 Database-level tenant isolation — present and tested

Migration `20261002090000_row_level_security` installs `tenant_isolation` policies using
`safeops_tenant_visible(companyId)`, which admits a row only if its company is one the
session named or the session is declared system work.

**Coverage measured: 39 of the 43 models carrying `companyId` have a policy.**

The service connects as a restricted login (`APP_DB_ROLE`), and
`lib/rowLevelSecurity.integration.test.ts` proves against real Postgres that queries naming
another company's rows return nothing and change nothing — and that the login is not a
superuser and cannot run DDL.

### 1.6 The RLS bypass — three places, each independently authorised

`runAsSystem` sets `safeops.bypass_rls`. It appears in exactly three production paths:

| Where | Independent authority |
|---|---|
| `routes/platform.ts:33` | Every handler re-checks `platformAdmin` **against the database**, not the token (`provisioningService.ts:87-98`), including `status === 'active'` |
| `routes/orgAdmin.ts:222` | Invitation redemption: single-use, time-limited, workspace-bound token is the authority; the invitee has no session yet |
| `server.ts:33` | Scheduler; notifications are raised per company with a per-company budget |

The ordering is correct in each case — `requireAuth` precedes the bypass on the platform
router, and the staff check is in the service beneath every handler.

### 1.7 File access — IDOR-resistant

`routes/permitAttachments.ts` download handler:

- re-reads the attachment and joins to its permit's `companyId`;
- refuses with 403 unless the caller is a member of that company;
- `Content-Disposition: attachment` — *"a PDF rendered in-origin can script"*;
- `X-Content-Type-Options: nosniff`;
- stored filenames are `randomUUID()` + a type-derived extension, so object keys are not
  guessable.

Upload validation exists separately (`lib/uploadSafety.ts`, `lib/fileIntegrity.ts`),
including a check that the bytes match the declared type — tested by *"corrects a genuine
file declared as another accepted type, and refuses one that is none of them"*.

### 1.8 Transport and abuse protections — present

`api/src/app.ts`: `helmet()`, `cors({ origin: env.corsOrigins, credentials: true })` (an
explicit allowlist, not a wildcard), `express.json({ limit: '100kb' })`, `trust proxy` set
from configuration, global rate limiting plus a separate ceiling for `/v1` API-key traffic,
backed by a Postgres store so limits survive a restart.

### 1.9 Existing test coverage

The API suite is **1,645 passing of 1,648**. The three failures are environmental and
pre-existing — two `loginLimit` tests that fire 300 parallel fetches at localhost and hit
Windows ephemeral-port exhaustion, and a worker-lifecycle timeout. I confirmed these fail
identically at `3cc52ce`, before any of this session's work.

Against the ten scenarios requested, these already exist in some form: unauthenticated
access, cross-tenant read by id, cross-tenant site assignment, privilege escalation into
the platform console, invitation replay, MFA binding, and tenant-scoped export.

---

## 2. Findings

No critical or high-severity vulnerability was found in the areas inspected. What follows
are residual risks and configuration gaps, ranked.

### F0 — Cross-tenant file download returned 500, not a refusal (Low severity, **fixed**)

Found by the new regression test, not by reading the code — and only because the test was
mutation-checked rather than trusted for passing.

`PermitAttachment` and `AssetDocument` carry no `companyId`, so RLS does not filter them.
Their parents (`Permit`, `Asset`) are filtered, and the relation is declared **required**.
Fetching a child belonging to another tenant with `include: { permit: ... }` therefore made
Prisma throw inside the query —

> `Inconsistent query result: Field permit is required to return data, got null instead.`

— and the request answered **500** instead of a refusal.

**No data leaked.** No bytes were served and the caller got nothing. The problem is the
failure mode: an unhandled error on an authorisation path pages somebody, buries real
faults, and gives an attacker probing ids a noisier signal than a 404.

**Fixed** in `routes/permitAttachments.ts` and `routes/assetDocuments.ts`: the parent is
fetched in a second query, itself subject to RLS, so another tenant's parent simply is not
there and the answer is a clean 404. The membership check is kept as the backstop for the
case the database cannot see.

**Worth noting for the record:** disabling the application's membership check entirely did
**not** change the outcome — RLS had already refused. That is defence-in-depth working in
the right order, and it is also why an HTTP test cannot, by itself, prove the
application-layer check still works. See the limitation noted in F1.

### F1 — Four tenant tables are outside RLS (Medium, accepted-by-design)

`Membership`, `Invitation`, `ApiKey`, `SecurityPolicy` carry `companyId` but have no policy.
The migration header states why: they are read while signing in, redeeming an invitation or
checking an API key — *before* the caller's company is known, so a policy would deadlock the
very paths that establish identity.

They are guarded by application checks alone. That is defensible, and it is the one place
where a future application-layer mistake would have no database backstop.

**Recommendation:** leave the design as is; add a focused regression test asserting that
each of the four is only ever reached through a path that has already authorised the caller.
Do not add policies to them without redesigning sign-in.

### F2 — MFA is unavailable in the production configuration (Medium, config)

`MFA_SECRET_KEY_B64` is empty in `.env.prod`. The API logs
*"multi-factor sign-in unavailable: MFA_SECRET_KEY_B64 is not set"* and the feature degrades
silently from the operator's point of view. For a pilot holding real company data, MFA
should be available before the first real account exists.

**Fix:** `npm run keygen` and set it. Infrastructure change, not code.

### F3 — Metrics endpoint unprotected (Low, config)

`METRICS_TOKEN` is empty. Confirm what `/metrics` exposes without it before the stack is
reachable from anywhere but localhost.

### F4 — Invitation and reset links are dead in the current config (Medium, config)

The API refuses at runtime with:

> `LINKS ARE DEAD: APP_PUBLIC_URL is https://app.safeops-pilot.my, which is not in CORS_ORIGINS (http://localhost:8080).`

Every invitation and password-reset link would open a page whose API calls the browser
blocks. This is the product catching its own misconfiguration — good — but it must be
resolved before anyone is invited.

### F5 — Deployment configuration is incomplete (Medium, config)

Four `REPLACE_ME` placeholders remain (`SAFEOPS_APP_DOMAIN`, `SAFEOPS_API_DOMAIN`,
`ACME_EMAIL`, `COOKIE_DOMAIN`). `deploy/preflight.sh` refuses to deploy while they are
there, and separately verifies that DNS resolves to the host it runs on. There is currently
**no pilot server**.

### F6 — `APP_DB_PASSWORD` was empty (Fixed during this review, config)

The API crash-looped on `APP_DB_PASSWORD must be 16-128 letters, digits or _-.~+=`. A
compliant value was generated into `.env.prod`, which is untracked — no secret is in git.
Worth knowing: a `openssl rand -base64` password containing `/` would also be rejected.

### F7 — The public demo ships demo account addresses (Informational)

`npm run verify:bundle` flags `ceo@demo.safeops.app` and `admin@demo.safeops.app` in the
demo bundle. This is intended — the public demo offers role shortcuts — and the demo uses
its own password, not the seed password. Production refuses the seed demo password outright
(`ALLOW_DEMO_ACCOUNTS=false`, plus the published-password refusal in `lib/demoAccounts.ts`).

The gate is for the **production** build, which passes clean. Worth noting only so nobody
later reads that failure as a leak.

---

## 3. What was NOT verified

Stated plainly, because a review that does not say this is not worth much:

- **No active penetration testing was performed.** No authenticated cross-tenant probe was
  executed against a running instance during this review beyond the existing automated
  suite.
- **Not all ~294 routes were read individually.** Gating was verified exhaustively; the
  authorisation logic inside each handler was sampled, not exhaustively read.
- **No review of the frontend for sensitive data in client state**, beyond confirming that
  the API is the enforcement point.
- **No dependency vulnerability audit** was run in this review.
- **Backup restore was not exercised.** `npm run db:verify` exists
  (`cli/verifyRestore.ts`); it was not run.
- **No log review for leaked record content.** `logRedaction.test.ts` exists; its coverage
  was not assessed.

---

## 4. Proposed remediation plan — smallest safe set

Ordered. Nothing here is a rewrite, and none of it changes the interface.

**Before any real data (blocking for pilot):**

1. F2 — generate and set `MFA_SECRET_KEY_B64`. *(config)*
2. F4/F5 — settle the domain, fill the four placeholders, align `CORS_ORIGINS` with
   `APP_PUBLIC_URL`. *(config)*
3. Provision the pilot host; run `deploy/preflight.sh` and fix whatever it names. *(infra)*
4. F3 — set `METRICS_TOKEN`, or confirm `/metrics` is not externally reachable. *(config)*

**Code changes (small, reviewable, each with a regression test):**

5. F1 — add a regression test asserting the four un-policied tables are only reachable
   behind an authorising path. *(~1 test file, no production code change)*
6. ~~Cross-tenant file download and export tests~~ — **done, with a correction.** The
   cross-tenant *export* case was already covered (`tenantExport.integration.test.ts`:
   *"refuses an administrator of a different company"*, *"contains no row from another
   workspace"*, *"scopes child tables through their parent, not by company alone"*); my
   earlier claim that it was missing was wrong. The cross-tenant *download* case genuinely
   was missing and is now in `securityHardening.integration.test.ts`, where it immediately
   found F0.

**Operational, before pilot:**

7. Run `npm run db:verify` to prove a backup actually restores.
8. Run a dependency audit and triage.
9. Write the incident-response and data-subject-request procedure.

I recommend doing 1–4 first, since none of them is code and all of them block a pilot, and
holding 5–6 until you have said the plan is right.

---

## 5. Pilot-readiness checklist

| Area | State |
|---|---|
| Authentication | **Ready** — RS256, pinned, revocable refresh |
| Authorisation / RBAC | **Ready** — server-side, least privilege, DB-checked platform flag |
| Tenant isolation (app) | **Ready** — membership checked on every workspace-scoped call |
| Tenant isolation (database) | **Ready** — RLS on 39/43, restricted login, tested |
| IDOR on files | **Ready** — membership re-checked, unguessable keys |
| Transport / abuse | **Ready** — helmet, CORS allowlist, body cap, rate limits |
| MFA | **Blocked** — F2 |
| Invitation / reset links | **Blocked** — F4 |
| Deployment config | **Blocked** — F5, no host |
| Backup restore proven | **Not done** — never exercised |
| Dependency audit | **Not done** |
| Incident response / PDPA procedure | **Not done** — `docs/PERSONAL_DATA_PROTECTION_NOTICE.md` exists; the operational procedure does not |

---

## 6. Deployment and rollback

Already implemented and documented; not re-verified in this review beyond reading:

- `deploy/preflight.sh` — refuses on placeholders, missing secrets, DNS mismatch
- `deploy/deployment.sh` — backup → build → migrate → start → smoke test, and refuses to
  declare success until the API reports ready
- `deploy/rollback.sh` — returns `:local` to the image digest recorded before the deploy
- `deploy/backup.sh` / `restore.sh`, with a backup container already running in the stack
