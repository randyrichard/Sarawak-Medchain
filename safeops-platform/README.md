# SafeOps Platform

Safety intelligence and compliance platform. Two workspaces:

- `api/` — Express + Prisma + PostgreSQL. Authentication, incidents, corrective actions.
- `web/` — React + Vite. Currently server-backed for authentication only; the remaining
  modules still read browser storage and are being migrated (see the roadmap).

## Running it

Requires **Node 20+**. Nothing else — the database ships as a binary.

```bash
cd safeops-platform
npm run setup                 # installs both workspaces
npm run keygen                # prints two JWT keys
cp api/.env.example api/.env  # then paste the two keys in
npm run dev                   # starts everything
```

`npm run dev` brings the stack up in dependency order and verifies each step before
starting the next:

1. Checks dependencies and configuration are present
2. Starts PostgreSQL on `:5433` (data in `api/.pgdata`, preserved across restarts)
3. Applies migrations
4. Seeds companies, sites and demo users (idempotent — safe to re-run)
5. Starts the API on `:4000` and waits for it to report a healthy database connection
6. Starts the web app on `:5181`

Then open **http://localhost:5181** and sign in with any demo account:

| Role | Email |
| --- | --- |
| Administrator | `admin@demo.safeops.app` |
| HSE Manager | `hse@demo.safeops.app` |
| Safety Officer | `officer@demo.safeops.app` |
| Supervisor | `supervisor@demo.safeops.app` |
| Employee | `employee@demo.safeops.app` |

Password for all of them: `SafeOpsPlatform2026`

`Ctrl+C` stops the services. The database volume is kept, so data survives a restart.

## Other commands

```bash
npm run dev:check   # health-check a running stack (exit 0 healthy, 1 not)
npm run dev:stop    # stop the database, keep its volume
npm test            # api + web test suites
npm run build       # production build of both workspaces
```

`dev:check` reports each dependency separately, so a partial outage is obvious:

```
  ✓ PostgreSQL :5433
  ✗ API :4000
  ✗ API → database
  ✓ Web :5181
```

## Database

Development uses `embedded-postgres`, which runs the official PostgreSQL binaries as an
ordinary user process — no Docker, no administrator rights, no service to install.

**Production uses the Postgres service in `docker-compose.yml`.** Same engine, same wire
protocol, same migrations; only the connection string differs. To use Docker locally
instead:

```bash
docker compose up -d db
```

then point `DATABASE_URL` in `api/.env` at `localhost:5433` as usual.

### Resetting

The volume lives in `api/.pgdata`. To start from a clean database:

```bash
npm run dev:stop
rm -rf api/.pgdata
npm run dev
```

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `dependencies missing in api/` | `npm run setup` |
| `JWT keys are not set in api/.env` | `npm run keygen`, paste both values into `api/.env` |
| `something already listening on :5433` | A previous run is still up. `npm run dev:stop`, or leave it — the script reuses it. |
| `API started but cannot reach the database` | `DATABASE_URL` in `api/.env` does not match the running database |
| Port already in use on 4000 / 5181 | An orphaned process from a previous run; stop it and retry |

Startup failures print what failed, the underlying output, and the command to run by hand.
Nothing is swallowed.

## Configuration

All API configuration is environment-driven and validated at boot — the process refuses to
start rather than run misconfigured. See `api/.env.example` for the full list. Secrets have
no defaults; `api/.env` is gitignored and must never be committed.

## Tests

```bash
npm test
```

The API suite includes integration tests that run against the real database. They are
skipped automatically when `DATABASE_URL` is absent, so a machine without a database still
gets a green unit run.
