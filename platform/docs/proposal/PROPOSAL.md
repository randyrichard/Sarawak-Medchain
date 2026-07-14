# Sarawak MedChain — Proof-of-Concept Proposal

**Prepared for:** Ministry of Health Malaysia (KKM)
**Subject:** A digitally-signed, independently-verifiable Medical Certificate (e-MC) platform to eliminate MC fraud

> **How to read this document.** Every capability is tagged **[Implemented]**
> (working today in the live proof-of-concept), **[Configurable]** (built, but
> pending a provider/credential to activate), or **[Roadmap]** (a proposed future
> enhancement, not yet built). We have deliberately avoided any claim the running
> system cannot support.

---

## 1. Executive Summary

### The problem
The paper (and PDF) medical certificate is trusted by employers, universities and
agencies across Malaysia, yet it is trivial to forge. A genuine MC can be edited in
a PDF viewer, a doctor's signature can be copied, an MMC number can be fabricated, a
QR code can be faked, and the same MC can be duplicated. Verification today means
phoning a clinic — slow, inconsistent, and easily defeated.

### Why it is a national issue
MC fraud causes measurable losses in productivity (unearned paid sick leave),
undermines academic and employment integrity, and erodes trust in the medical
profession. Because there is no shared, authoritative way to check an MC, every
employer re-solves the problem badly and in isolation.

### How Sarawak MedChain addresses it
The platform makes a certificate's authenticity a matter of **mathematics rather
than appearance**. At issuance, each MC is:
1. **Digitally signed** by the issuing doctor's private key (PKI). [Implemented]
2. Reduced to a **cryptographic fingerprint** (keccak-256 hash) of its canonical
   fields. [Implemented]
3. **Anchored** — that fingerprint is written to a public blockchain, giving an
   immutable, independently-checkable issuance timestamp. [Implemented]

Anyone can then verify an MC in seconds by scanning its QR code — no login, no phone
call. The system recomputes the fingerprint from the stored record, checks the
doctor's signature, and confirms the blockchain anchor. If any field was altered,
the result is **TAMPERED**. A forged MC would require breaking keccak-256, stealing a
doctor's protected signing key, **and** rewriting a public blockchain — simultaneously.

### Key benefits
- Fake, edited, duplicated and expired MCs become detectable instantly.
- Verification is reduced from a phone call to a QR scan.
- KKM gains national visibility and a tamper-evident audit trail.
- Patient privacy is preserved — the diagnosis is never disclosed during verification.

### Expected outcomes (to be measured in the pilot — see §8)
- A sharp fall in accepted fraudulent MCs at participating employers.
- Sub-second verification responses.
- A complete, attributable audit trail of every issuance and verification.

---

## 2. Value Proposition by Stakeholder

| Stakeholder | Value |
|---|---|
| **KKM** | National oversight dashboard, tamper-evident audit trail, automated fraud analytics, facility & doctor governance, exportable reports for auditors. [Implemented] |
| **Public hospitals** | Issue MCs in one signed step; manage their doctors; see issuance analytics; suspended/closed facilities are blocked automatically. [Implemented] |
| **Private clinics** | The same trust and tooling as a hospital, with low overhead — a browser is all that is required. [Implemented] |
| **Doctors** | Fast issuance, a personal signing identity, and protection: a forged "signature" in their name fails verification, defending their professional reputation. [Implemented] |
| **Employers** | Instant, authoritative verification by QR — no accounts, no phone calls; bulk verification for HR systems via API. [Implemented] |
| **Patients** | A secure record of their own MCs, private (diagnosis never shown), shareable by a controlled link, downloadable as an official PDF. [Implemented] |

---

## 3. End-to-End Workflow (implemented lifecycle)

```
Doctor login (2FA optional)                         [Implemented]
        │
Patient consultation (clinical decision by doctor)  [Off-platform]
        │
MC creation — patient, IC, rest days, dates         [Implemented]
   diagnosis optional & confidential
        │
Fraud pre-checks — duplicate / suspended / volume   [Implemented]
        │
Digital signing — Ed25519 over canonical hash       [Implemented]
        │
Blockchain anchor — fingerprint written on-chain    [Implemented]
        │
Secure storage — IC & diagnosis AES-256 encrypted   [Implemented]
        │
QR generation — encodes the public verify URL       [Implemented]
        │
Patient download / share (PDF, QR, link)            [Implemented]
        │
Employer verification — scan → VALID/…/TAMPERED     [Implemented]
        │
Audit logging — tamper-evident, hash-chained        [Implemented]
        │
Revocation / amendment — audited, visible to verifiers  [Implemented]
```

Every step above is exercised end-to-end in an automated test suite and on the live
system. See `docs/WORKFLOWS.md` for the detailed sequence diagrams.

---

## 4. System Architecture

