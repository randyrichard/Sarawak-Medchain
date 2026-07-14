# Administrator Guide

For KKM (Super Admin), State Admins, and Hospital/Clinic Administrators.

## Roles at a glance

| Role | Provisioned by | Can do |
|---|---|---|
| Super Admin (KKM) | Seed / another Super Admin | Everything nationwide: approve/suspend facilities, provision facility admins, fraud queue, audit, analytics, exports |
| State Admin | Super Admin | Same as KKM but scoped to one state |
| Hospital / Clinic Admin | KKM/State Admin (via *Provision administrator*) | Manage doctors in their facility, facility analytics |
| Doctor | Facility Admin | Issue / revoke / amend MCs |
| Employer | Self-registration | Verify MCs, manage API keys |
| Patient | Self-registration | View own MCs, download, share |

## Onboarding a hospital or clinic (KKM / State Admin)

1. **Facility Registry → Register facility**: enter type, name, KKM/SSM registration
   number, state, district, address. It is created in **PENDING**.
2. **Approve** the facility. Only APPROVED facilities can register doctors or issue MCs.
3. **Provision administrator**: create the facility's admin account with an initial
   password. The admin is flagged **must-change-password** and is prompted to change
   it on first login.
4. Hand the credentials to the facility securely (out of band). The admin then
   registers the facility's doctors.

## Onboarding doctors (Facility Admin)

1. **Doctors → Register doctor**: full name, email, IC, **MMC number**, specialty,
   initial password (complexity enforced). A dedicated Ed25519 signing keypair is
   generated and encrypted at rest.
   *Production note: the MMC number is validated against the live MMC register at
   this step (integration seam).*
2. The doctor must change their initial password on first login.
3. **Suspend / Reinstate** controls a doctor's ability to issue. Suspended doctors
   are blocked at issuance and the attempt raises a fraud alert.

## Suspending a facility

Facility Registry → **Suspend** (with a reason). Every user at the facility is
notified and issuance is blocked immediately. Existing MCs remain verifiable with
their true status. **Reinstate** restores it.

## Fraud queue

Fraud Alerts lists engine-raised alerts (duplicates, volume anomalies, suspended
facility/doctor, tampering, geo anomalies) ranked by severity. Review each as
**Confirmed** or **Dismissed** — the decision is audit-logged.

## Audit trail & exports

- **Audit Trail** shows the hash-chained log. Super Admins can run
  *audit/integrity* to recompute the chain and prove no entry was altered.
- **Export CSV** downloads the audit trail (and MC search results) for offline
  review by auditors. Every export is itself audit-logged (`DATA_EXPORT`).

## Search

Search MCs by MC number, patient IC, doctor, MMC number, facility, or hash.
Results are scoped to your authority (state admins → their state; facility admins →
their facility). `POST /api/v1/search.csv` exports the same result set.

## Account recovery

Users who forget their password use **Forgot your password?** on the sign-in page.
A one-time link (valid 1 hour) is emailed (or shown directly in demo deployments
without an email provider). Completing a reset revokes all existing sessions.

## Security expectations for administrators

- Enable **two-factor authentication** (Account security → Two-factor). Strongly
  recommended for all admin and doctor accounts.
- Never share accounts; provision one account per person so the audit trail is
  attributable.
- Initial passwords are single-use — the must-change prompt is not optional hygiene,
  it is the control that stops shared/default credentials.
