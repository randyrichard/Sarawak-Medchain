# INSTALL

Getting SafeOps running on a developer machine. For deploying it to a server, see
[DEPLOYMENT.md](DEPLOYMENT.md).

## Requirements

| | |
|---|---|
| Node.js | 22 or later (verified on 24.12) |
| Disk | ~2 GB for dependencies and the database |
| PostgreSQL | not required — the dev script runs an embedded one |

No Docker, no WSL and no administrator rights are needed for development. The embedded
PostgreSQL runs as an ordinary user process on port 5433.

## Install

```bash
git clone <repository-url> sarawak-medchain
```

```bash
cd sarawak-medchain/safeops-platform && npm run setup
```

`npm run setup` installs both workspaces (`api` and `web`).

## Generate signing keys

Access tokens are signed with RS256. There is no default key — the API refuses to start
without one, so a misconfigured install fails loudly instead of running insecurely.

```bash
cd safeops-platform && npm run keygen
```

Copy the two printed values into `api/.env`.

## Configure

```bash
cd safeops-platform/api && cp .env.example .env
```

```bash
cd safeops-platform/web && cp .env.example .env.local
```

Fill in `JWT_PRIVATE_KEY_B64` and `JWT_PUBLIC_KEY_B64` in `api/.env` from the keygen output.
Everything else has a working default for local use.

## Start everything

```bash
cd safeops-platform && npm run dev
```

This brings the stack up in dependency order and verifies each step before the next:
database → schema → seed → API → web. It is the only command you need day to day.

| Service | URL |
|---|---|
| Web | http://localhost:5181 |
| API | http://localhost:4000 |
| PostgreSQL | localhost:5433 |

## Load the demo dataset

Optional, and worth doing — the base seed creates an empty workspace, this fills it with a
month of plausible operations.

```bash
cd safeops-platform/api && npm run demo
```

```bash
cd safeops-platform/api && npm run demo:reset
```

`demo:reset` rebuilds it with fresh relative dates, so "overdue by four days" stays four
days overdue whenever you run it.

## Sign in

| Role | Email | Password |
|---|---|---|
| CEO | ceo@demo.safeops.app | SafeOpsPlatform2026 |
| Admin | admin@demo.safeops.app | SafeOpsPlatform2026 |
| HSE Manager | hse@demo.safeops.app | SafeOpsPlatform2026 |
| Safety Officer | officer@demo.safeops.app | SafeOpsPlatform2026 |
| Supervisor | supervisor@demo.safeops.app | SafeOpsPlatform2026 |
| Employee | employee@demo.safeops.app | SafeOpsPlatform2026 |

These exist only in the seed. A production install creates its own administrator — see
[DEPLOYMENT.md](DEPLOYMENT.md).

## Verify the install

```bash
cd safeops-platform && npm test
```

Expect 298 API tests and 36 web tests. The API tests include integration tests that run
against the real database; they skip themselves if `DATABASE_URL` is unset.

```bash
cd safeops-platform/api && npx tsx scripts/security-probe.ts
```

Expect `21/21 checks passed` — authentication, tenant isolation, role enforcement, the
public surface and input bounds.

## Everyday commands

```bash
cd safeops-platform && npm run dev:check
```

```bash
cd safeops-platform && npm run dev:stop
```

```bash
cd safeops-platform && npm run build
```

## When something is wrong

**`prisma generate` fails with EPERM.** Windows will not replace a file the running API
has open. Stop the API first:

```bash
cd safeops-platform && npm run dev:stop
```

**Port already in use.** A previous `npm run dev` is still running. `npm run dev:stop`
stops the database; the API and web processes are stopped by closing the terminal that
started them.

**"Can't reach database server at localhost:5433".** The database is not running. Start it
on its own:

```bash
cd safeops-platform/api && npx tsx scripts/dev-db.ts start
```

**The local cluster is WIN1252, not UTF-8.** Clusters created before July 2026 inherited
the Windows locale. New ones are pinned to UTF-8. This only affects development; it does
not apply to the Docker Postgres used in production. Do not recreate an existing cluster
to fix it — you will lose local data for no benefit.
