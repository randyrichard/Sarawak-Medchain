# SafeOps — Enterprise Security Roadmap

Status of record for hardening SafeOps into software a large manufacturing client can deploy.
Each phase ends with a security audit and an updated enterprise readiness score. No phase starts
until the previous one passes validation.

**Baseline score (2026-07-24 audit): 42/100 — not deployable to an enterprise.**

---

## Sequencing decision (2026-07-24)

The original plan put password hashing / signed JWTs / refresh tokens / lockout in Phase 1, and
"build a real backend" in Phase 2. **Phases 1 and 2 were merged, backend first.** Reason: every
Phase 1 control is only meaningful server-side.

| Control | Implemented client-side (original order) | Reality |
| --- | --- | --- |
| Argon2/bcrypt hashing | Hash comparison runs in the browser | Attacker skips the check entirely |
| Signed JWT | Signing secret ships in the JS bundle | Anyone can mint an admin token |
| Account lockout | Counter in `localStorage` | Attacker deletes the counter |
| Refresh rotation | No server to rotate against | No security value |

Building them client-side first would produce a green checklist over an unchanged attack surface,
then be thrown away. All Phase 1 deliverables are still delivered — on the server, where they hold.

---

## Phase 1 — Real authentication service (merged P1 + P2)

`safeops-platform/api` — Express + TypeScript + Prisma + Postgres, mirroring `platform/api`.

**Status: service complete and validated (38 tests). Web integration outstanding.**

- [x] Argon2id password hashing — OWASP params (19 MiB, t=2, p=1); native module verified on Windows
- [x] Server-side credential verification — no password material reaches the client
- [x] RS256-signed JWT access tokens, 15-minute TTL
- [x] Opaque refresh tokens: SHA-256 hashed at rest, rotated on use, family-wide reuse detection
- [x] Secure logout — server-side revocation, single-device and all-devices
- [x] Session expiration enforced by the server
- [x] Account lockout (5 failures / 15 min) + per-IP rate limiting
- [x] All secrets in environment variables, validated at boot; `.env` gitignored
- [x] Bonus: Helmet headers, bounded request bodies, correct 4xx mapping, health/readiness probes
- [ ] **Web app talks to the API; mock mode behind a flag** ← remaining Phase 1 work
- [ ] End-to-end validation against real Postgres (blocked: no Docker on the dev machine)

**Exit criteria:** forged-identity and offline-guessing attacks fail against the *server*; the
web client holds no authority it can grant itself. *Partially met — the service satisfies this,
but the web app has not yet been migrated onto it.*

## Phase 2 — Transport & request hardening

- [ ] CSRF protection
- [ ] Rate limiting (per-IP and per-account)
- [ ] Security headers (Helmet)
- [ ] Content Security Policy
- [ ] CORS allow-list
- [ ] Secure cookies (`httpOnly`, `Secure`, `SameSite`)

## Phase 3 — Data protection & tamper-evident audit

- [ ] Encrypt sensitive fields at rest
- [ ] Remove sensitive data from browser storage
- [ ] Structured audit logging with actor/IP/user-agent
- [ ] Tamper-evident audit trail (append-only + hash chaining)

## Phase 4 — Production infrastructure

- [ ] Deployment architecture (containers, migrations, zero-downtime)
- [ ] Monitoring + error tracking
- [ ] Health checks (liveness/readiness)
- [ ] Backup & restore strategy with a tested restore path

---

## Score history

| Date | Phase completed | Score | Blocking gap |
| --- | --- | --- | --- |
| 2026-07-24 | — (baseline audit) | 42/100 | No backend; unsigned tokens; plaintext passwords |
| 2026-07-26 | Phase 1 (service built, not yet integrated) | 55/100 | Web app still runs on the mock client, so end users gain nothing until integration lands |
