# Operations & Disaster-Recovery Runbook

For the IT operations and infrastructure team running Sarawak MedChain.

## Service topology

- **emc-api** — stateless Express/Prisma service. Scale horizontally; no local state
  (sessions are JWT + database). Health: `GET /healthz` (liveness + chain mode),
  `GET /readyz` (checks the database).
- **emc-web** — Next.js standalone server. Stateless; scale horizontally.
- **PostgreSQL** — the system of record. The only stateful component.
- **Blockchain** — external anchoring target (Sepolia / L2 / consortium chain).
  Failure degrades gracefully: verification falls back to DB + signature, and
  issuance rolls back rather than emit an unanchored "anchored" MC.

## Configuration

All configuration is via environment variables (see `api/.env.example`). Required in
production (the API refuses to boot without real secrets): `DATABASE_URL`,
`JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `SEARCH_HMAC_KEY`. Optional: `CHAIN_*` (anchoring),
`FRAUD_*` (thresholds), `CORS_ORIGINS`, `PUBLIC_WEB_URL`. Secrets belong in AWS
Secrets Manager / KMS, delivered via the External Secrets Operator — never in images.

## Deployments

- CI (`.github/workflows/emc-platform-ci.yml`) runs typecheck, unit tests, an `npm
  audit` gate, and builds/publishes images on `main`.
- The API container runs `prisma migrate deploy` on boot (`start:deploy`), so schema
  migrations apply automatically and safely (forward-only).
- Kubernetes: `kubectl apply -f k8s/`. Rolling updates with readiness gating give
  zero-downtime deploys. HPA scales 3→30 (api) / 3→20 (web) on CPU.

## Database migrations

- Author locally with `prisma migrate dev`; commit the generated SQL under
  `prisma/migrations/`.
- Production applies them via `prisma migrate deploy` (idempotent, ordered).
- Migrations are forward-only. A bad migration is remediated by a new corrective
  migration, never by editing an applied one.

## Backups & restore (PostgreSQL)

- **Automated backups**: enable RDS automated backups + Point-In-Time Recovery
  (retention ≥ 30 days). Additionally take a nightly `pg_dump` to encrypted S3 with
  object-lock for a defence-in-depth copy.
- **Restore drill** (run quarterly):
  1. Provision a scratch instance from the latest snapshot (or `pg_restore` the dump).
  2. Point a staging API at it; run `GET /api/v1/admin/audit/integrity` — an intact
     hash chain proves the audit log restored without corruption.
  3. Spot-verify a known MC hash returns VALID.
- **RPO/RTO targets** (recommended): RPO ≤ 5 min (PITR), RTO ≤ 1 hour (Multi-AZ
  failover is seconds; full region restore is the 1-hour case).

## Disaster recovery

| Scenario | Response |
|---|---|
| API pod failure | Kubernetes reschedules; readiness gating keeps traffic off unhealthy pods |
| AZ failure | Multi-AZ RDS fails over; ≥3 replicas per service across AZs absorb load |
| Region failure | Restore RDS snapshot in the DR region, redeploy images, repoint DNS |
| Database corruption | PITR to just before the event; verify audit-chain integrity |
| Blockchain RPC down | Verification degrades to DB+signature; new anchors queue/retry; no data loss |
| Secret compromise | Rotate the affected secret (below); revoke sessions; review audit log |

## Key & secret rotation

- **JWT_SECRET**: rotate by deploying the new secret; existing access tokens expire
  within 15 minutes and refresh tokens re-issue. For zero disruption, support an
  overlapping previous-key verification window before full cutover.
- **DATA_ENCRYPTION_KEY**: this decrypts PII at rest — rotation requires an
  envelope-key scheme (KMS data keys) so records can be re-wrapped without a global
  re-encrypt. Plan this before storing real patient data.
- **Doctor signing keys**: per-doctor; re-issue by regenerating the keypair for a
  compromised doctor. Previously signed MCs remain verifiable against the public key
  recorded at signing time.
- **API keys** (employers): self-service revoke + recreate.

## Monitoring & alerting

- Scrape `GET /healthz` / `GET /readyz` for liveness/readiness.
- Ship container logs to CloudWatch / a central log store. Every security-relevant
  event (login, failure, issuance, revocation, verification, export, admin action)
  is in the **audit log** table — surface `LOGIN_FAILED` spikes and any
  `HASH_MISMATCH` / `GEO_ANOMALY` fraud alerts to on-call.
- Recommended alerts: readiness failing > 1 min; 5xx rate; DB connection saturation;
  audit-chain integrity check failing; fraud alerts at CRITICAL severity.

## Scheduled maintenance

Because deploys are zero-downtime, most maintenance needs no window. For database
maintenance requiring a pause, put the API behind a maintenance response at the load
balancer; the public verify path can be served read-only from a replica to keep
employer verification available.

## Incident response (outline)

1. **Detect** — alert or audit-log anomaly.
2. **Contain** — revoke affected sessions/keys; suspend the implicated doctor/facility.
3. **Assess** — use the audit trail (attributable, tamper-evident) to scope impact.
4. **Eradicate & recover** — rotate secrets, restore from backup if needed.
5. **Report** — PDPA breach-notification obligations where personal data is involved.
6. **Review** — post-incident review; feed findings back into fraud thresholds/rules.
