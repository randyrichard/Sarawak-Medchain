# MedChain e-MC Platform

National Digital Medical Certificate (e-MC) platform for Malaysia — built to make
MC fraud cryptographically impossible. This is the enterprise redesign of the
Sarawak MedChain prototype, kept **hash-compatible with the live Sepolia contract**
(`0x52748C170EE85FF4f15E677b909f5c154F83e2CD`) so every MC anchored by the
prototype remains verifiable here.

## How forgery becomes impossible

| Attack | Defence |
|---|---|
| Fake / edited PDF MC | The PDF is not the trust anchor — the QR resolves to a live verification that recomputes the keccak-256 fingerprint from the registry record |
| Forged doctor signature | Every MC is Ed25519-signed with a per-doctor key generated at registration; signature is checked at every verification |
| Fake MMC number | Doctors are registered by approved facilities against unique MMC numbers (MMC-registry integration point built in) |
| Duplicate MC | Fraud engine blocks overlapping rest periods per patient IC |
| Fake clinic | Facilities must be KKM/state-approved before any doctor can issue |
| Fake QR code | A QR pointing anywhere but `emc.gov.my/verify/<hash>` is visibly foreign; a fabricated hash returns INVALID |
| Backdated MC | The fingerprint is anchored on a public blockchain at issuance — the timestamp cannot be rewritten by anyone, including the platform |
| Insider database edit | Verification recomputes the hash from stored data → any edit shows TAMPERED; the audit log is hash-chained |

## Stack

- **Web** (`web/`): Next.js 14 (App Router) · TypeScript · TailwindCSS · shadcn-style components · dark mode · EN/BM
- **API** (`api/`): Node.js · Express · TypeScript · Prisma · PostgreSQL · Zod · JWT + TOTP 2FA · rate limiting · helmet
- **Crypto**: AES-256-GCM field encryption · HMAC-searchable IC digests · Ed25519 doctor PKI · keccak-256 canonical hashes
- **Chain**: Ethereum Sepolia (`issueMC`/`verifyMC`) — hash only, never patient data
- **Infra**: Docker · docker-compose · Kubernetes (EKS) manifests · GitHub Actions CI/CD

## Quick start (local)

```bash
# 1. Database
docker run -d --name emc-db -e POSTGRES_USER=emc -e POSTGRES_PASSWORD=emc_dev_password \
  -e POSTGRES_DB=emc -p 5432:5432 postgres:16-alpine

# 2. API
cd platform/api
cp .env.example .env
npm install
npx prisma migrate dev --name init
npx tsx prisma/seed.ts        # demo accounts, all password: Emc-Demo-Pass1
npm run dev                   # http://localhost:3005

# 3. Web
cd ../web
cp .env.example .env
npm install
npm run dev                   # http://localhost:3000
```

Or the whole stack at once: `docker compose up --build` (see `docker-compose.yml`).

### Demo accounts (after seeding — password `Emc-Demo-Pass1`)

| Role | Email |
|---|---|
| KKM Super Admin | `kkm.admin@emc.gov.my` |
| State Admin (Sarawak) | `sarawak.admin@emc.gov.my` |
| Hospital Admin (SGH) | `sgh.admin@emc.gov.my` |
| Clinic Admin | `klinik.admin@emc.gov.my` |
| Doctor | `dr.tan@sgh.gov.my` |
| Employer | `employer@demo.com.my` |
| Patient | `patient@demo.com.my` |

### Enable real blockchain anchoring

In `api/.env`: set `CHAIN_ENABLED=true` and `CHAIN_ISSUER_PRIVATE_KEY` to a wallet
that is a verified doctor on the contract (the prototype's doctor wallet works).
Without it the platform runs in demo mode — MCs are signed and verifiable, just
not anchored.

## Folder structure

```
platform/
├── api/                    Express + Prisma backend
│   ├── prisma/
│   │   ├── schema.prisma   Full data model (users, facilities, MCs, fraud, audit)
│   │   └── seed.ts         Demo data
│   └── src/
│       ├── config.ts       Env-driven configuration
│       ├── app.ts          Express app assembly (helmet, CORS, rate limits)
│       ├── server.ts       Entrypoint
│       ├── lib/            canonical hash · crypto/PKI · chain · audit chain
│       ├── middleware/     JWT auth · RBAC · validation · rate limiting
│       ├── services/       auth · MC lifecycle · verification · fraud · PDF · notify
│       └── routes/         auth · verify · mcs · admin · facilities · misc
├── web/                    Next.js frontend
│   └── src/
│       ├── app/            landing · verify · login/register · role dashboards
│       ├── components/     ui kit (shadcn-style) · header · providers
│       └── lib/            API client · i18n (EN/BM)
├── k8s/                    Kubernetes manifests (EKS-ready)
├── docs/                   Architecture, database, API, workflows, deployment
└── docker-compose.yml      Full local stack
```

## Documentation

- [System & security architecture](docs/ARCHITECTURE.md)
- [Database schema & ER diagram](docs/DATABASE.md)
- [REST API reference](docs/API.md)
- [Blockchain, verification & fraud workflows](docs/WORKFLOWS.md)
- [Deployment: Docker, Kubernetes, AWS, CI/CD](docs/DEPLOYMENT.md)

## Tests

```bash
cd platform/api && npm test        # crypto, PKI and canonical-hash suites
cd platform/api && npm run typecheck
cd platform/web && npm run build   # includes full type checking
```
