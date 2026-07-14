# REST API Reference

Base URL: `https://api.emc.gov.my` (local: `http://localhost:3005`). All endpoints
are under `/api/v1`. Authenticated endpoints take `Authorization: Bearer <accessToken>`;
machine-to-machine endpoints take `X-Api-Key`.

Errors: `{ "error": string, "details"?: [...] }` with conventional status codes
(400 validation, 401 auth, 403 RBAC, 404, 409 conflict, 422 blocked by fraud rules,
423 locked, 429 rate limited).

## Auth — `/api/v1/auth` (rate-limited: 20/15 min)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/register` | public | Patient/employer self-registration → token pair |
| POST | `/login` | public | Email+password → tokens, or `{requiresTwoFactor, twoFactorToken}` |
| POST | `/login/2fa` | public | `{twoFactorToken, code}` → token pair |
| POST | `/refresh` | public | Rotate refresh token → new pair (reuse of a rotated token revokes all sessions) |
| POST | `/logout` | any | Revoke refresh token |
| POST | `/change-password` | any | `{currentPassword, newPassword}` — verifies current, enforces complexity, revokes all other sessions |
| POST | `/forgot-password` | public | `{email}` — begins account recovery; uniform response (no account enumeration) |
| POST | `/reset-password` | public | `{token, newPassword}` — completes reset; revokes all sessions |
| POST | `/2fa/setup` | any | Generate TOTP secret + `otpauth://` URL |
| POST | `/2fa/enable` | any | Confirm code, enable 2FA |

## Verification — `/api/v1/verify` (public path rate-limited: 120/15 min)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/:hash` | none | **The QR endpoint.** Returns result (`VALID/INVALID/REVOKED/EXPIRED/TAMPERED`), masked certificate details, and the three integrity checks (hash, signature, blockchain) |
| POST | `/bulk` | API key | Up to 100 hashes per call — HR system integration |

Example response:

```json
{
  "result": "VALID",
  "mc": {
    "mcNumber": "MC-2026-000001",
    "patientName": "Aisyah binti Rahman",
    "patientIcMasked": "990101-**-****",
    "restDays": 2, "startDate": "2026-07-12", "endDate": "2026-07-13",
    "doctorName": "Dr. Tan Wei Ming", "mmcNumber": "MMC-45678",
    "facilityName": "Sarawak General Hospital", "facilityState": "Sarawak",
    "status": "ACTIVE", "amended": false
  },
  "integrity": {
    "signatureValid": true,
    "hashIntact": true,
    "blockchain": { "checked": true, "anchored": true,
      "txHash": "0x…", "explorerUrl": "https://sepolia.etherscan.io/tx/0x…",
      "anchoredAt": "2026-07-12T03:21:00.000Z", "issuerVerifiedOnChain": true }
  },
  "checkedAt": "2026-07-12T06:00:00.000Z"
}
```

## Medical certificates — `/api/v1/mcs` (JWT)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | DOCTOR | Issue: fraud checks → canonical hash → Ed25519 sign → chain anchor → persist (422 with reasons if blocked) |
| GET | `/` | DOCTOR / PATIENT | Own certificates — cursor-paginated `{items, nextCursor}`; query `?take` (≤100) `?cursor` |
| POST | `/:id/revoke` | DOCTOR (issuer) | `{reason}` — permanent, audited, patient notified |
| POST | `/:id/amend` | DOCTOR (issuer) | `{reason, corrected:{…}}` — original → AMENDED, replacement issued & anchored |
| GET | `/:id/pdf` | issuer / patient | Official PDF with QR, hash, chain anchor |
| POST | `/:id/share` | PATIENT | Time-limited share link (7 days) |

## KKM / State admin — `/api/v1/admin` (SUPER_ADMIN, STATE_ADMIN; state-scoped)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/facilities` | List / register clinics & hospitals (`?status=PENDING`) |
| POST | `/facilities/:id/approve` · `/suspend` | Registry lifecycle (suspend takes `{reason}`, notifies facility users) |
| POST | `/facilities/:id/admins` | Provision hospital/clinic administrator accounts |
| GET | `/fraud-alerts` · POST `/fraud-alerts/:id/review` | Fraud queue (`UNDER_REVIEW/CONFIRMED/DISMISSED`) |
| GET | `/audit` | Tamper-evident audit trail (filter by action) |
| GET | `/audit.csv` | Export the audit trail as CSV (logged as `DATA_EXPORT`) |
| GET | `/audit/integrity` | SUPER_ADMIN: recompute the full hash chain |
| GET | `/analytics` | Totals, daily issuance, verification outcomes, by-state heatmap data, top facilities |

## Facility admin — `/api/v1/facility` (HOSPITAL_ADMIN, CLINIC_ADMIN; own facility only)

| Method | Path | Description |
|---|---|---|
| GET | `/me` | Facility profile + counts |
| GET/POST | `/doctors` | List / register doctors (generates signing keypair; MMC-registry validation point) |
| POST | `/doctors/:id/suspend` · `/reinstate` | Issuing privileges |
| GET | `/analytics` | Facility issuance stats, per-doctor volumes |

## Other

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/v1/search` | admins | `{type: mcNumber\|ic\|doctor\|mmc\|facility\|hash, q}` — scoped to role |
| POST | `/api/v1/search/csv` | admins | Same query, exported as CSV (logged as `DATA_EXPORT`) |
| GET | `/api/v1/openapi.json` | public | Machine-readable OpenAPI 3.0 contract |
| GET | `/api/v1/notifications` · POST `/:id/read` · POST `/read-all` | any | In-app notification feed; mark one or all read |
| GET/POST | `/api/v1/api-keys` · POST `/:id/revoke` | EMPLOYER | HR integration keys (plaintext shown once) |
| GET | `/healthz` · `/readyz` | none | Kubernetes probes |
