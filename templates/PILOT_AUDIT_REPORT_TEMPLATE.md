# Sarawak MedChain — 30-Day Pilot Audit Report

> **Confidential.** Prepared for [Agency / Facility Name] under the Sarawak MedChain 30-Day Free Pilot Programme. Distribute to authorised recipients only.

---

## Cover Page

| Field | Value |
| --- | --- |
| **Pilot Facility** | [Clinic / Hospital Name] |
| **Facility Address** | [Street, District, Sarawak] |
| **Facility Lead** | [Dr. Name, Role] |
| **Pilot Sponsor (Government)** | [Agency / Officer Name, Title] |
| **Pilot Window** | [Start Date] – [End Date] (30 days) |
| **Report Issued** | [DD Month YYYY] |
| **Report Author** | Randy Richard, Founder — Sarawak MedChain |
| **Founder Contact** | randyrjm99@gmail.com |
| **Report Version** | 1.0 |

---

## 1. Executive Summary

A single page. Three things only:

1. **What we ran** — [Facility Name] issued [N] medical certificates and onboarded [N] patients over [N] days using Sarawak MedChain.
2. **What we found** — [headline finding: e.g., zero tampering events detected; X% time saved per MC; Y patients used self-service consent revocation; etc.]
3. **What we recommend** — [next step: scale to X clinics in District Y, or extend pilot, or decline. Be specific.]

Keep this section under 250 words. Decision-makers read this and nothing else.

---

## 2. Pilot Scope & Methodology

### 2.1 Scope

- **Facility type:** [Klinik Kesihatan / Private GP / Specialist Clinic / etc.]
- **Patient population:** [estimated patients seen during pilot window]
- **MC volume baseline:** [historical monthly MCs at this facility, pre-pilot]
- **Personnel onboarded:** [N doctors, N admin staff]
- **Data scope:** [MC issuance only / MC + clinical notes / MC + patient records]

### 2.2 Methodology

Each medical certificate issued during the pilot was:

1. Generated through the Sarawak MedChain Doctor Portal
2. Encrypted client-side (AES-256-GCM) before leaving the facility
3. Uploaded to IPFS storage; cryptographic hash recorded on a public smart contract
4. Verifiable by employer or government agent via the public verification page

No patient identifying information was placed on-chain. Only cryptographic hashes were committed to the public ledger.

### 2.3 Out of Scope

State clearly what the pilot did **not** test. E.g.:

- Integration with existing HIS / EMR systems
- Bahasa Malaysia patient-facing interface
- High-volume load (>500 MCs/day)
- Cross-facility patient handover

---

## 3. Operational Findings

### 3.1 Volume Metrics

| Metric | Pre-Pilot Baseline | Pilot Result | Δ |
| --- | --- | --- | --- |
| MCs issued per day (avg) | [N] | [N] | [±%] |
| Time to issue one MC (sec) | [N] | [N] | [±%] |
| MC printing & paper cost (RM/month) | [N] | [N] | [±%] |
| Patient consent revocations honoured | N/A | [N] | — |

### 3.2 Fraud / Tampering Detection

| Event | Count |
| --- | --- |
| MC verification attempts (public scans) | [N] |
| Verification failures (invalid hash) | [N] |
| Unauthorised access attempts to patient records | [N] |
| Confirmed tampering events | **0** |
| Confirmed forgery events | **0** |

If any non-zero events occurred, narrate them honestly. Do not hide failures.

### 3.3 User Experience

- **Doctor onboarding time:** [N minutes from cold to first MC issued]
- **Patient onboarding:** [pattern observed — e.g., 80% used QR code on phone, 20% printed]
- **Support tickets raised:** [N] (categorised: technical / training / billing)
- **Feedback themes from staff:** [3-5 quotes or themes]

---

## 4. Compliance Attestations

