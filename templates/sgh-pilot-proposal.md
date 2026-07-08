# Pilot Proposal — Sarawak MedChain × Sarawak General Hospital

**Prepared by:** Randy Richard, Founder, MedChain Enterprise
**Date:** June 2026
**Status:** Draft v1 — to be refined after meeting with Dr Steve and SGH stakeholders
**Cost to SGH:** RM 0

---

## Objective

Validate that patient-controlled medical records work in a real clinical setting at SGH, measuring doctor adoption, patient comprehension, and technical reliability over a 4-week period.

This is a **parallel pilot** — it does not replace or interfere with SGH's existing record system. Clinical decisions during the pilot continue to rely on SGH's primary system.

---

## Scope

| Dimension | v1 Pilot |
|---|---|
| Duration | 4 weeks |
| Doctors | 3, from a single department (suggested: General Medicine or any clinic Dr Steve oversees) |
| Patients | 20 consenting outpatients |
| Records | Outpatient consultation notes (text + simple attachments) |
| Site | One SGH clinic, single specialty |
| Cost to SGH | RM 0 — all infrastructure covered by MedChain Enterprise |

---

## What SGH Provides

- 3 doctor accounts (we verify on-chain via the admin role)
- Recruitment of 20 willing patients (with informed consent)
- One small meeting room for ~2 hours of patient onboarding
- Departmental sign-off from Dr Steve (or designated supervisor)
- 1 nominated SGH IT contact for technical liaison (very light touch — ~1 hour/week)

## What MedChain Enterprise Provides

- The full platform — smart contract, backend, frontend
- One 90-minute training session for the 3 doctors
- On-site patient onboarding (MetaMask wallet setup + walkthrough) — Randy on-premises Day 1
- Ongoing technical support throughout the 4 weeks (WhatsApp + email)
- Weekly status reports to Dr Steve
- Final report (clinical, technical, UX findings) at end of pilot
- All cloud, IPFS pinning, and RPC infrastructure costs

---

## Success Metrics

| Metric | Target |
|---|---|
| Records uploaded per consulted patient | ≥ 80% |
| Platform uptime during clinic hours | ≥ 99% |
| Patient access-grant events logged | ≥ 50 across pilot |
| Doctor satisfaction (NPS, end of pilot) | ≥ 7/10 |
| Unauthorized access incidents | 0 |

---

## Out of Scope (deliberately deferred to a v2 pilot)

- Integration with SGH's existing HIS/EMR (this v1 is parallel, manual entry)
- Inpatient or emergency department workflows
- Imaging / DICOM / lab results
- Insurance claim integration
- Multi-hospital network features

We're deliberately keeping v1 small so the team can finish it, learn from it, and present a real result — not get stuck negotiating a big-bang integration.

---

## Risk & Safety

- **Parallel system, not replacement.** SGH's existing records remain the source of clinical truth during pilot. MedChain entries are a copy for evaluation.
- **Informed consent.** Each pilot patient signs a consent form (joint MedChain + SGH MAC review) before being onboarded.
- **PDPA 2010 compliance.** All patient data stored on infrastructure located in Malaysia. Encryption keys are held by the patient (via MetaMask), not by us.
- **Withdrawal at any time.** Any patient or doctor can withdraw from the pilot without explanation. Their data is revoked on-chain immediately.
- **Open-source contract.** The smart contract source is published — SGH IT can audit it before pilot start.

---

## Timeline (after SGH approval)

| Week | Activity |
|---|---|
| Week –2 | Joint sign-off on consent form. SGH MAC review (if required). |
| Week –1 | Patient recruitment by SGH. Doctor onboarding (90-min session). |
| **Week 1** | Pilot start. Randy on-site Day 1 for patient onboarding. Daily check-ins. |
| Week 2 | First weekly report to Dr Steve. Mid-week support call. |
| Week 3 | Mid-pilot review meeting. Adjustments if needed. |
| Week 4 | Final week. Doctor + patient NPS surveys collected. |
| Week +1 | Final report delivered to Dr Steve and SDEC. |

---

## What Happens After the Pilot

The joint outcome — pilot report — is delivered to **Dr Steve, SGH leadership, and SDEC**. It informs whether and how to design a Phase 2:

- Larger department, more doctors and patients?
- HIS/EMR integration as a real project?
- Cross-hospital portability (Miri ↔ Kuching ↔ Sibu)?

Phase 2 is a separate conversation with separate sign-off. No commitment is implied by participating in the pilot.

---

## Single Page Summary

> SGH lends us **3 doctors + 20 patients + 1 small clinic** for 4 weeks.
> We bring **the platform, the training, and the support — at no cost**.
> At the end, everyone gets **a clean report on what worked and what didn't.**
> If it didn't work, we walk away clean. If it did, SDEC and SGH have a real data point to plan Phase 2 from.

---

## Contact

**Randy Richard**
Founder, MedChain Enterprise
📱 [your phone]
✉️ randyrjm99@gmail.com
🔗 https://sarawak-medchain.pages.dev
