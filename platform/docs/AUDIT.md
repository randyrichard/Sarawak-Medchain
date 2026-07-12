# Production-Readiness & Security Audit

Audit of the Sarawak MedChain e-MC platform conducted from the perspective of a
government technical evaluation committee (KKM CIO office, cybersecurity team,
technical committee). Date: 2026-07-13. Scope: every route, service, model and
page in `platform/`.

## 1. OWASP Top 10 review

| Risk | Status | Evidence / control |
|---|---|---|
| A01 Broken Access Control | ✅ | RBAC middleware on every non-public route; facility admins scoped to `user.facilityId`, state admins to `user.state`; resource-ownership checks on every MC operation (PDF, QR, revoke, amend, share) — no direct-object access by ID alone |
| A02 Cryptographic Failures | ✅ | AES-256-GCM field encryption (IC, diagnosis, TOTP secrets, signing keys); HMAC-SHA256 searchable digests; bcrypt cost 12; refresh tokens and API keys stored as SHA-256 hashes only; TLS terminated by the platform (HSTS set) |
| A03 Injection | ✅ | 100% Prisma parameterized queries (the two raw queries use tagged-template parameter binding); zod validation on every request body; no shell execution, no HTML templating of user input |
| A04 Insecure Design | ✅ | Trust is cryptographic, not procedural: verification recomputes the hash, checks the Ed25519 signature and the public-chain anchor — a compromised database or operator cannot forge outcomes |
| A05 Security Misconfiguration | ✅ | helmet on API; CSP, HSTS, X-Frame-Options DENY, nosniff, referrer & permissions policies on web; `NODE_ENV=production` refuses to boot with dev secrets; non-root containers, read-only rootfs in k8s |
| A06 Vulnerable Components | ✅ | Current LTS/stable dependency set; CI rebuilds on every push (add Dependabot/`npm audit` gate — see §4) |
| A07 Auth Failures | ✅ | 15-min JWTs (HS256 **pinned**), rotating refresh tokens with **reuse detection that revokes all sessions**, TOTP 2FA, 5-strike lockout, per-route rate limits, purpose-bound 2FA tokens rejected as access tokens |
| A08 Software & Data Integrity | ✅ | Hash-chained audit log (advisory-lock serialized, `stableStringify` canonical form) + `GET /admin/audit/integrity`; MC integrity via keccak-256 + signature + chain anchor |
| A09 Logging & Monitoring | ✅ | Every login/failure, issuance, revocation, amendment, verification, download, admin action audited with IP + UA; fraud engine raises severity-ranked alerts into a KKM review queue; `/healthz` reports anchoring mode |
| A10 SSRF | ✅ | The server fetches only the configured chain RPC URL (operator-controlled env var); no user-supplied URLs are ever fetched |

Additional checks: **CSRF** — session is a Bearer header, not an ambient cookie,
so cross-site requests carry no credentials. **XSS** — React auto-escaping; no
`dangerouslySetInnerHTML` with dynamic data; CSP as backstop. **File uploads** —
none exist by design (PDFs are generated server-side; the QR is the trust anchor,
not the document). **Command injection** — no child processes.

## 2. Defects found by this audit — fixed

