# SafeOps security audit

A security-engineering review of `safeops-platform/` (API, web app, deploy tooling),
September 2026, against `feature/permit-to-work`. Findings are ranked by what an attacker
could actually do with them. Anything marked **Fixed** has a regression test that fails on
the old code and passes on the new one.

## 1. Method

- **Code review** of authentication (`authService`, `tokens`, `requireAuth`, cookies),
  password reset, invitations, API keys, the platform console, uploads, webhooks (SSRF),
  exports and emails (injection), security headers and CSP, and the compose/Caddy setup.
- **Automated cross-tenant probe.** An admin of a new, empty workspace called every one of
  the 294 API routes, with every path parameter filled in with real record IDs from other
  tenants (66 IDs across 74 tables) and `companyId` pointed at the victim tenant. That was
  11,149 requests. **None returned another tenant's data or changed it.** Every 2xx was a
  static catalogue or the caller's own record.
- **Automated role probe.** An `employee` of the victim tenant called every `/admin`,
  `/platform` and `DELETE` route with that tenant's own IDs (2,874 requests). It found one
  gap (D-1 below).
- **Limits of the probe.**
  - Tables that were empty in the test data (visitors, contractors, training, webhooks,
    projects) were covered by their existing per-service cross-tenant integration tests,
    not by the probe.
  - Mutating routes were probed with an empty body.

## 2. Findings fixed in this change

| ID | Severity | Finding | Fix |
|---|---|---|---|
| SA-1 | **High** | Suspending a company didn't suspend its users | Suspended workspaces are left out of session tokens |
| SA-2 | **Medium** | Uploads were stored without checking their content, and served under the uploader's filename | Type settled from the file's bytes; the download extension must match it |
| SA-3 | **Medium** | Refused uploads stayed on disk | Files are deleted on every failure path |
| SA-4 | **Medium** | Two simultaneous refreshes of one token both succeeded | Conditional consume; the loser is treated as a replay |
| SA-5 | Low | The SSRF guard misread IPv6 forms that embed IPv4 | A real IPv6 parser |
| SA-6 | Info | An unused `requireRole` middleware failed open | Removed |

### SA-1: suspended customers kept full access (High)

**What was wrong.**
- `Company.status = 'suspended'` is documented as "whether the customer may use the product
  at all".
- The platform console sets it, and `apiKeyAuth.ts` honours it for API keys.
- Session tokens, however, were minted from every membership regardless of company status.

**Attack scenario.** A customer is suspended for non-payment, for breaching the terms, or
because their tenant is compromised. The operator sees "Suspended" in the console. Every
user of that customer can still:
- sign in and refresh;
- read incidents;
- export the whole tenant;
- keep working indefinitely.

**Fix.** `AuthService.sessionRoles`:
- Memberships in suspended workspaces are left out of the access token at sign-in and at
  every refresh. Every service authorises against those token roles, so the workspace is
  closed everywhere within one access-token lifetime (15 minutes).
- Someone whose only workspaces are suspended gets a clear `403 workspace_suspended`, but
  only after their password has been verified, so the check leaks nothing.
- Members of other, active workspaces keep those workspaces.

**Tests:**
- `authService.test.ts` › "suspended workspaces"
- `securityHardening.integration.test.ts` › "suspended workspace"

### SA-2: uploaded content wasn't verified, and was served under the uploader's name (Medium)

**What was wrong.**
- All three upload routes (incident evidence, permit documents, equipment files) accepted
  a file if its **declared** type (the multipart `Content-Type`, chosen by the client) was
  on the allow-list.
- Downloads were served as `attachment; filename="<original name>"`.

**Attack scenario.**
1. Any signed-in employee uploads `Toolbox-register.exe`, declared as `application/pdf`,
   to a permit.
2. The supervisor clicks it and the browser saves `Toolbox-register.exe`, delivered from
   the company's own safety system.

