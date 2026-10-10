# SafeChain — Enterprise Security Roadmap

Status of record for hardening SafeChain into software a large manufacturing client can deploy.
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

**Status: COMPLETE — validated end-to-end against real PostgreSQL 18.4 (67 tests).**

- [x] Argon2id password hashing — OWASP params (19 MiB, t=2, p=1); native module verified on Windows
- [x] Server-side credential verification — no password material reaches the client
- [x] RS256-signed JWT access tokens, 15-minute TTL
- [x] Opaque refresh tokens: SHA-256 hashed at rest, rotated on use, family-wide reuse detection
- [x] Secure logout — server-side revocation, single-device and all-devices
- [x] Session expiration enforced by the server
- [x] Account lockout (5 failures / 15 min) + per-IP rate limiting
- [x] All secrets in environment variables, validated at boot; `.env` gitignored
- [x] Bonus: Helmet headers, bounded request bodies, correct 4xx mapping, health/readiness probes
- [x] **Web app talks to the API**; mock mode behind `VITE_API_BASE_URL`, with a loud
      production guard so a tenant build can never silently fall back to in-browser auth
- [x] Access token held in memory only; refresh token in an httpOnly cookie unreadable by JS
- [x] No credential in localStorage/sessionStorage; a stale mock session is ignored outright
- [x] End-to-end validation against real PostgreSQL 18.4 (via `embedded-postgres`, since
      Docker needs admin rights this machine does not have — see "Local database" below)

**Exit criteria: MET.** Forged identity fails against the server (tampered JWT → 401), offline
guessing is bounded by Argon2id + lockout + rate limiting, and the web client holds no authority
it can grant itself.

### Local database

Docker Desktop requires WSL2 and UAC elevation, neither available in the automated environment.
`npm run db:start` runs the official PostgreSQL binaries as a normal user process instead — same
engine and wire protocol, so behaviour validated locally holds on the Postgres in
`docker-compose.yml`. Use Docker once installed:

```bash
wsl --install                                   # reboots
winget install --id Docker.DockerDesktop -e
docker compose -f safeops-platform/docker-compose.yml up -d db
```

### Bugs found and fixed during integration

1. **Refresh-rotation race** — React StrictMode double-invokes effects, so session restore fired
   two concurrent refreshes with the same single-use token. The second looked like a replay, the
   server revoked the family (correctly), and the app logged itself out on every reload. Fixed by
   collapsing concurrent refreshes into one in-flight request, which also covers multi-tab races,
   without weakening reuse detection.
2. **Empty sidebar for every user** — `OrgContext` resolved companies by looking the user up in a
   mock fixture by id, but the backend issues its own ids. Now driven by server-issued memberships.
3. **Escalation guard silently disabled** — `claimIsAuthentic()` read the localStorage session that
   backend mode removes, so it fell through to its "no session" branch and permitted forged roles
   again. Now sourced from the authenticated identity held in memory. Regression-tested.
4. **Demo password below the server policy** — the seed uses a 19-character password; the web
   quick-login constant and mock fixtures were still on the old 12-character-failing value.

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
| 2026-07-26 | **Phase 1 COMPLETE (integrated, E2E validated)** | **68/100** | Business data (incidents, CAPA, admin) still lives in browser localStorage with client-side authorization — only authentication is server-enforced |