| Severity | Finding | Fix |
|---|---|---|
| HIGH | **MC-number race**: count-based numbering meant two concurrent issuances could collide → 500 under load | Retry loop with attempt-offset; unique constraint remains the arbiter |
| HIGH | **Audit-chain fork**: concurrent appends could read the same `prevHash`, silently breaking the tamper-evidence chain | `pg_advisory_xact_lock` serializes appends inside the transaction |
| HIGH | **Horizontal-scaling blocker**: pending-2FA state lived in a per-process `Map` — logins would randomly fail behind a load balancer, plus an unbounded memory leak | Stateless purpose-bound JWT (`purpose: '2fa-pending'`, 5-min TTL); middleware rejects purpose tokens as access tokens |
| HIGH | **Analytics full-table scans**: by-state and daily charts materialized every MC row — fatal at national volume | Database-side `GROUP BY` aggregation, O(#facilities)/O(#days) |
| MED | **Refresh-token theft undetectable**: replay of a rotated token just returned 401 | Reuse now revokes every session for the account + audit entry |
| MED | **JWT algorithm not pinned** on verification | `algorithms: ['HS256']` everywhere |
| MED | **No CSP on the web app** | Strict CSP + HSTS (see `next.config.mjs`) |
| MED | **Chain-anchor failure left inconsistent state risk** | Anchor now happens after persist with rollback-on-failure: an MC either exists anchored or does not exist |
| LOW | Missing index for the patient-portal MC lookup | `@@index([patientUserId])` migration |
| LOW | Dashboards showed blank space while loading; alerts not announced to screen readers | `PageLoading` component; `role="alert"`/`role="status"` on alerts |

## 3. Scale posture (10M patients / 100k concurrent)

- **Stateless API** (JWT + DB): scales horizontally; HPA 3→30 replicas defined in k8s.
- **Hot path** (`GET /verify/:hash`) is one unique-index lookup + one signature check;
  chain read is optional and degrades gracefully. Cacheable at the CDN for burst absorption.
- All dashboard aggregations are database-side `GROUP BY`; no endpoint materializes
  unbounded row sets (list endpoints are `take`-limited).
- Writes serialize only on the audit advisory lock (microseconds) — acceptable;
  at extreme volume, partition the audit chain per shard (documented path).
- HA/DR: Multi-AZ RDS + PITR backups + ≥3 replicas across AZs per `docs/DEPLOYMENT.md`.

## 4. Honest gaps — what KKM would still require before nationwide go-live

Committee members should see these named, not discovered:

1. **Hosting**: the demo runs on a free tier (cold starts; demo database expires
   monthly). The production design (EKS/RDS/KMS, `k8s/` + `docs/DEPLOYMENT.md`)
   is written but not yet stood up — that is a procurement/budget decision.
2. **Key management**: field-encryption and signing keys are env-vars today;
   production must move them to KMS/HSM (integration point isolated in `crypto.ts`).
3. **MMC registry**: doctor MMC numbers are uniqueness-checked and facility-attested,
   not yet verified against the live MMC register (no public API; the validation
   point is marked in `facilities.ts`).
4. **Identity proofing**: patient registration is self-asserted IC; production needs
   MyDigital ID / e-KYC at onboarding (adapter seam in `authService.login`).
5. **PDPA compliance package**: the technical controls (encryption, minimization,
   masked disclosure, audit) exist, but a legal review, DPIA, retention policy and
   appointed DPO are organizational deliverables, not code.
6. **Token storage tradeoff**: the SPA keeps JWTs in localStorage (CSRF-immune,
   XSS-exposed, mitigated by CSP + React escaping). The alternative (httpOnly
   cookies + CSRF tokens) is a documented switch if KKM policy prefers it.
7. ~~Dependency scanning~~ **Done 2026-07-13**: Dependabot (weekly, both apps +
   actions) and an `npm audit --omit=dev --audit-level=high` gate in CI; web
   upgraded to Next 16 / React 19 clearing all framework advisories. One accepted
   moderate finding remains: Next.js vendors an old postcss internally — it is a
   build-time tool only and never executes in production traffic.
8. **Penetration test**: an independent pen-test and MyGovCloud/CyberSecurity
   Malaysia assessment are prerequisites for government hosting.

## 5. Verification evidence

- 17 unit tests (crypto, canonical hash, audit canonicalization) — green
- Concurrency test: parallel issuance produces unique MC numbers, zero failures,
  audit chain verifies intact afterward
- Full E2E suite (14 checks incl. DB-tamper → TAMPERED, RBAC, PDF) — green
- CI: typecheck + tests against fresh Postgres + Next build on every push