**Fix.** A new module, `lib/uploadSafety.ts`, shared by all three routes:
- `settleUploadTypes` checks each file's leading bytes (JPEG/PNG/WebP/HEIC/PDF).
  - If the bytes match none of the accepted types, the upload is refused and deleted.
  - If the file is a genuine accepted type other than the one declared (a PNG screenshot
    named `.jpg`), it is accepted and recorded as what it really is, so field users aren't
    blocked.
- `attachmentDisposition` strips path and control characters and forces the extension to
  match the verified type (`Invoice.exe` → `Invoice.exe.pdf`). It sends both an ASCII name
  and an RFC 5987 UTF-8 name, which also fixes non-ASCII names and spaces arriving as
  `%20`.
- Files uploaded before this change are protected by the download fix.

**Tests:** `uploadSafety.test.ts` and the integration test.

### SA-3: refused uploads stayed on disk (Medium, availability)

**What was wrong.** Multer writes each file to disk before the route checks anything. When
the check then failed, nothing removed the file. Failing checks included:
- an unknown record;
- another tenant's record;
- a closed permit;
- a role that isn't allowed to write.

**Attack scenario.** Any account on any tenant repeatedly posts 5 × 10 MB to
`/incidents/<anything>/attachments`. The global limit (3,000 requests per minute per IP)
permits roughly 150 GB per minute of orphaned files. They land on the volume that holds
every customer's evidence, and on a single-host deployment usually on the same disk as
Postgres.

**Fix.** Every failure path deletes the files that request wrote. The incident route
deletes only the files no row points at, because it saves them one at a time.

**Test:** the integration test covers an outsider, an unknown record and a non-write role
on all three routes, and asserts that the upload directory is unchanged.

### SA-4: concurrent refreshes bypassed reuse detection (Medium)

**What was wrong.** `refresh()` read the token, checked `revokedAt`, and only then rotated
it. Two requests presenting the same token at the same moment both passed the check and
both minted a successor. Reuse detection only catches a replay that arrives after the first
refresh has committed.

**Attack scenario.** An attacker who has stolen a refresh cookie replays it at the same
moment the victim's tab refreshes. Both get live sessions and no family revocation happens,
so the attacker keeps a silent parallel session for up to 30 days.

**Fix.** The token is consumed with a conditional `updateMany … where revokedAt IS NULL`
inside the transaction, before the successor is created. Only one request can win. The
others are handled exactly like a later replay: the family is revoked.

- **Real clients are unaffected:** the web client already sends one refresh at a time
  (`refreshOnce`).
- **Test:** six parallel refreshes → exactly one succeeds, and no token in the family
  survives. On the old code several succeed.

### SA-5: the SSRF guard misread IPv6 forms that embed IPv4 (Low)

**What was wrong.** `isPrivateV6` matched text prefixes, so these addresses were all judged
public:
- the WHATWG URL parser's hex form of IPv4-mapped addresses (`[::ffff:127.0.0.1]` becomes
  `[::ffff:7f00:1]`);
- NAT64 (`64:ff9b::/96`);
- 6to4 (`2002::/16`);
- Teredo;
- the documentation range.

**Why it wasn't exploitable.** Delivery passes the bracketed hostname to the resolver,
which fails (measured: `ENOTFOUND [::ffff:7f00:1]`). The guard was safe by accident, one
refactor away from an SSRF to the metadata endpoint.

**Fix.** The address is parsed into eight groups. Any form that carries an IPv4 address is
judged by that address. Malformed input is refused.

**Tests:** additional cases in `webhookTarget.test.ts`.

### SA-6: fail-open dead code (Info)

**What was wrong.** `requireRole()` in `http/requireAuth.ts` was unused. When no
`companyId` was present, it accepted the caller's role in *any* company. It was a trap for
the next person to wire it up.

**Fix.** Removed.

## 3. Open findings that need an owner's decision