```
                       ┌─────────────────────────────┐
   Patients/Doctors    │   Web application (Next.js)  │
   Admins  ──HTTPS──▶  │   role dashboards, EN/BM,    │
                       │   dark mode, responsive      │
   Employer QR scan    └──────────────┬──────────────┘
   (any phone camera)                 │ REST / JWT
                       ┌──────────────▼──────────────┐
   HR systems ─API key▶│   API (Node/Express/Prisma) │
                       │   auth · RBAC · MC lifecycle │
                       │   fraud engine · audit chain │
                       └───┬───────────┬───────────┬──┘
                           │           │           │
                 ┌─────────▼──┐  ┌─────▼─────┐  ┌──▼─────────────┐
                 │ PostgreSQL │  │  PKI &    │  │  Blockchain    │
                 │ encrypted  │  │  crypto   │  │  (hash anchor  │
                 │ records    │  │  (KMS*)   │  │   only)        │
                 └────────────┘  └───────────┘  └────────────────┘
   * KMS/HSM is the production key-management target [Configurable]
```

| Component | Description | Status |
|---|---|---|
| **Frontend** | Next.js 16 / React 19 / TailwindCSS. Role-based dashboards, public verify page, EN/BM, dark mode, WCAG-conscious, mobile-responsive. | [Implemented] |
| **Backend** | Node.js / Express / TypeScript / Prisma. Versioned REST API (`/api/v1`), OpenAPI 3 contract, per-route rate limiting, zod validation. | [Implemented] |
| **Database** | PostgreSQL. PII (IC, diagnosis) encrypted per-field; HMAC digests enable search without indexing plaintext; indexed hot paths. | [Implemented] |
| **Authentication** | JWT access + rotating refresh tokens with reuse detection, TOTP 2FA, lockout, password policy, forced change, self-service recovery. | [Implemented] |
| **Security** | AES-256-GCM at rest, TLS in transit, CSP/HSTS, RBAC + resource-ownership checks, tamper-evident audit log. | [Implemented] |
| **Verification service** | Public, unauthenticated. Recomputes hash, verifies Ed25519 signature, checks the on-chain anchor; returns VALID/INVALID/REVOKED/EXPIRED/TAMPERED. | [Implemented] |
| **Blockchain hash service** | Anchors only the 32-byte fingerprint — never patient data. Currently Ethereum Sepolia (testnet) in the PoC. | [Implemented] · production chain [Roadmap] |
| **Notification service** | In-app notifications with polling. Email/SMS are pluggable adapters, not yet wired to a provider. | In-app [Implemented] · Email/SMS [Configurable] |
| **Key management** | Field-encryption and signing keys via environment configuration in the PoC; AWS KMS/HSM is the production target. | PoC [Implemented] · KMS [Configurable] |

