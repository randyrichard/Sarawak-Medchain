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
| D-0 | **High** | **MFA is a label, not a control.** Admin → Users has "Enable MFA", Admin → Security has "Require multi-factor authentication for all users" ("New users must enrol in MFA at first sign-in"), and the security score counts MFA adoption. But sign-in never asks for a second factor: `mfaEnabled` is a flag nothing reads. An administrator who "enforces MFA" has password-only accounts. | Either implement TOTP (enrol with QR, verify at login, recovery codes, `mfaRequired` enforced at sign-in), or relabel these controls as "not yet enforced" until then. Misrepresenting a security control is worse than not having it. |
| D-1 | Medium | **Permit safety steps are open to every member.** Any role, including `employee` and the read-only `ceo`, can do the actions listed below, and none of them is limited by a membership's sites. Found by the role probe: an employee removing a named person from a permit got `204`. Issuing, approving, suspending and closing are correctly restricted to issuers. | Restrict people, isolations, gas tests, controls and extensions to the issuer roles plus `supervisor`. Make `ceo` read-only, as `permissions.ts` already describes. Apply membership site restrictions to permits. |
| D-2 | Low | Access tokens stay valid for up to 15 minutes after a user is deactivated, loses a role, or has their workspace suspended (stateless JWT). | Acceptable for most tenants. If immediate cut-off matters, check a per-user `tokenVersion` in `requireAuth` (one indexed read per request), or shorten `ACCESS_TOKEN_TTL_MIN`. |
| D-3 | Low | Anyone who knows an address can lock that account with five wrong passwords. The per-IP login limit (20 per 15 minutes) caps this at about 4 accounts per IP per window. | Switch to progressive delay per account plus IP instead of a hard lock, or add a CAPTCHA after N failures. |
| D-4 | Low | Inviting someone who already has an account adds the membership immediately, without their consent. The invite form's error also reveals whether an address belongs to a SafeOps platform administrator. | Create the membership on acceptance. Return the generic "cannot invite this address" message. |
| D-5 | Info | IPv6-literal webhook URLs never deliver, because of the bracketed hostname (see SA-5). | Strip the brackets before `https.request`. That is safe now that the guard parses IPv6 correctly. |
| D-6 | Info | `deploy/rollback.sh` tags `safeops-api:rollback`, but compose never uses that tag. Already noted in the worker PR. | Pin the image by digest in the rollback path. |

**D-1: the permit actions any member can perform:**
- add or remove named people;
- record gas tests;
- confirm precautions;
- release LOTO isolations;
- request extensions;
- create permits.

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

1. **Resolve D-0 (MFA) before selling to companies that ask about it.** It is the one
   finding a customer's security questionnaire will catch.
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
