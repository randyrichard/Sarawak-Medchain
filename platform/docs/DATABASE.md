# Database Schema & ER Diagram

PostgreSQL via Prisma. Source of truth: [`api/prisma/schema.prisma`](../api/prisma/schema.prisma).

## ER diagram

```mermaid
erDiagram
    User ||--o| Doctor : "has profile"
    User }o--o| Facility : "belongs to"
    User ||--o{ RefreshToken : "sessions"
    User ||--o{ ApiKey : "HR integration"
    User ||--o{ Notification : "receives"
    User ||--o{ MedicalCertificate : "patient of"

    Facility ||--o{ Doctor : "employs"
    Facility ||--o{ MedicalCertificate : "issued at"

    Doctor ||--o{ MedicalCertificate : "issues + signs"

    MedicalCertificate ||--o{ VerificationEvent : "verified by"
    MedicalCertificate ||--o{ ShareToken : "shared via"
    MedicalCertificate |o--o| MedicalCertificate : "amends"

    FraudAlert }o--o| MedicalCertificate : "flags"
    AuditLog }o--o| User : "actor"

    User {
        string id PK
        string email UK
        enum role "7 roles"
        string icEncrypted "AES-256-GCM"
        string icHash UK "HMAC search digest"
        string totpSecretEncrypted
        datetime lockedUntil
    }
    Facility {
        string id PK
        enum type "HOSPITAL | CLINIC"
        string registrationNo UK
        enum status "PENDING/APPROVED/SUSPENDED/REJECTED"
        string state
    }
    Doctor {
        string id PK
        string mmcNumber UK
        enum status
        string signingPublicKey "Ed25519 SPKI PEM"
        string signingKeyEncrypted "KMS-wrapped PKCS8"
    }
    MedicalCertificate {
        string id PK
        string mcNumber UK
        string patientIcEncrypted
        string patientIcHash "search key"
        string diagnosisEncrypted "optional, never verified against"
        string canonicalHash UK "keccak-256, on-chain"
        string signature "Ed25519 over hash"
        boolean anchored
        string chainTxHash
        enum status "ACTIVE/REVOKED/AMENDED"
    }
    VerificationEvent {
        string id PK
        enum result "VALID/INVALID/REVOKED/EXPIRED/TAMPERED"
        string ip
        string verifierType
    }
    FraudAlert {
        string id PK
        enum type "8 detectors"
        enum severity
        enum status
        json details
    }
    AuditLog {
        bigint seq PK "monotonic"
        enum action
        string prevHash "chain link"
        string entryHash UK
    }
```

## Design decisions

- **PII encryption**: `icEncrypted` / `diagnosisEncrypted` are AES-256-GCM with a
  KMS-managed key; `icHash`/`patientIcHash` are HMAC-SHA256 digests enabling exact
  search without a plaintext index. Dumping the DB yields no usable identities.
- **Diagnosis is quarantined**: optional, encrypted, excluded from the canonical hash,
  and structurally absent from all verification responses.
- **`canonicalHash` is the public identity** of an MC. It is what the QR encodes,
  what the chain stores, and what employers query. Unique index makes verification a
  single lookup.
- **Amendments preserve history**: an amended MC keeps its row and chain anchor;
  the replacement links back via `amendedFromId`. Verifying the old hash reports the
  supersession.
- **Audit log is append-only + hash-chained**: `entryHash = SHA-256(prevHash | actor |
  action | entity | meta | timestamp)`. A single UPDATE or DELETE anywhere in history
  breaks the chain, detectable via the integrity endpoint.
- **Walk-in patients**: MCs reference the patient by IC digest, not by account.
  When the patient later registers, `patientUserId` back-links automatically.

## Migrations

```bash
cd platform/api
npx prisma migrate dev      # development
npx prisma migrate deploy   # CI / production
```