These change product behaviour, so they were not changed unilaterally.

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| D-0 | **High** | **MFA was a label, not a control.** "Enable MFA", "Require multi-factor authentication" and the MFA adoption score all existed, but sign-in never asked for a second factor. | **Resolved, see section 3a.** |
| D-1 | Medium | **Permit safety steps were open to every member,** including `employee` and the read-only `ceo`. Found by the role probe: an employee removing a named person from a permit got `204`. | **Resolved for the steps that decide who may be in the work, see section 3a.** Precautions, extensions and site restriction remain open, as described there. |
| D-2 | Low | Access tokens stay valid for up to 15 minutes after a user is deactivated, loses a role, or has their workspace suspended (stateless JWT). | Acceptable for most tenants. If immediate cut-off matters, check a per-user `tokenVersion` in `requireAuth` (one indexed read per request), or shorten `ACCESS_TOKEN_TTL_MIN`. |
| D-3 | Low | Anyone who knows an address can lock that account with five wrong passwords. The per-IP login limit (20 per 15 minutes) caps this at about 4 accounts per IP per window. | Switch to progressive delay per account plus IP instead of a hard lock, or add a CAPTCHA after N failures. |
| D-4 | Low | Inviting someone who already has an account adds the membership immediately, without their consent. The invite form's error also reveals whether an address belongs to a SafeOps platform administrator. | Create the membership on acceptance. Return the generic "cannot invite this address" message. |
| D-5 | Info | IPv6-literal webhook URLs never deliver, because of the bracketed hostname (see SA-5). | Strip the brackets before `https.request`. That is safe now that the guard parses IPv6 correctly. |
| D-7 | **Medium** | **The rest of the Authentication Policy page is also unenforced.** Lockout threshold, session timeout ("Applies to your next sign-in"), minimum password length, the uppercase/number/symbol rules and password expiry are saved and shown, but nothing reads them. The server uses its own fixed settings (`MAX_FAILED_LOGINS`, `REFRESH_TOKEN_TTL_DAYS`, `validatePasswordStrength`). Found while building MFA. | Enforce each setting where its fixed counterpart is used today, or mark it "not yet enforced" on the page. Same reasoning as D-0. |
| D-6 | Info | `deploy/rollback.sh` tags `safeops-api:rollback`, but compose never uses that tag. Already noted in the worker PR. | Pin the image by digest in the rollback path. |

## 3a. Resolved after the audit

### D-0: real multi-factor sign-in

The scheme is TOTP (RFC 6238), which works with any authenticator app. The code
implementing it was checked against the RFC's published test vectors.

- **Enrolment.** It happens in My account → Security.
  - The person scans a QR code (or types in the key) and confirms with a code.
  - Nothing is switched on until that code is right.
  - They get ten one-time recovery codes, which are shown once and stored only as SHA-256
    digests.
- **Storage.** The secret is sealed with AES-256-GCM under its own key,
  `MFA_SECRET_KEY_B64`.
- **Sign-in.**
  - With MFA on, the password step returns a five-minute challenge (an RS256 token with
    its own audience) instead of a session. Neither the challenge nor the session token
    can stand in for the other.
  - `POST /auth/mfa` then takes a code or a recovery code.
  - Every wrong code counts towards the same account lockout as a wrong password.
  - Each code works once: the last accepted 30-second step is recorded with a conditional
    update. Each recovery code also works once.
- **Policy.** "Require MFA" is enforced in the API. A member of a workspace that requires it
  gets a token marked `mfaSetupRequired`. `requireAuth` then allows only `/auth/me` and the
  setup endpoints, and the web app shows only the setup screen. MFA cannot be turned off
  while it is required. The policy cannot be switched on if the server has no MFA key.
- **Administrators** can no longer "enable" MFA for someone else; only the person holding
  the phone can. They can **reset** it for a lost phone, which is audited and also ends that
  person's sessions.
- **Turning it off** needs the password and a code.
- **Accounts left switched on by the old toggle** were switched off by the migration. They
  never had an authenticator behind them, so leaving them on would have locked those people
  out.

### D-1: permit safety steps

The following steps are now limited to `FIELD_ROLES`: admin, HSE manager, safety officer and
supervisor.
- naming or removing people on a permit;
- recording gas tests;
- placing or releasing isolations.

An employee whom the permit names as its gas tester may still record readings. The web app
hides the controls from roles that cannot use them. A drift test compares the web helpers
with the API's role lists.