Detailed documents: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`,
`docs/WORKFLOWS.md`.

---

## 5. Deployment Strategy

A phased rollout that earns trust before scale.

| Phase | Scope | Focus |
|---|---|---|
| **1 — Single clinic PoC** | One clinic, a handful of doctors | Validate the issue→verify→audit loop with real users; gather UX feedback |
| **2 — Single hospital pilot** | One hospital, many doctors, real employer verifiers | Concurrency, doctor onboarding at scale, integration with a real email/SMS provider, MMC-number validation |
| **3 — State-wide (Sarawak)** | All state facilities | State-admin governance, cross-facility analytics, production hosting on gov cloud (MyGovCloud/approved AWS), KMS, managed backups/DR |
| **4 — Nationwide** | All states via KKM | National dashboard, high availability across regions, MyDigital ID and HIS integrations, production blockchain |

**Migration strategy.** No data migration is required to begin — issuance is
forward-looking. Existing paper MCs remain valid under current rules; the platform
runs alongside them, and adoption grows as employers prefer the instantly-verifiable
e-MC. Facilities and doctors are onboarded progressively (see `docs/ADMIN_GUIDE.md`).

**Operational considerations.** Stateless services scale horizontally behind a load
balancer (Kubernetes manifests provided). Zero-downtime rolling deploys, health/readiness
probes, and automatic schema migration on release are in place. Backups, disaster
recovery, monitoring and key rotation are documented as runbooks in
`docs/OPERATIONS.md` and become operational responsibilities in Phase 3+.

---

## 6. Risk Assessment

| Category | Risk | Mitigation |
|---|---|---|
| **Technical** | Blockchain endpoint unavailable | Verification degrades gracefully to database + signature checks; issuance rolls back rather than emit a falsely-"anchored" MC. [Implemented] |
| **Technical** | Database failure / data loss | Multi-AZ managed Postgres with point-in-time recovery + nightly encrypted dumps; audit-chain integrity check proves a clean restore. [Roadmap — operated in Phase 3+] |
| **Technical** | Traffic spikes (exam season, outbreaks) | Stateless API with horizontal autoscaling; verification is a single indexed lookup and CDN-cacheable. [Implemented — design] |
| **Operational** | Doctor/facility onboarding burden | Self-service admin workflows; forced initial-password change; progressive rollout. [Implemented] |
| **Operational** | Lost credentials | Self-service account recovery; account lockout on abuse. [Implemented] |
| **Adoption** | Employers keep accepting paper | QR verification requires no account and is faster than a phone call; the e-MC's instant authoritativeness is the incentive. Public awareness is a KKM change-management activity. |
| **Adoption** | Doctor resistance | Issuance is a single form; the platform protects doctors from signature forgery. |
| **Security** | Insider edits the database | Verification recomputes the hash → TAMPERED; audit log is hash-chained and independently verifiable. [Implemented] |
| **Security** | Stolen doctor credentials | 2FA, lockout, volume/geo anomaly detection, full attribution and instant revocation. [Implemented] |
| **Security** | Key compromise | Move keys to KMS/HSM; documented rotation procedures. [Configurable / Roadmap] |
| **Compliance** | PDPA obligations | Encryption, minimization, masked disclosure and audit are built in; a DPIA, retention policy and DPO appointment are organizational deliverables. [Partly implemented + organizational] |

---

## 7. Cost Considerations

Presented as **categories** only — actual figures depend on scale, the chosen cloud,
and procurement. No prices are invented here.

- **Compute** — application nodes (Kubernetes/containers), scaling with concurrent load.
- **Managed database** — PostgreSQL with Multi-AZ, automated backups and PITR.
- **Object storage & CDN** — PDF/report archival, static delivery, WAF.
- **Key management** — KMS/HSM for encryption and signing keys.
- **Blockchain** — transaction/anchoring cost and/or operating a node; a government
  consortium chain or L2 changes this materially versus a public mainnet.
- **Messaging** — email and SMS gateway (an MCMC-registered provider) for notifications
  and account recovery.
- **Observability** — logging, metrics, alerting, uptime monitoring.
- **Resilience** — a secondary region / DR capacity.
- **Security assurance** — independent penetration testing and periodic assessment.
- **People** — operations/SRE, support, and onboarding/training.
- **Integrations** — one-time build cost for MMC registry, MyDigital ID and HIS connectors.

The PoC currently runs on a low-cost managed platform to demonstrate the software; it
is **not** representative of production infrastructure cost.

---

## 8. Success Metrics (pilot KPIs)

| KPI | Definition | Target direction |
|---|---|---|
| **Fraudulent-MC reduction** | Rejected/flagged MCs at participating employers vs. baseline | ↓ significantly |
| **Verification response time** | Time from QR scan to verdict | Sub-second (p95) |
| **Verification rate** | % of issued MCs actually verified by an employer | ↑ over the pilot |
| **User adoption** | Active doctors, facilities and employers | ↑ toward targets |
| **System availability** | Uptime of the verification service | ≥ 99.9% in pilot |
| **Tamper/duplicate detections** | Count surfaced by the fraud engine | Tracked & reviewed |
| **Audit completeness** | % of actions with an intact audit-chain entry | 100% |
| **Time-to-verify vs. baseline** | e-MC scan vs. phoning a clinic | Order-of-magnitude faster |

The platform already records the raw data for every one of these (issuance,
verification events, fraud alerts, audit entries) and can export it as CSV for
independent analysis. [Implemented]

---

## 9. Future Roadmap

Clearly **not yet built** — proposed enhancements for post-pilot phases.

- **National identity integration** — MyDigital ID / e-KYC at patient and doctor
  onboarding for verified identity. *(Integration seam exists in the auth layer.)*
- **MMC registry integration** — live validation of MMC numbers and automatic
  handling of licence suspension/expiry. *(Integration point marked in code.)*
- **Healthcare information systems** — MySejahtera and hospital HIS/EMR
  interoperability so an MC flows from the clinical record.
- **AI-assisted fraud analytics** — machine-learning models over issuance and
  verification patterns, complementing today's deterministic rules engine.
- **Native mobile applications** — dedicated doctor and verifier apps (the platform
  is responsive web today; no native app yet).
- **Advanced reporting & BI** — configurable dashboards and scheduled reports for
  KKM and state health departments.
- **Production blockchain** — migrate anchoring from the testnet used in the PoC to a
  government consortium chain or a production L2.
- **Offline verification** — signed revocation-list bundles for verification where
  connectivity is intermittent.

---

*Supporting technical documentation accompanying this proposal:*
`README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`,
`docs/WORKFLOWS.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`,
`docs/AUDIT.md`, `docs/ACCEPTANCE.md`, `docs/ADMIN_GUIDE.md`, `docs/USER_GUIDE.md`.
Live demonstration runbook: `docs/proposal/DEMO_SCRIPT.md`.
