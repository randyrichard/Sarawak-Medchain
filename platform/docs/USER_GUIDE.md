# User Guide

Plain-language guide for the three self-service roles: **Doctors**, **Employers**,
and **Patients**.

---

## Doctors

**Signing in.** Use the email and initial password from your facility administrator.
You will be asked to set your own password on first login. Enable two-factor
authentication (key icon → Account security) — recommended for all doctors.

**Issuing a medical certificate.**
1. Doctor Portal → *Issue a medical certificate*.
2. Enter the patient's full name (as per IC), IC/passport, rest days, and start date.
3. Diagnosis is **optional and confidential** — it is never shown during verification.
4. *Issue & digitally sign*. The MC is signed with your key and its fingerprint is
   anchored on the blockchain. You get an MC number and a QR immediately.

**Sharing / printing.** Use **QR** to show a scannable code on screen, or **PDF** to
download the official certificate. Either can be verified by anyone.

**Correcting mistakes.** **Revoke** cancels an MC (permanent, visible to verifiers).
**Amend** supersedes it with a corrected MC. Both require a reason and are audit-logged.

**History.** Your issued certificates are listed newest-first; use **Load more** to
page through older ones.

---

## Employers

**Verifying a certificate — no account needed.** Scan the QR on the MC with any phone
camera. It opens the verification page showing **VALID / INVALID / REVOKED / EXPIRED /
TAMPERED**, the doctor, MMC number, clinic/hospital, issue date, and the digital-
signature and blockchain checks. The medical reason is never shown.

**With an account** you additionally get a verification history and can create **API
keys** (Employer Portal → HR system integration) to verify certificates in bulk from
your HR software (`POST /api/v1/verify/bulk`, up to 100 at a time).

**What the statuses mean.**
- **VALID** — authentic and currently within its rest period.
- **EXPIRED** — authentic, but the rest period has ended.
- **REVOKED** — cancelled or superseded by the issuing doctor.
- **TAMPERED** — the document has been altered; do not accept it.
- **INVALID** — no such certificate exists.

---

## Patients

**Registering.** Sign up with your IC. Certificates issued to your IC — even before
you registered — appear automatically in your portal.

**Your certificates.** View, **Download PDF**, or **Show QR**. Use **Share link** to
send a verification link to your employer; they see validity, never your diagnosis.

**Privacy.** Your IC is shown masked during verification and your diagnosis is never
disclosed. You control who you share the verification link with.

**Forgot your password?** Use the link on the sign-in page; you will receive a
one-time reset link valid for one hour.
