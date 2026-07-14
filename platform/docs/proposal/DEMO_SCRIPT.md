# Live Demonstration Runbook (10–15 minutes)

A step-by-step script for demonstrating Sarawak MedChain to KKM stakeholders. Every
step below is performed on the **live system** unless explicitly marked *(explained,
not clicked)*.

- **Web application:** https://emc-web-i0gf.onrender.com
- **Demo accounts** (all password `Emc-Demo-Pass1`):
  - Doctor — `dr.tan@sgh.gov.my`
  - Patient — `patient@demo.com.my` (registered IC: **`990101-13-5678`**)
  - KKM Super Admin — `kkm.admin@emc.gov.my`
- **Use the patient's registered IC** (`990101-13-5678`) when issuing in Segment 2 —
  that is what makes the certificate appear automatically in the patient's portal in
  Segment 3, and what the duplicate check trips on in Segment 5.
- **Blockchain note to state up-front:** anchoring in this PoC uses the Ethereum
  Sepolia *test* network. Production would use a government consortium chain or an L2.

---

## Pre-flight checklist (do this 5 minutes before the audience arrives)

1. **Wake the services.** The PoC runs on a low-cost tier that sleeps when idle —
   the first request can take ~30–60 seconds. Open the web URL and log in once so the
   app and API are warm.
2. Open **three browser tabs**, pre-logged-in where possible:
   - Tab A — Doctor portal (`/dashboard/doctor`)
   - Tab B — a second browser/incognito for the Patient
   - Tab C — KKM admin (`/dashboard/admin`)
3. Have a **phone with a camera** ready to scan an on-screen QR (or use Tab B to open
   the verify link — both work).
4. **Clear any leftover active MC for the demo patient.** In the Doctor portal, if an
   active certificate already exists for IC `990101-13-5678` covering today (from a
   previous rehearsal), **revoke it first** — otherwise Segment 2's issuance will be
   correctly, but inconveniently, blocked as a duplicate. Starting clean makes the
   duplicate demonstration in Segment 5 land as intended.

---

## Segment 1 — The problem (1 minute, talk)

> "Today an employer who receives an MC has no fast way to know if it's real. A PDF
> can be edited, a signature copied, an MMC number invented. Verification means
> phoning the clinic. We're going to make an MC impossible to forge and verifiable in
> seconds — while keeping the patient's diagnosis private."

---

## Segment 2 — Doctor issues an MC (2–3 minutes)

*Tab A, logged in as `dr.tan@sgh.gov.my`.*

1. Point out this is a verified doctor at Sarawak General Hospital with their own
   digital signing identity.
2. In **Issue a medical certificate**, enter: patient name (e.g. *Aisyah binti
   Rahman*), IC **`990101-13-5678`**, rest days (e.g. 2), start date (today). Leave
   diagnosis blank or note *"it's optional and never shown at verification."*
3. Click **Issue & digitally sign**.
4. Narrate what just happened: *"In that one click the certificate was digitally
   signed with the doctor's key, its cryptographic fingerprint was computed, and that
   fingerprint was anchored on a public blockchain."* Point to the **ON-CHAIN** badge.
5. Click **QR** to show the on-screen verification code.

> **Talking point:** "Nothing secret went onto the blockchain — only a 32-byte
> fingerprint. The patient's identity and diagnosis stay encrypted in the database."

---

## Segment 3 — Patient receives it (1–2 minutes)

*Tab B, logged in as `patient@demo.com.my`.*

1. Show **My medical certificates** — the certificate just issued to this IC appears
   automatically.
2. Click **Download PDF** — show the official certificate with its QR code and
   fingerprint.
3. Click **Show QR** / **Share link** — *"the patient controls who they share this
   with; the employer sees validity, never the diagnosis."*

---

## Segment 4 — Employer verifies (2–3 minutes) — the key moment

*Scan the QR with a phone camera, or open the verify link in Tab B.*

1. The public verification page loads with a large **VALID** banner. **No login was
   required.**
2. Walk through the checks shown:
   - **Doctor** and **MMC number** — from the registry.
   - **Clinic / hospital** and **issue date**.
   - **Data integrity: PASS** — the record matches its fingerprint.
   - **Doctor's digital signature: PASS**.
   - **Blockchain anchor** — with a link to the public transaction.
   - **IC masked, diagnosis absent** — privacy preserved.
3. **Contrast — an unknown certificate.** Edit the URL hash (or open
   `/verify/0x` + 64 arbitrary hex) → **INVALID**. *"A fabricated MC simply does not
   exist in the registry."*

> **Talking point:** "If anyone had edited a single field — the dates, the name, the
> rest days — the fingerprint would no longer match and this page would show
> **TAMPERED**. That tamper-detection is verified in our automated test suite and can
> be shown on a prepared record on request." *(explained; the live edit path is a
> database action, not a public button.)*

---

## Segment 5 — Fraud detection, live (1–2 minutes)

*Tab A, as the doctor.*

1. Try to issue a **second** MC for the **same IC** (`990101-13-5678`) covering an
   overlapping period.
2. The system **blocks it** with a clear message: the patient already holds an active
   MC for that period.
3. Switch to **Tab C (KKM)** → **Fraud Alerts**: the duplicate attempt is already in
   the queue, ranked by severity, ready for review.

> **Talking point:** "The engine also flags impossible issuance volumes, suspended
> doctors or clinics, and logins from implausible locations — automatically."

---

## Segment 6 — Revocation (1 minute)

*Tab A, as the doctor.*

1. On the original MC, click **Revoke**, give a reason, confirm.
2. Re-open the verification page for that MC (re-scan / refresh Tab B): it now shows
   **REVOKED** in red, with the reason. *"Revocation is instant and visible to every
   verifier — no recall notice, no phone tree."*

---

## Segment 7 — KKM oversight & audit (1–2 minutes)

*Tab C, as `kkm.admin@emc.gov.my`.*

1. **Overview** — national analytics: MCs issued, verification outcomes, issuance by
   state, top facilities.
2. **Audit Trail** — every action we just performed (issue, verify, duplicate attempt,
   revoke) is here, attributed and timestamped.
3. Click **Export CSV** — *"auditors get a portable copy; every export is itself
   logged."*
4. *(Optional, technical audience)* Mention the audit log is **hash-chained** and the
   platform can mathematically prove it has not been altered — a one-call integrity check.

---

## Closing (30 seconds)

> "In twelve minutes we issued a certificate that is digitally signed, blockchain-
> anchored and instantly verifiable; we blocked a duplicate; we revoked one; and we
> reviewed a complete audit trail — all while keeping the diagnosis private. Fake,
> edited, duplicated and expired MCs all become detectable. The remaining work to
> deploy this nationally is integration and infrastructure — MMC registry, MyDigital
> ID, government hosting — not the core anti-fraud engine, which is working in front
> of you today."

---

## If something goes wrong (contingencies)

- **Slow first load** → it's the idle-tier cold start; wait ~30–60 s, or re-run the
  pre-flight warm-up.
- **A login shows "too many attempts"** → the auth rate-limiter (a security feature)
  triggered from repeated testing; wait a minute or use a different demo account.
- **Blockchain badge shows DEMO instead of ON-CHAIN** → anchoring is toggled off or
  the anchoring wallet needs testnet funds; the signature and integrity checks still
  demonstrate the full anti-fraud story, and anchoring can be re-enabled in settings.
- **Keep a screen-recording of a successful run** as a fallback in case of venue
  network issues.
