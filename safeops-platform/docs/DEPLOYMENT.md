# DEPLOYMENT

Putting SafeOps on a server for a pilot customer.

> **The container images in this repository have never been built.** The machine this was
> developed on has no Docker, no Podman and no WSL, so `docker build` and
> `docker compose up` could not be executed. Every command the images run has been verified
> natively — `npm ci`, `npx prisma generate`, `npm run build`, `npm start`, `prisma migrate
> deploy` — and the production entrypoint boots and serves. But the images themselves are
> unproven. Budget half a day for the first build, and expect to fix something.

## Shape

```
                    TLS terminated here (load balancer, Caddy, or your nginx)
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              safeops-web                     safeops-api
              nginx :8080                     node :4000, ONE instance
              static bundle                   scheduler runs in-process
                                                    │
                                              postgres:16  (not published)
                                                    │
                                    ┌───────────────┼───────────────┐
                              pgdata volume   uploads volume   backups volume
```

**One API instance.** The reminder sweeps run inside it. Two instances would each sweep;
the dedupe makes that harmless rather than duplicating, but there is no reason to take the
risk in a pilot. If you must scale out, set `SCHEDULER_ENABLED=false` on every instance but
one.

**Postgres is not published.** Only the API reaches it, over the compose network.

**TLS is not in the compose file.** Terminate it at whatever already fronts your
infrastructure. Rolling ACME into a pilot compose file means debugging certificates instead
of the product.

## 1. Configure

```bash
cd safeops-platform && cp .env.prod.example .env.prod
```

Generate the signing keys and paste both values into `.env.prod`:

```bash
cd safeops-platform && npm run keygen
```

Generate a database password:

```bash
openssl rand -base64 24
```

### The two settings that will bite you

**`CORS_ORIGINS` and `VITE_API_BASE_URL` must match your real hostnames.**
`VITE_API_BASE_URL` is compiled into the browser bundle at build time — changing it needs a
rebuild, not a restart.

**Web and API must share a registrable domain.** The refresh cookie is
`sameSite=strict`, so `app.example.com` + `api.example.com` works and
`safeops.vercel.app` + `safeops.onrender.com` does not — the browser will silently refuse
to send the cookie and no session will survive a page reload. Decide this before the first
deploy.

## 2. Build and start

```bash
cd safeops-platform && docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

```bash
cd safeops-platform && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Migrations run automatically before the API accepts traffic — the container's command is
`prisma migrate deploy && node dist/server.js`, so it can never serve against a schema it
does not expect.

## 3. Verify the deploy

```bash
curl -fsS https://api.example.com/health
```

```bash
curl -fsS https://api.example.com/health/ready
```

`/health` is liveness — the process is up. `/health/ready` checks the database and returns
503 when it is unreachable. Point your orchestrator's readiness probe at the second and its
liveness probe at the first.

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Expect three lines on a healthy start:

```
[safeops-api] scheduler running every 15 min
[safeops-api] listening on :4000 (production)
[safeops-scheduler] raised N notification(s): ...
```

Confirm the security posture against the deployed instance:

```bash
cd safeops-platform/api && npx tsx scripts/security-probe.ts https://api.example.com
```

Expect `21/21 checks passed`. If tenant isolation fails, stop and do not proceed.

```bash
cd safeops-platform/api && npx tsx scripts/headers-probe.ts https://api.example.com https://app.example.com
```

Confirm the refresh cookie shows `HttpOnly`, `Secure` and `SameSite=Strict`, and that an
unknown origin is not echoed back by CORS.

## 4. Create the customer's workspace

The seed creates a demo workspace with known passwords. **Do not run it in production.**

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Create the first company, site and administrator directly:

```bash
docker compose -f docker-compose.prod.yml exec api node -e "
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('./dist/lib/password.js');
(async () => {
  const db = new PrismaClient();
  const company = await db.company.create({ data: { id: 'acme', name: 'Acme Industrial', industry: 'Manufacturing', plan: 'standard' } });
  await db.site.create({ data: { id: 'acme-1', companyId: company.id, name: 'Main Plant', short: 'Main', city: 'Kuching' } });
  const user = await db.user.create({ data: {
    email: 'admin@acme.example', name: 'Their Administrator', title: 'HSE Manager',
    passwordHash: await hashPassword(process.env.FIRST_PASSWORD), mustChangePassword: true,
  }});
  await db.membership.create({ data: { userId: user.id, companyId: company.id, role: 'admin', siteIds: [] } });
  console.log('created', company.id, user.email);
  await db.\$disconnect();
})();
"
```

Pass the first password in the environment so it never lands in shell history, and note
`mustChangePassword: true` — they are forced to set their own on first sign-in.

## 5. Environment reference

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Set by compose from the Postgres credentials |
| `JWT_PRIVATE_KEY_B64` | yes | `npm run keygen`. Rotating it signs everyone out — that is the emergency response to a suspected compromise |
| `JWT_PUBLIC_KEY_B64` | yes | As above |
| `CORS_ORIGINS` | yes | Comma-separated. Only these origins may call the API |
| `VITE_API_BASE_URL` | yes | Build-time. A bundle built without it refuses to sign anyone in |
| `COOKIE_DOMAIN` | no | Set when web and API are on sibling subdomains |
| `ACCESS_TOKEN_TTL_MIN` | no | Default 15 |
| `REFRESH_TOKEN_TTL_DAYS` | no | Default 30 |
| `MAX_FAILED_LOGINS` | no | Default 5, then lockout |
| `LOCKOUT_MINUTES` | no | Default 15 |
| `SCHEDULER_ENABLED` | no | Default `true`. `false` on all but one instance if you scale out |
| `SCHEDULER_INTERVAL_MIN` | no | Default 15 |
| `UPLOAD_DIR` | yes in production | Must be a mounted volume. Checked for writability at boot — a missing or read-only mount stops the process rather than surprising someone mid-upload |

## 6. Capacity

Measured, not estimated. Against a year of operations (5,012 incidents, 4,000 actions,
1,500 permits, 900 assets, 6,000 certificates):

| | |
|---|---|
| Worst endpoint p95 | 85 ms (`/admin/health`) |
| Every other endpoint | under 60 ms |
| Worst operation at scale | 111 ms (certificate register) |
| N+1 queries | none — query counts are identical at 12 rows and at 100 |
| Sustained load, 4 min | 2,133 requests, zero failures, connections flat at 12–13, heap stable |
| Rate ceiling | 600 requests/min/IP, health exempt |

**50–100 concurrent users on 2 vCPU / 4 GB.** A pilot of 20–40 users at one site sits well
inside that. The first thing to run out is the Postgres connection pool, not CPU.

## 7. Upgrading

```bash
cd safeops-platform && git pull
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

Take a database dump before every upgrade — see [BACKUP.md](BACKUP.md).

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Migrations apply on start. Verified on a populated database: 407 rows across 27 tables
were byte-identical before and after, with no data lost and no content altered.

### Rolling back

Prisma has no down-migrations. The rollback path is to **redeploy the previous image**, and
it works because the migrations are additive — a newer schema is a superset of the older
one, so the previous release runs against it unchanged.

This was verified: the previous release was checked out and run against a database already
upgraded to the current schema. It started, served, and passed all 21 security checks
including tenant isolation.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps api:<previous-tag>
```

If a future migration is genuinely destructive, that is no longer true and the rollback
becomes a restore from the pre-upgrade dump. Take the dump.
