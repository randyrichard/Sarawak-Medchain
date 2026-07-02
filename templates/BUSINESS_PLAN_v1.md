# Sarawak MedChain — Business Plan

**Version 1.0** · June 2026
**Legal entity:** Medchain Enterprise (SSM-registered, June 2026)
**Trading brand:** Sarawak MedChain
**Founder:** Randy Richard · 19 · Miri, Sarawak
**Contact:** randyrjm99@gmail.com · sarawak-medchain.pages.dev

---

## Executive Summary

Sarawak MedChain is a blockchain-secured medical certificate (MC) platform that eliminates MC fraud in Malaysia through cryptographic verification, patient-controlled access, and audit-ready reporting for state agencies.

The product is **live** at [sarawak-medchain.pages.dev](https://sarawak-medchain.pages.dev), with a **working OTP demo** at `/otp` that lets doctors access patient records via a 6-digit code — no wallet, no app install required.

On **21 June 2026**, the Minister of Health, Datuk Seri Dr Dzulkefly Ahmad, publicly announced KKM is *studying e-MC implementation to curb misuse of sick leave certificates* (Astro Awani). Sarawak MedChain is a built, working implementation of exactly this — ready for a Sarawak pilot today.

**Stage:** Pilot-ready · Pre-revenue · Solo founder · Enterprise-registered (Sdn Bhd conversion upon first contract)
**Ask:** Cradle CIP Spark / MyStartup — RM 50,000 to RM 150,000 for 12-month runway to first paying customers.

---

## 1. The Problem

Malaysia loses an estimated **RM 1.5 – 3 billion** annually to medical certificate fraud. Paper-based MC systems offer zero protection:

- **Easily forged** — paper templates freely available online
- **Impossible to verify at the point of use** — employers cannot check authenticity
- **No audit trail** — no way to track issuance, access, or misuse
- **No central registry** — no way to confirm whether a specific MC was actually issued at the named facility, by the named doctor, on the claimed date

*Estimate methodology: Malaysia healthcare spend (~RM 60B, MOH 2023) × global healthcare fraud range of 3–7% (NHCAA — National Health Care Anti-Fraud Association). MC-specific data not publicly tracked.*

### Market Timing

On **21 June 2026**, Minister of Health Datuk Seri Dr Dzulkefly Ahmad publicly stated:

> *"KKM teliti pelaksanaan e-MC, kekang penyalahgunaan sijil cuti sakit"*
> — reported by Astro Awani (@501awani)

This is a Tier-1 public signal that Malaysia is actively moving toward e-MC. The addressable market is not hypothetical; it is being defined by the Health Ministry in real time.

---

## 2. The Solution

**Sarawak MedChain** is a blockchain-secured medical certificate platform with three novel design decisions:

1. **Client-side encryption (AES-256-GCM):** the medical record is encrypted in the browser *before* it leaves the doctor's device.
2. **Public smart contract for cryptographic hashes:** only tamper-proof fingerprints go on-chain; personal data stays encrypted off-chain on IPFS (Malaysia-hosted).
3. **Dual access modes:** wallet sign-in for hospital staff, and a 6-digit OTP for patients, elderly users, and guest doctors who need immediate access without app install.

### How It Works (5 steps)

1. **Doctor issues** — Verified doctor signs in with secure wallet, fills the MC, submits.
2. **Encrypted & hashed** — AES-256-GCM client-side; hash on public smart contract.
3. **Patient controls** — Grant or revoke access to specific doctors/employers anytime; every access logged on-chain.
4. **Employer verifies** — Anyone scans the QR code; verified in under 5 seconds.
5. **Audit-ready** — Every action logged on-chain; state agencies see anonymised, aggregated data.

### Live product URLs

- **Landing:** [sarawak-medchain.pages.dev](https://sarawak-medchain.pages.dev)
- **Working OTP demo:** [sarawak-medchain.pages.dev/#/otp](https://sarawak-medchain.pages.dev/#/otp)
- **Government preview dashboard:** [sarawak-medchain.pages.dev/#/gov-preview](https://sarawak-medchain.pages.dev/#/gov-preview)
- **Privacy Policy (PDPA 2010 compliant):** `/privacy`
- **Terms of Service (Malaysian law):** `/terms`
- **Public source:** [github.com/randyrichard/Sarawak-Medchain](https://github.com/randyrichard/Sarawak-Medchain)

---

## 3. Market Opportunity

### Total Addressable Market (TAM) — Malaysia

- ~2,000 registered clinics and 380 hospitals (public + private) issue medical certificates
- KKM's announced e-MC direction creates a national mandate horizon of 18–36 months

### Serviceable Addressable Market (SAM) — Sarawak (initial focus)

- 27 hospitals · 142 clinics · ~1,247 registered doctors · population 2.9 million
- State-level Sarawak Digital Economy Corporation (SDEC) and TEGAS provide institutional support for locally-built solutions

### Serviceable Obtainable Market (SOM) — 12 months

- **Q3 2026:** 1 hospital pilot (target: Sarawak General Hospital, Kuching)
- **Q4 2026:** 2–3 additional Sarawak facility pilots
- **Q1 2027:** Convert pilots to paid subscriptions
- **Q2 2027:** 5–8 paying facilities across Sarawak

### Competitive Landscape

- **KKM's future e-MC system:** likely 18–36 months out. **Sarawak MedChain's advantage is being ready today** — while KKM is still studying, Sarawak can pilot first.
- **Private EMR vendors (Cerner, Epic-alikes):** priced for national tenders (RM 10M+); not accessible to Sarawak's smaller facilities.
- **Foreign blockchain healthcare startups:** none are Malaysia-focused, PDPA-compliant, or Sarawak-based.

---

## 4. Business Model

### Revenue streams

1. **SaaS subscription** — monthly per-clinic/per-hospital tier
2. **Per-MC issuance credits** — pre-paid credits for high-volume issuers
3. **Enterprise / government tier** — custom pricing for state agencies and large hospital groups

### Pricing (base subscription + per-MC usage)

| Tier | Target facility | Base / month | Per MC |
|---|---|---|---|
| **Clinic** | Klinik swasta, GP | RM 2,000 | RM 1 |
| **Hospital** | Private + govt hospitals | RM 10,000+ | RM 1 |
| **Government** | State agencies (SDEC / KKM) | Custom (from RM 10,000) | Custom |

### Unit economics (12-month projection)

Target by month 12: 5 paying clinics + 2 hospitals.

| Revenue line | Monthly |
|---|---|
| 5 clinics × RM 2,000 base subscription | RM 10,000 |
| 2 hospitals × RM 10,000 base subscription | RM 20,000 |
| 5 clinics × ~500 MCs/mo × RM 1 (usage) | RM 2,500 |
| 2 hospitals × ~5,000 MCs/mo × RM 1 (usage) | RM 10,000 |
| **Total Monthly Recurring Revenue (MRR)** | **RM 42,500** |
| **Annualised Recurring Revenue (ARR)** | **RM 510,000** |

- Cost to serve: ~15–20% (backend hosting, IPFS pinning, support)
- Gross margin: ~80%
- Model scales cleanly — most costs are already sunk in the platform

### Free pilot as customer-acquisition strategy

Every prospective facility receives a **free 30-day audit pilot**:

- No cost to the facility during pilot
- Formal audit report delivered at end of pilot
- No commitment to continue
- Founder personally supports onboarding

The audit report is the deliverable that converts pilots to paid subscriptions.

---

## 5. Traction & Roadmap

### What's shipped (as of 30 June 2026)

- Live product across 12+ polished public pages
- Working OTP access demo (patient generates 6-digit code → doctor enters → sees record)
- Full stack: React/Vite frontend on Cloudflare Pages, Node.js/Express backend, Ethereum-compatible smart contract, IPFS storage
- PDPA-compliant Privacy Policy + Terms of Service pages
- Astro Awani citation for the Minister's e-MC announcement embedded in the site
- 1-page pitch PDFs (general + Cradle-tailored versions)
- 30-day pilot audit report template
- Public source code on GitHub

### Business milestones (June 2026)

- **SSM registration:** Medchain Enterprise registered June 2026
- **Cradle LIVE! attendance:** attended TEGAS Miri session, 30 June 2026
- **Warm intros in progress:** SDEC, Ketua Belia Miri, YB-level connections via community network

### 12-month roadmap

| Period | Milestone |
|---|---|
| **Q3 2026 (Jul – Sep)** | First paid pilot signed. Deploy production backend (Render/Fly.io). Real cross-device OTP infrastructure live. |
| **Q4 2026 (Oct – Dec)** | 2–3 more pilots active. First hire (part-time BD). Sdn Bhd conversion upon first signed contract. |
| **Q1 2027 (Jan – Mar)** | Convert pilots to paid SaaS. Publish first public audit reports (with facility consent). |
| **Q2 2027 (Apr – Jun)** | 5+ paying Sarawak facilities. Expand pricing to insurance verification API. |

---

## 6. Team

### Randy Richard — Founder & Sole Developer

- 19 years old, from Miri, Sarawak
- Self-taught software engineer
- Built Sarawak MedChain solo over 7 months
- Shipped a working OTP demo within 24 hours of receiving community feedback
- Handles: product design, frontend, backend, smart contract, deployment, business development

### Hiring plan (post-first-contract)

- **Q3–Q4 2026:** Part-time Business Development contractor (Sarawak-based) — RM 3,000/month
- **Q1 2027 onwards:** Evaluate second technical hire (backend/DevOps)
- **Governance:** Convert to Sdn Bhd once first paid contract closes; add advisory board

### Advisory network (informal, in development)

- Community: Ketua Belia Miri
- State agency: SDEC contact
- Peer founders: developer network from Cradle LIVE! session

---

## 7. Financials

### Current state

- **Revenue:** Pre-revenue (intentional — free pilots as customer-acquisition)
- **Funding to date:** Bootstrapped from personal funds
- **Operating costs:** ~RM 500/month (domain, hosting, minimal expenses)
- **Founder runway:** 3–4 months at current burn

### The Ask — RM 50,000 to RM 150,000 (Cradle CIP Spark / MyStartup)

### Use of funds (RM 150,000 target allocation)

| Bucket | Amount | Purpose |
|---|---|---|
| **Production backend** | RM 40,000 | 12 months of Render/Fly.io + Redis + Postgres, IPFS pinning, monitoring |
| **Founder runway** | RM 30,000 | 4 months personal runway (RM 7,500/month) so I can focus 100% on pilots |
| **BD contractor** | RM 25,000 | Part-time Sarawak-based BD hire, ~6 months |
| **Sdn Bhd + legal** | RM 15,000 | Registration + Year-1 company secretary + basic legal review + accounting |
| **SGH pilot buffer** | RM 20,000 | Deployment costs + travel + on-site support for first paid pilot |
| **Marketing & travel** | RM 20,000 | Travel to Sarawak facilities, printed materials, pitch events |
| **Total** | **RM 150,000** | 12-month runway to 5 paying customers |

### Sensitivity: RM 50,000 (minimum viable ask)

If funded at CIP Spark minimum (RM 50k), we prioritise: production backend (RM 25k) + 3 months founder runway (RM 22.5k) + basic legal (RM 2.5k). Sacrifice: BD contractor, marketing budget.

---

## 8. Risk & Mitigation

| Risk | Mitigation |
|---|---|
| **KKM picks a KL vendor before Sarawak pilots** | Move fast on SGH POC in Q3 2026. Sarawak-first is our positioning; being live before KKM finishes studying is the moat. |
| **Non-tech users (elderly patients, guest doctors) can't use wallets** | Already shipped: OTP access mode. No app install required for doctor side. |
| **Blockchain "right to be forgotten" concerns under PDPA** | Documented in Privacy Policy §8: encrypted files can be unpinned + keys destroyed, rendering the on-chain hash meaningless. |
| **Single founder / bus factor** | Codebase is open-source; documentation being written; BD contractor hire in Q3 to spread ops load. |
| **Security incident** | Client-side encryption + no server-side master key means a breach cannot decrypt records. Regular security review post-Series A. |
| **Adoption resistance from hospital IT** | Interoperability positioning: MedChain plugs INTO existing systems (LHDN, SOCSO, EPF, KKM verification) via API, not another silo. |

---

## 9. Why Cradle / Sarawak Now

- **Timing:** the Minister's e-MC announcement is 9 days old. This funding window is time-limited.
- **Local advantage:** a Sarawak founder building in Sarawak for Sarawak. TEGAS and SDEC are ready to support Sarawak-first digital wins.
- **Political alignment:** MP Sibuti (former Deputy Health Minister) is Sarawakian; the e-MC direction aligns with his prior portfolio.
- **Fast-shipping demonstrated:** 7-month solo build, working product, real citations, no vaporware.
- **Free pilot offer already public** — waiting on the funded runway to execute at scale.

---

## Appendix

### A. Legal & Compliance

- **Legal entity:** Medchain Enterprise (SSM-registered June 2026)
- **Trading name:** Sarawak MedChain
- **Data residency:** all personal data hosted in Malaysia
- **Regulatory basis:** PDPA 2010 (Act 709) compliant Privacy Policy published
- **Governing law:** Terms of Service under Malaysian law, jurisdiction Kuching Sarawak

### B. Working URLs (verify these live)

- Landing: https://sarawak-medchain.pages.dev
- OTP demo: https://sarawak-medchain.pages.dev/#/otp
- Government preview: https://sarawak-medchain.pages.dev/#/gov-preview
- For Hospitals: https://sarawak-medchain.pages.dev/#/pitch
- Privacy Policy: https://sarawak-medchain.pages.dev/#/privacy
- Terms of Service: https://sarawak-medchain.pages.dev/#/terms
- GitHub: https://github.com/randyrichard/Sarawak-Medchain

### C. Founder contact

- **Randy Richard**
- **Email:** randyrjm99@gmail.com
- **Location:** Miri, Sarawak, Malaysia

---

*Prepared 30 June 2026 · Version 1.0*
