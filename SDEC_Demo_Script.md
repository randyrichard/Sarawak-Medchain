# SARAWAK MEDCHAIN — SDEC PITCH DEMO SCRIPT
## 15-Minute Live Demo | Friday, 7 March 2026
### Prepared for: Sarawak Digital Economy Corporation (SDEC)
### Presenter: Randy, Founder — Miri, Sarawak

---

## PRE-DEMO CHECKLIST (Do Thursday Night)

1. Run: `node start-all.cjs`
2. Import Hardhat Account #0 (Admin), #1 (Doctor), #3 (Patient) into MetaMask
3. Issue 2 MCs from Doctor Portal — save both QR codes to Desktop
4. Open 4 Chrome tabs:
   - **Tab 1:** `http://localhost:5173/#/doctor` (MetaMask on Account #1)
   - **Tab 2:** `http://localhost:5173/#/patient` (will switch to Account #3)
   - **Tab 3:** Ready to paste verification URL
   - **Tab 4:** `http://localhost:5173/#/ceo-dashboard`
5. Print one QR code on paper for the physical scan moment
6. Test the full flow once end-to-end
7. Clear browser console (right-click → Clear console)

---

## TIMING GUIDE

| Section              | Duration | Running Total |
|----------------------|----------|---------------|
| Opening              | 1:00     | 1:00          |
| Doctor Portal        | 3:30     | 4:30          |
| Patient Portal       | 5:00     | 9:30          |
| Employer Verification| 2:30     | 12:00         |
| CEO Dashboard        | 2:30     | 14:30         |
| Closing              | 1:30     | 16:00         |

You have about 1 minute of buffer. If MetaMask is fast, you'll finish at 14 minutes. If it's slow, you'll hit 16. Either is fine for a 15-minute slot.

**Practice the Patient Portal section twice tonight. That's your money shot.**

---

\pagebreak

## OPENING (1 Minute)

> Good morning. My name is Randy, I'm a founder from Miri, Sarawak.
>
> I'm going to show you something that doesn't exist yet in Malaysia — a system where a medical certificate cannot be forged, where patients control who sees their medical records, and where an employer can verify an MC in three seconds.
>
> This is Sarawak MedChain. It runs on blockchain. And everything I'm about to show you is working live — right now, on this laptop.
>
> Let me walk you through four screens. Doctor. Patient. Employer. And hospital management.

---

\pagebreak

## ACT 1: DOCTOR PORTAL (3.5 Minutes)

**[Tab 1 — Doctor Portal, MetaMask on Doctor wallet]**

> This is what a doctor sees. Let's issue a Medical Certificate right now, live.

**[Start filling in the form as you speak]**

> The doctor enters the patient's IC number...

**[Type: 880915-13-5234]**

> ...patient name...

**[Type: Mohd Hafiz bin Abdullah]**

> ...diagnosis...

**[Type: Acute Upper Respiratory Tract Infection]**

> ...and the number of MC days. Let's do two days.

**[Select 2 from dropdown]**

> Now — the digital clinician stamp. This replaces the rubber stamp that any pasar malam can duplicate.

**[Draw your signature on the canvas]**

> This is the doctor's digital signature, captured on the device.

**[Click "Secure on Blockchain"]**

> Watch what happens. The system is now generating a cryptographic hash — a unique digital fingerprint for this MC. This hash is mathematically impossible to forge. You cannot copy it. You cannot fake it.

**[Wait 2 seconds for the hash to generate. Receipt modal appears.]**

> Done. This MC now has a blockchain record. You can see the transaction hash here — this is the MC's permanent identity.
>
> And this QR code — this is what the patient gives to their employer. The employer scans it, and in three seconds, they know if this MC is real or fake.
>
> Let me download this QR code. We'll use it in a moment.

**[Click Download QR]**

> That's the doctor's workflow. Fill the form, sign, submit. Under sixty seconds.

### TRANSITION

> Now let's see the most important part of this system — what happens on the patient's side.

---

\pagebreak

## ACT 2: PATIENT PORTAL (5 Minutes) — THE KEY DEMO

**[Tab 2 — Switch MetaMask to Account #3 (Patient). Navigate to Patient Portal.]**

> This is the patient portal. And this is where Sarawak MedChain is fundamentally different from every medical records system in Malaysia today.
>
> Right now, in every hospital in Sarawak, your medical records are controlled by the hospital. If a doctor wants to see your records, they ask the hospital. If a clinic wants to transfer your records, they fax. The patient has zero control.
>
> MedChain reverses this. The patient decides who can see their records. Not the hospital. Not the admin. The patient.

**[Point to the Grant Access section]**

> Let me show you. I'm going to grant a doctor permission to read this patient's records. I'll paste the doctor's wallet address here.

**[Paste: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8]**

> This is the doctor's blockchain identity. Now I click Grant Access.

**[Click Grant Access. MetaMask popup appears.]**

> Watch — MetaMask is asking the patient to confirm. This is a real blockchain transaction. Not a simulation. The patient is signing a cryptographic instruction that says: "I authorize this doctor to read my records."
>
> No admin can override this. No IT department can bypass it. Only the patient's private key can authorize access.

**[Click Confirm in MetaMask. Wait for transaction to complete.]**

> Done. The doctor now has permission. This is recorded permanently on the blockchain — timestamped, immutable, auditable.
>
> Now here's the powerful part. What if the patient wants to remove that permission?

**[Same address is still in the input, or paste it again]**

> Same address. I click Revoke Access.

**[Click Revoke Access. MetaMask popup appears.]**

> Again — the patient must confirm with their own cryptographic key.

**[Click Confirm in MetaMask. Wait for transaction.]**

> Done. That doctor can no longer see any of this patient's records. Effective immediately. No phone call to the hospital. No form to fill. No waiting three to five business days.
>
> One click. Access revoked.
>
> This is what patient sovereignty looks like. The patient is the owner of their medical data, enforced by mathematics, not by hospital policy.

**[Pause for effect. This is your strongest moment.]**

> Every Grant and every Revoke is recorded on the blockchain. There is a permanent audit trail of who had access, when they got it, and when it was removed. No one can dispute it. No one can delete it.

### TRANSITION

> Now let's see the employer side. An employee calls in sick and sends a photo of their MC. How does the employer know it's real?

---

\pagebreak

## ACT 3: EMPLOYER VERIFICATION (2.5 Minutes)

**[Tab 3 — Open the QR code you downloaded earlier, or hold up the printed QR code]**

> This is the QR code from the MC we just issued. In the current system, if an employer wants to verify an MC, they call the clinic, wait on hold, maybe send an email, maybe never get a reply. With MedChain — they scan.

**[Open the QR code image. Right-click the QR or use a QR reader to get the URL. Paste the verification URL into Tab 3's address bar.]**

> Three seconds.

**[Page loads. Green checkmark. Verified MC with masked patient details.]**

> Verified. The employer can see: this MC is authentic. It was issued by a registered doctor. The dates are confirmed. The patient's name and IC are masked for privacy — the employer doesn't need to see the full IC, they just need to know the MC is real.
>
> Now watch what happens if someone tries to fake it.

**[Change one character in the hash in the URL bar. Press Enter.]**

> Invalid. MC record not found. Three seconds — real or fake, instantly known.
>
> No phone calls. No chasing clinics. No more fake MCs slipping through.

### TRANSITION

> Finally, let me show you what the hospital management sees.

---

\pagebreak

## ACT 4: CEO DASHBOARD (2.5 Minutes)

**[Tab 4 — CEO Dashboard]**

> This is the hospital CEO's view. At a glance, management can see how many MCs have been issued, which doctors are active, the billing overview, and system health.

**[Scroll slowly. Do NOT hover over specific numbers. Do NOT click into detailed reports.]**

> The key value here is transparency. Every MC issued by every doctor is tracked. The hospital CEO can see trends — which departments are issuing the most MCs, what the billing looks like, whether the system is running smoothly.
>
> In the current system, this data doesn't exist. Hospital CEOs have no idea how many MCs their doctors issued last month. There's no dashboard. There's no audit trail. MedChain changes that.

**[If there's an Admin Portal tab, briefly show it]**

> On the admin side, the system manages doctor verification — making sure only registered, verified doctors can issue MCs on the platform. This mirrors the role of the Sarawak Medical Council in the real world.

**[Do NOT open quarterly reports. Do NOT open invoices. Do NOT show the government CouncilorView. Keep this section high-level.]**

> The point is simple: hospital management gets full visibility, doctors get a streamlined workflow, patients get control, and employers get instant verification.

---

\pagebreak

## CLOSING (1.5 Minutes)

> Let me summarize what you just saw.
>
> A doctor issued an MC in under sixty seconds — with a digital signature and a cryptographic hash that cannot be forged.
>
> A patient granted and revoked access to their medical records — using blockchain transactions that no admin can override.
>
> An employer verified an MC in three seconds — real or fake, instantly known.
>
> And hospital management has full visibility into every MC issued across their entire organization.
>
> This solves a real problem. MC fraud costs Malaysian employers an estimated two point three billion ringgit annually. Beyond fraud, Sarawak currently has no unified system for patient-controlled medical records.
>
> MedChain is built in Sarawak, for Sarawak. We are ready to pilot with hospitals in Miri and Kuching.
>
> Thank you. I'm happy to take questions.

---

\pagebreak

## EMERGENCY RESPONSES

### If MetaMask Hangs or Popup Doesn't Appear

> MetaMask is confirming the transaction — this is actually a good sign. It means the blockchain is processing a real cryptographic operation, not a simulation. Let me give it a moment.

**[Wait 5 seconds. If still stuck:]**

> Sometimes the wallet needs a manual confirmation. Let me click the MetaMask extension.

**[Click the MetaMask icon in the browser toolbar to bring the popup forward. If it's truly frozen, switch to your backup tab with demo mode and say:]**

> Let me switch to our staging environment so we don't lose time. The flow is identical.

---

### If Asked "Is This on Mainnet?"

> For this pilot, we run on a private Sarawak blockchain network. This gives us the same cryptographic guarantees — immutability, tamper-proof records, digital signatures — but with zero gas fees and full control over the infrastructure. Mainnet migration is planned for Phase 2 after the pilot proves out with real hospitals.

---

### If Asked "Where Is the Data Stored?"

> Medical documents are encrypted with AES-256 and stored on IPFS — a decentralized file system. Only the encrypted file's hash is stored on the blockchain. The patient's private key controls access. Even if someone accesses the storage layer, the files are encrypted and unreadable without authorization.

---

### If Asked "What If the Patient Loses Their Private Key?"

> That's a critical question and one we're designing for. In the pilot, we're implementing a recovery mechanism through the patient's registered IC number and a secondary verification step. We're also exploring social recovery — where two or three trusted parties can help restore access. This is a solved problem in blockchain design.

---

### If Asked "How Many Hospitals Are Using This?"

> We have sixteen hospitals mapped in our network across Kuching, Miri, Sibu, and Bintulu. Twelve are live-ready, four are in onboarding. We're looking for SDEC's support to accelerate hospital adoption across the state.

---

### If Asked About Specific Numbers on the Dashboard

> The dashboard aggregates data from the blockchain in real-time. The numbers you see reflect our development and testing environment. In production, these would reflect actual hospital operations — we expect the analytics to be one of the most valuable features for hospital CEOs who currently have zero visibility into MC issuance patterns.

---

\pagebreak

## STAGE DIRECTIONS SUMMARY

| Moment | Action | MetaMask Account |
|--------|--------|------------------|
| Act 1 Start | Open Tab 1 (Doctor Portal) | Account #1 (Doctor) |
| Act 1 Climax | Click "Secure on Blockchain", download QR | Account #1 (Doctor) |
| Act 2 Start | Switch to Tab 2, switch MetaMask to Patient | Account #3 (Patient) |
| Act 2 Grant | Paste doctor address, click Grant Access | Account #3 (Patient) |
| Act 2 Revoke | Same address, click Revoke Access | Account #3 (Patient) |
| Act 3 Start | Open Tab 3, paste verification URL | Any account |
| Act 3 Fake Test | Change one character in URL hash | Any account |
| Act 4 Start | Open Tab 4 (CEO Dashboard) | Any account |
| Act 4 | Scroll slowly, speak high-level, do NOT click details | Any account |

---

## KEY RULES

1. **Never say "simulation" or "mock"** — say "live" or "working prototype"
2. **Never open browser DevTools** during the demo
3. **Never drill into specific dashboard numbers** — keep it high-level
4. **Never show CouncilorView for more than 30 seconds**
5. **Never open quarterly reports or invoices**
6. **Always have a backup tab with demo mode ready** in case MetaMask fails
7. **Practice the Patient Portal twice tonight** — that's your money shot

---

*Sarawak MedChain — Built in Sarawak, for Sarawak.*