These remain open:
- **Confirming precautions and requesting extensions** are still open to every member.
- **Creating a draft permit** is still open to every member, which matches the "applicant"
  workflow.
- **Site restriction** of permits is not yet applied.

## 3b. Second review: RLS, frontend keys, storage rules, model input

A focused check of four areas, done after the fixes above.

| Area | Found | Done |
|---|---|---|
| Row-level security | **Off on all 81 tables.** The service connected as the Postgres superuser, which owns every table and is exempt from any policy. A bug that skipped a company check had nothing behind it, and SQL execution through the app meant control of the database server (`COPY ... TO PROGRAM`). | **Fixed.** See below. |
| API keys on the frontend | **None.** The production bundle was scanned for real key formats: none found, no source maps, no committed `.env`. The browser gets one setting (the API address). The API masks every stored secret. | The bundle check (`npm run verify:bundle`) only looked for the demo password. **It now also fails the build on real key formats** (Stripe-style, Resend, AWS, Google, GitHub, Slack, private keys, signed JWTs, database URLs with passwords, webhook secrets). It was tested by planting four of them. |
| Storage rules | **Mostly sound.** Files are never served directly. Every download re-checks permission, and incident evidence follows the incident's row scope. Types are checked against the bytes, names are random, and every file has a SHA-256 fingerprint. The process runs as non-root. **Gap:** any member, the read-only executive included, could delete documents from a live permit. | **Fixed:** removing a permit document needs the field roles (`requireFieldRole`), and the web hides the button from other roles. Still open: no per-company quota, files and backups unencrypted at rest. |
| Model input is untrusted | **There is no AI model in SafeOps.** No AI library, no outbound call to one. Summaries and reports are built from fields by fixed code. All other input is checked: every write route validates against a schema, emails escape, CSV neutralises formulas, the web inserts no raw HTML. | Nothing to change. If an AI feature is added, follow the rules below. |

### Row-level security, as built

- **A restricted login, `safeops_app`.**
  - Its password is `APP_DB_PASSWORD`.
  - The entrypoint creates or updates it after every migration (`cli/dbAppRole.ts`, `lib/dbRole.ts`).
  - It can read and write rows and use sequences, nothing else. It cannot change the schema or read `_prisma_migrations`, is not a superuser and cannot bypass RLS.
  - The API and worker connect as it. `DATABASE_URL` stays the schema owner and is used only for migrations, backups and operator CLIs.
- **Policies.** Migration `20261002090000_row_level_security` enables RLS on the 35 tables with a `companyId`. A row is visible or writable only if its company is in `safeops.company_ids`, or `safeops.bypass_rls` is `on`.
- **Setting the companies.** `lib/tenantContext.ts` holds the scope for each unit of work:
  - `requireAuth` sets the caller's companies;
  - `requireApiKey` sets the key's company;
  - the scheduler, the worker, the platform console and invitation redemption run as system work.

  `lib/prisma.ts` passes the scope to Postgres as transaction-local settings before every query, including inside both kinds of transaction. Transaction-local means a pooled connection cannot carry one request's scope into another.
- **Fail closed.** No scope means no rows: a forgotten path reads nothing rather than everything.
- **Not covered:**
  - Membership, Invitation, ApiKey and SecurityPolicy are read before the caller's company is known (sign-in, invitation tokens, API keys), so the application alone guards them.
  - Child tables without a `companyId` are reached through a covered parent.
- **Tests:**
  - `rowLevelSecurity.integration.test.ts` connects as the restricted login and proves:
    - queries naming another company's rows get nothing and change nothing;
    - writes into another company are refused;
    - both transaction kinds are scoped;
    - pooled connections do not leak scope;
    - the login cannot run DDL or `COPY ... TO PROGRAM`.
  - The whole suite now runs every HTTP test as the restricted login (`vitest.config.ts`, `src/test/appDbRole.ts`), so a route that fails to set a scope fails its tests.
