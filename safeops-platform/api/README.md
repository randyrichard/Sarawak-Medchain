# SafeChain API — authentication service

Server-side authentication and authorization for SafeChain. This exists because the controls it
provides (password hashing, token signing, lockout) are meaningless in a browser: a client can
always skip a check it performs on itself.

## Running locally

Requires Docker (for Postgres) and Node 20+.

```bash
docker compose -f ../docker-compose.yml up -d db   # Postgres on localhost:5433
cp .env.example .env
npm install
npm run keygen                                     # paste the two keys into .env
npm run prisma:migrate                             # create the schema
npm run seed                                       # demo users, Argon2id hashed
npm run dev                                        # http://localhost:4000
```

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | — | Verify credentials, issue access + refresh tokens |
| `POST` | `/auth/refresh` | refresh cookie | Rotate the session, issue a new access token |
| `POST` | `/auth/logout` | refresh cookie | Revoke server-side (`{"allDevices":true}` for all sessions) |
| `GET` | `/auth/me` | bearer | Current user and server-derived roles |
| `GET` | `/health` | — | Liveness |
| `GET` | `/health/ready` | — | Readiness (checks the database) |

## Security design

**Passwords** — Argon2id at OWASP parameters (19 MiB, t=2, p=1). Memory-hardness is the property
bcrypt lacks; it makes GPU cracking expensive. Digests are salted per hash.

**Access tokens** — RS256 JWTs, 15-minute default TTL. Asymmetric signing means the private key
never leaves this service. Verification pins `algorithms: ['RS256']`, which blocks the `alg:none`
and HS256-with-public-key confusion attacks.

**Refresh tokens** — opaque 48-byte random values, SHA-256 hashed at rest, so a database leak
yields no usable sessions. Each refresh rotates the token within a session *family*. Presenting an
already-consumed token means it leaked, so the entire family is revoked — a stolen session cannot
outlive its detection.

**Lockout** — failure counts and lockout windows live in the database, server-authoritative, so a
client cannot clear them. Per-IP rate limiting sits in front, because per-account lockout alone
still permits password spraying across many accounts.

**No user enumeration** — unknown accounts, wrong passwords, locked accounts, and deactivated
accounts all return one identical message, and unknown accounts still pay the Argon2 cost so
response timing does not distinguish them. The real reason is recorded in `LoginAttempt`.

**Secrets** — supplied only via environment variables and validated at boot; the process refuses
to start if any are missing. Nothing has a default value, because a default secret is no secret.

## Testing

```bash
npm test
```

38 tests covering hashing, timing equivalence, token forgery resistance, lockout, refresh
rotation, reuse detection, and logout revocation.