| Standard / Regulation | Status | Evidence |
| --- | --- | --- |
| PDPA 2010 — Data resident in Malaysia | ✅ / ⚠️ / ❌ | [hosting region, processor agreement reference] |
| MOH Documentation Standards alignment | ✅ / ⚠️ / ❌ | [which fields are present in issued MCs] |
| Encryption at rest (AES-256-GCM) | ✅ | [encryption library + key management notes] |
| Encryption in transit (TLS 1.3) | ✅ | [hosting certificate authority] |
| Audit trail — immutable | ✅ | [contract address + block explorer link] |
| Patient consent — explicit | ✅ | [on-chain grantAccess / revokeAccess event count] |
| Right to erasure | ⚠️ | [explain hash-on-chain vs encrypted-payload-off-chain handling] |

> **Honesty note for founder:** Right-to-erasure on a public ledger is nuanced. The on-chain hash cannot be deleted, but the encrypted payload on IPFS can be unpinned and the encryption keys destroyed, rendering the hash useless. State this clearly — do not claim full deletion.

---

## 5. Public Health Insights (Aggregated, De-Identified)

Only include this section if the pilot facility consents and PDPA conditions are met.

- Top 3 conditions documented in MCs: [list]
- Geographic distribution of patients (district-level only): [list]
- Day-of-week / time-of-day patterns: [observed]
- Average MC duration issued: [N days]

State explicitly: *No individual patient is identifiable from this aggregation. Cell sizes below 5 patients have been suppressed.*

---

## 6. Technical Architecture (Briefing)

Half a page. For agency IT reviewers:

- **Frontend:** React + Vite, hosted on Cloudflare Pages (edge-cached globally; primary region: Malaysia)
- **Backend:** Node.js / Express, [hosting region]
- **Storage (encrypted payloads):** IPFS pinned to [provider, region]
- **Ledger:** Ethereum-compatible smart contract (Solidity 0.8.x) — pilot deployed on [Sepolia testnet / Polygon / private chain]
- **Encryption:** AES-256-GCM, keys held by patient (browser-side)
- **Authentication:** MetaMask wallet signatures (EIP-191)

Smart contract code is open source: github.com/randyrichard/Sarawak-Medchain

---

## 7. Risks & Limitations Observed

Be candid. A report that lists no risks reads as a sales pitch.

1. **Wallet onboarding friction** — [observation, mitigation]
2. **Internet dependency for verification** — [observation, mitigation, offline plan]
3. **Pilot scale ≠ production scale** — [what is unproven at higher volume]
4. **Single-facility pilot ≠ network effect** — [what only multi-facility pilot can prove]

---

## 8. Recommendations

Three concrete options. Make the recommendation; let the agency disagree.

### Option A — Expand
Scale to [N] facilities across [N] districts over the next [N] months. Estimated cost: RM [N]. Expected outcome: [N] patients covered.

### Option B — Iterate
Extend pilot at this facility for another 60 days to test [specific unproven thing]. Estimated cost: RM [N].

### Option C — Decline
Pilot did not meet [criteria]. Do not proceed.

**Founder's recommendation:** [pick one and defend it in 3 sentences.]

---

## 9. Appendices

### A. Smart Contract Reference
- Network: [Sepolia / Polygon / private]
- Contract address: [0x…]
- Block explorer: [link]
- Contract source: [github link]

### B. Sample Audit Trail Events
[Copy 5–10 representative events from the on-chain log: timestamp, event type, actor address, patient address hash]

### C. Pilot Participant Consent Form (Reference)
[Reference to the actual signed consent forms — kept on file, not reproduced here]

### D. Glossary
- **MC** — Medical Certificate
- **IPFS** — InterPlanetary File System; content-addressed storage
- **Hash** — One-way cryptographic fingerprint
- **Smart contract** — Self-executing code on a public ledger
- **AES-256-GCM** — Symmetric encryption standard

---

**Report ends. No claims beyond this page are authorised under the pilot agreement.**

*Signed,*

Randy Richard
Founder, Sarawak MedChain
randyrjm99@gmail.com
[Date]
