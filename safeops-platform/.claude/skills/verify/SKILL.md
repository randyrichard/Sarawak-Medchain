---
name: verify
description: Build, run and drive SafeChain (api + web) to observe a change at runtime. Use when verifying a diff rather than running its tests.
---

# Verifying SafeChain at runtime

Two surfaces: the **HTTP API** and the **operator GUI**. Most changes need the API;
anything a user clicks needs both.

## Two stacks, and they are not interchangeable

| | web | api | database |
|---|---|---|---|
| **dev** | 5181 (Vite) | 4000 | embedded Postgres on **5433** |
| **prod** (Docker) | 8080 | 4001 | `safeops_pgdata` volume |

They have **separate databases and separate upload volumes**. Row and file counts
differ between them; that is data, not a regression.

**Drive dev for anything needing a login.** The prod database holds the owner's real
accounts, whose passwords you do not have and must not reset. Dev has seeded demo
accounts with a password committed to the repo (`docs/INSTALL.md`).

Seeded logins — all share `SafeOpsPlatform2026`:

```
admin@demo.safeops.app       admin        (companies: big, kcs)
hse@demo.safeops.app         hse_manager  (big)
officer@demo.safeops.app     safety_officer
supervisor@demo.safeops.app  supervisor
ceo@demo.safeops.app         ceo
```

Companies: `big` (Borneo Industrial Group, ~520 incidents, 9 permits, 19 uploaded
files) and `kcs` (Kenyalang Construction, small — good for empty-state checks).

## Getting a handle

```bash
cd safeops-platform/api && npm run db:start          # embedded Postgres on 5433
cd safeops-platform/api && npx prisma migrate deploy # only if the branch adds one
cd safeops-platform/api && PORT=4000 npx tsx src/server.ts   # background it
```

Apply migrations before starting the API if the branch under verification adds one, or
every query against the new column fails and it reads as a broken feature rather than an
unmigrated database.

Then the web separately, via the `safeops-web-only` launch config (port 5181).

**Do not use the combined `safeops` launch config with a preview tool that injects
`PORT`.** The orchestrator passes the environment down and the API binds to the web
port, so the API answers on 5181 and the web never starts. Symptom: the page is blank
and `/` returns 404 JSON. Start the two separately instead.

`web/.env.local` must contain `VITE_API_BASE_URL=http://localhost:4000`. Without it
the app runs the in-browser mock, and server-gated UI (anything behind
`isBackendConfigured()`) is hidden — which looks exactly like a missing feature.

## Gotchas that cost time

- **Vite binds IPv6 only.** A TCP probe to `127.0.0.1:5181` reports closed while the
  server is running fine. Probe `localhost` or `::1`. The API logs client IP as `::1`
  for the same reason.
- **`navigate` to a deep path can land elsewhere.** Confirm with
  `javascript_tool: location.href` before reading the page; a stale read of the wrong
  screen looks like a missing element.
- **Cached refs go stale when the pane resizes.** A `left_click` by ref can land on
  nothing. If a click produces no request, re-`read_page` or click the element
  directly:
  `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === '…').click()`
- **Flash messages clear after ~5s.** Poll for them inside one `javascript_tool` call;
  checking after a separate tool round-trip will miss them.
- **Provisioned admins carry `mustChangePassword`.** `requireAuth` returns
  403 `password_change_required` on *every* route until it is cleared. If a fresh
  account 403s everywhere, that is why — not the authorization under test.

## Refusals that are correct, and look like bugs

Each of these was a real vulnerability. Do not "fix" one back.

- **A 403 inside the caller's own tenant is usually right.** Scope is per row, not just
  per company: an `employee` sees only incidents they reported, a `supervisor` only their
  assigned sites. So `GET /incidents/:id/people` and `/investigation` answering 403 to an
  employee is the control working — those rows carry injury type, body part and treatment.
- **Search returns fewer hits for lower roles.** It applies the same row scope as the
  register, so an employee legitimately finds nothing where an admin finds hits.
- **`daysToMedicalExpiry` is `null` for non-medical roles**, alongside `medicalExpiry`.
  It is an exact day count, so returning it would hand back the date being withheld.
  `medicalStatus` stays visible for everyone — that one is deliberate.
- **Medical notifications are invisible below HSE manager.** They carry a named
  employee's expiry date; `recipientRole: 'medical'` gates them. Untagged notifications
  are still broadcast to everyone — if *nobody* sees a notification, that is the bug.
- **An invitation for an address that already has an account returns no token**, and
  accepting it does not set a password. That path was a cross-tenant account takeover.
  To drive acceptance in a test, re-stamp `tokenHash` yourself — see `tokenFor` in
  `orgAdminService.integration.test.ts`.

## Driving the API

```bash
TOK=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.safeops.app","password":"SafeOpsPlatform2026"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).accessToken))")

curl -s -D headers.txt -o out.bin -w '%{http_code} %{size_download}\n' \
  -H "Authorization: Bearer $TOK" 'http://localhost:4000/<route>?companyId=big'
```

Probes worth running against any tenant-scoped route: no token, garbage token, a
lower role, a company the caller is not in, missing/empty/repeated `companyId`,
a nonexistent company, and the wrong HTTP method.

## Checking an exported archive

`Expand-Archive` (PowerShell) is a genuinely independent zip implementation — if it
opens the file, the archive is well-formed.

Do **not** count CSV records with `wc -l` or `Measure-Object -Line`. Quoted fields
contain newlines, so physical lines exceed records; parse properly (RFC 4180) before
comparing against a database count. On the demo tenant `incidents.csv` has 525
physical lines and exactly 520 records — that gap is the escaping working, not a bug.

Every register carries a header, including one that has never been used: columns come
from Prisma's datamodel, not from the first row. A **BOM-only, 3-byte CSV is now a
regression**, not the expected empty state. It was the expected state before `23e6c78`,
so treat an older note saying otherwise as out of date.

## Verdict discipline

Runtime observation only. `npm test` and `tsc --noEmit` are CI's job and are not
evidence that a change works.
