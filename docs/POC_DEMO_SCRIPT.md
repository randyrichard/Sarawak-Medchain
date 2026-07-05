# Sarawak MedChain — POC Demo Script

A tight ~6-minute walkthrough that proves the product does what it claims:
**medical certificates that can't be faked.** Everything below runs on the
**live** site against a real public blockchain (Ethereum Sepolia testnet).

- Live site: https://sarawak-medchain.pages.dev
- Demo QR cards (open full-screen / print): `docs/poc-demo.html`
- Before you start: hard-refresh the site once (Ctrl+Shift+R) so you have the latest version.

---

## The one-sentence pitch
"Today, an MC is just a PDF anyone can Photoshop. We make each certificate
carry a cryptographic fingerprint anchored on a public blockchain, so anyone —
an employer, HR, a school — can verify it in two seconds by scanning a QR code,
with no login and no way to fake it."

---

## Part 1 — The problem (30 sec)
- Hold up any MC / show a normal MC PDF.
- "Employers have no way to check if this is real. Sick-leave fraud and forged
  MCs cost Malaysian businesses real money, and there's no central way to verify."

## Part 2 — Issue a certificate (90 sec)
1. Go to the site → **Sign in to MedChain** → click **Enter as Doctor**
   (demo mode — instant, no wallet needed for the walkthrough).
2. Fill the **Issue Medical Certificate** form: patient IC, name, a diagnosis,
   pick a duration. Sign in the signature box.
3. Click **Secure on Blockchain**.
4. "In a live clinic this writes the certificate's fingerprint to the blockchain
   and generates a QR code the patient gets on their MC."

> For the *real* on-chain version (with a live Etherscan transaction), sign in
> with the doctor's MetaMask wallet on Sepolia instead of demo mode. The two
> pre-made QR cards below already use real on-chain certificates.

## Part 3 — Verify a genuine certificate (60 sec)  ⭐ the money shot
1. Open `docs/poc-demo.html` on screen (or the printed card).
2. Ask someone in the room to **scan the GREEN "Genuine Certificate" QR** with
   their phone camera — no app, no login.
3. The verify page loads and shows a green **VERIFIED** badge, the certificate
   details, the issuing doctor's registered wallet, and a **"View on Etherscan"**
   link.
4. Tap **View on Etherscan** → "This is the actual public blockchain record.
   Nobody — not even us — can alter or delete it."

## Part 4 — Catch a forgery (60 sec)  ⭐ the proof
1. "Now watch what happens when someone tries to cheat. Same certificate — but a
   fraudster edited their sick leave from 2 days to 14 in the paperwork."
2. Have someone **scan the RED "Tampered Certificate" QR**.
3. The page shows a red **SECURITY ALERT: the record does not match the
   blockchain.** "The fingerprint no longer matches, so it's instantly rejected.
   That's the whole point — you can't edit an MC without breaking it."

## Part 5 — The bigger picture (60 sec)
- Back on the site, go through the sidebar to show it's a full system:
  - **Doctor Portal** — clinics issue certificates.
  - **Patient Portal** — patients hold their records and control who sees them.
  - **Admin Portal** — the Medical Council verifies which doctors can issue.
  - **CEO Dashboard** — hospital-level oversight and billing.
- "Role-based access is enforced by the blockchain itself — a patient physically
  cannot issue certificates, only registered doctors can."

## Close
"So: unforgeable certificates, verifiable by anyone in seconds, already running
live on a public blockchain. We're ready to run a pilot with a first clinic."

---

## Handling the tough question: "Can't someone just fake the QR code?"
This will come up — it's the sharpest question about the system, and the honest
answer builds credibility:

> "Good question. The blockchain makes the certificate's *data* impossible to
> alter secretly. The QR is a pointer to that record — so the two real risks are
> someone copying a genuine QR onto a forged paper, or pointing a QR at a fake
> look-alike site. We handle both: when you verify, the screen shows the *real*
> details straight from the blockchain — name, IC, dates, days — and prompts you
> to confirm they match both the certificate and the person in front of you. A
> copied or altered MC shows details that won't match, so it's caught. And the
> page reminds verifiers to trust only our official address, so a fake site
> doesn't fool anyone. Verification is a two-second check by a human comparing
> what's on screen to who's in front of them — that's the point."

You can demo this live: on the green VERIFIED screen, point out the amber
"confirm these match the person" callout and the highlighted name/IC.

## Fallback / troubleshooting
- **QR won't scan?** Open the link printed under each QR card directly in a browser.
- **Verify page says "network unreachable"?** The public blockchain RPC was briefly
  busy — tap **Try Again**; it retries a second RPC automatically.
- **Stuck on an old screen?** Hard-refresh (Ctrl+Shift+R).
- **Want the real on-chain issuance live?** Import the doctor wallet
  (`DOCTOR_PRIVATE_KEY` from the project `.env`) into MetaMask, switch to the
  **Sepolia** network, and use the Doctor Portal with a connected wallet instead
  of demo mode.

## The two demo certificates (already anchored on Sepolia)
| | Result | Verify link |
|---|---|---|
| **Genuine** | ✅ VERIFIED | https://sarawak-medchain.pages.dev/#/verify/0xd3c9a5e81bc3b421f874797b576bec3f557d061e45a0dc37460e3d43e1368884 |
| **Tampered** | 🚨 SECURITY ALERT | https://sarawak-medchain.pages.dev/#/verify/0x119cc20a7066ebf1ddcd7bf558e140fb4fba37b403bef2bb3873625da89b1e57 |
