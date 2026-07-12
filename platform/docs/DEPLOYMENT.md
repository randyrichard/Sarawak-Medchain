# Deployment Guide

## 1. Local development

See the Quick start in [`../README.md`](../README.md) — Postgres container, then
`api` (`npm run dev`, port 3005) and `web` (`npm run dev`, port 3000).

## 2. Docker Compose (full stack)

```bash
cd platform
docker compose up --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npx tsx prisma/seed.ts
# web: http://localhost:3000 · api: http://localhost:3005
```

## 3. AWS production architecture

| Concern | Service |
|---|---|
| Compute | EKS (managed node groups across 3 AZs) |
| Database | RDS PostgreSQL 16, Multi-AZ, encrypted, automated backups + PITR |
| Secrets | Secrets Manager + KMS (JWT secret, data-encryption key, chain key) via External Secrets Operator |
| Ingress | ALB + WAFv2 (rate rules, geo rules) + ACM TLS |
| Static/PDF archive | S3 (versioned, encrypted) + CloudFront |
| Observability | CloudWatch Logs + Container Insights; audit trail lives in the DB |
| Region | ap-southeast-5 (Malaysia) for data-residency compliance |

### Kubernetes rollout

```bash
kubectl apply -f k8s/namespace.yaml
# create emc-api-secrets (DATABASE_URL, JWT_SECRET, DATA_ENCRYPTION_KEY,
# SEARCH_HMAC_KEY, CHAIN_* …) via External Secrets or kubectl create secret
kubectl apply -f k8s/api.yaml -f k8s/web.yaml -f k8s/ingress.yaml

# one-off migration job per release
kubectl -n emc run migrate --rm -it --image ghcr.io/OWNER/emc-api:TAG \
  --command -- npx prisma migrate deploy
```

Both services run 3–30 replicas under HPA, non-root, read-only filesystems,
with readiness (`/readyz` checks the DB) and liveness probes — zero-downtime
rolling deploys.

## 4. CI/CD

`.github/workflows/emc-platform-ci.yml` (repo root):

1. **api job** — Postgres service container → `prisma migrate deploy` → typecheck → unit tests
2. **web job** — full `next build` (includes type checking)
3. **docker job** (main only) — build & push `emc-api` / `emc-web` images tagged `latest` + SHA
4. **deploy job** — gated on the GitHub `production` environment approval; contains
   the `kubectl set image` commands (dry-run until AWS OIDC credentials are wired)

## 5. Blockchain configuration

| Env | Purpose |
|---|---|
| `CHAIN_ENABLED` | `true` to anchor at issuance and check at verification |
| `CHAIN_RPC_URL` | JSON-RPC endpoint (Sepolia now; a private/consortium chain or L2 for national production) |
| `CHAIN_CONTRACT_ADDRESS` | `0x52748C170EE85FF4f15E677b909f5c154F83e2CD` — the live prototype contract, fully compatible |
| `CHAIN_ISSUER_PRIVATE_KEY` | Wallet verified as a doctor on the contract; production: one wallet per facility, keys in KMS |

For national deployment the recommended path is an Ethereum L2 or a
government-operated consortium chain — the contract interface (`issueMC`/`verifyMC`)
is chain-agnostic.

## 6. Go-live checklist

- [ ] Rotate every secret out of `.env.example` defaults; store in Secrets Manager
- [ ] `NODE_ENV=production` (config refuses to boot without real secrets)
- [ ] RDS: enforce TLS, private subnets, security groups API-only
- [ ] WAF: enable managed rule sets + per-IP rate rules on `/api/v1/auth` and `/api/v1/verify`
- [ ] Turn on CAPTCHA at the WAF layer for repeated failed logins
- [ ] Wire SES (email) and an SMS gateway into `notifyService.registerProvider`
- [ ] Point `PUBLIC_WEB_URL` at the final domain **before** issuing real MCs (QR URLs embed it)
- [ ] Pen-test + KKM security posture review