- **Restore.** `deploy/restore.sh` now restores with `--no-privileges`, so a backup restores onto a fresh server where `safeops_app` does not exist yet. The entrypoint re-grants on start.

### If an AI model is added later

- **Never let the model decide what it may read.** Fetch the data first, with the user's own scope, and pass only that to the model.
- **Treat the user's text, and any record content placed in a prompt, as untrusted data.** A hazard description can contain "ignore your instructions". Keep it in a clearly delimited data section, never in the instructions.
- **Treat the model's output as untrusted input.** Validate it against a schema before acting on it, escape it before rendering, and never execute it or let it choose a tool or record without the same authorisation checks a person would face.
- **Keep the provider key on the server.** `verify:bundle` would fail the build if it reached the frontend.

## 4. Controls verified as sound (no change needed)

- **Tokens.**
  - RS256 access tokens, with algorithm, issuer and audience pinned (no `alg:none` or
    HS/RS confusion).
  - Opaque refresh tokens, stored hashed, in an `httpOnly`, `SameSite=Strict`, `Secure`
    cookie.
  - The access token is held in memory only in the browser.
- **Login.**
  - Enumeration-resistant: one generic message, with equivalent Argon2 work for unknown
    users.
  - Per-IP and per-account throttling.
  - Forgot-password returns an identical response whatever the address.
- **Password reset and invitations.** Tokens are 32 random bytes stored as SHA-256,
  single-use through conditional updates, short-lived, and redacted from request logs.
  Accepting an invitation cannot overwrite an existing user's password.
- **Tenant isolation.** Every probed route refused cross-tenant IDs. Row scope for
  employees and supervisors lives in `domain/access.ts`.
- **Raw SQL.** Only tagged-template `$queryRaw` with parameters. The two `$queryRawUnsafe`
  calls are in CLI tools with constant SQL.
- **XSS.**
  - React escaping throughout.
  - The only `dangerouslySetInnerHTML` renders a locally generated QR SVG.
  - Strict CSP (`script-src 'self'` plus one hash, `object-src 'none'`,
    `frame-ancestors 'none'`).
- **Email and CSV injection.** HTML emails escape every interpolated value, and subjects
  are header-safe. CSV export neutralises formula prefixes.
- **Proxy trust.** `X-Forwarded-For` is honoured only with the proxy's shared secret, so it
  cannot be used to dodge rate limits or forge audit entries.
- **API keys.** Stored hashed, scoped by HTTP method, rate-limited per key, act as the
  non-unmasking `ceo` role, and are refused for suspended companies.
- **Webhooks.** HTTPS only, the resolved address is pinned through a guarded `lookup`, no
  redirects are followed, payloads are HMAC-signed, and there is a timeout.
- **Headers.** HSTS, `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy and
  Permissions-Policy. `x-powered-by` is off. Body size is capped at 100 kB.

## 5. Production recommendations

1. **Set `MFA_SECRET_KEY_B64` and switch on "Require MFA" for administrators' workspaces**
   before go-live. Then resolve D-7, the remaining unenforced policy settings, which a
   customer's security questionnaire will also ask about.
2. **Malware scanning for uploads.** Run ClamAV as a sidecar and scan before the row is
   written. The signature check in SA-2 stops disguised files but not a malicious PDF.
3. **Per-tenant storage quotas** on the uploads volume, and **alerting at 80% disk**.
   Keep uploads and Postgres on separate volumes.
4. **Alert on `reuse_detected` refresh revocations and on `workspace_suspended` sign-in
   attempts.** Both are already written to `LoginAttempt` and `RefreshToken`, so this is a
   query, not new code.
5. **Rotate secrets on a schedule.** This covers `PROXY_TOKEN`, the JWT keypair (the
   design already supports a new keypair; `kid`-based rollover would avoid a forced
   sign-out) and the SMTP/Resend credentials.
6. **Encrypt backups at rest** (`deploy/backup.sh` output) and keep an off-site copy.
7. **Keep `npm audit --audit-level=high` as a CI gate** (it already is) and add Dependabot
   or Renovate so fixes arrive as pull requests.
