# Load test: a realistic large tenant

Every earlier test ran on the demo dataset, which has 16 incidents. This test measures SafeChain
against the data a mid-sized operator would have after five years, and the sign-in rush at
shift start. It found two problems that do not show on localhost. Both are fixed.

## The tenant

`api/scripts/load-volume.ts` builds the data on top of the demo company. It uses a fixed seed, so
two runs build the same data and their timings compare. It refuses to run in production.

| Data | Rows |
|---|---|
| Sites | 30 (13,708 workers) |
| Incidents, over 5 years | 37,500 (about 5% recordable, 1% lost time) |
| Corrective actions | 45,000 |
| Permits | 60,000 |
| Visitors | 50,000 |
| Toolbox meetings | 37,500 |
| Man-hours | 24 months for each site |

```bash
cd api
npm run seed && npm run demo
DATABASE_URL=... npx tsx scripts/load-volume.ts
```

## How it was measured

- One API process on a 4-core machine, with PostgreSQL 16 on the same machine.
- Each screen was requested once on its own ("single"). Then it was requested 60 times, 20 at a
  time ("under load"). Twenty people opening the same heavy screen in the same moment is a
  harsh case. Real use is spread out.
- For the sign-in test, 300 sign-ins were sent at the same moment from one address. That is a
  site behind one NAT address at shift start.

## Findings

### 1. HSE Performance took seconds, and over a minute under load (fixed)

| HSE Performance | Single | Under load: median | Under load: 95th percentile |
|---|---|---|---|
| 24 months, before | 4,169 ms | 74,525 ms (one run ended with dropped connections) | 90,286 ms |
| 24 months, after | 267 ms | 2,300 ms | 3,306 ms |
| 12 months, after | 138 ms | 1,327 ms | 1,586 ms |

**Cause:** the database was not the problem. Each query took under 60 ms, and the existing
indexes were used. The time went in working out local dates:

- Every incident and every closed action was placed in a local calendar month or day.
- Each of those lookups built a new `Intl.DateTimeFormat`. That costs about 75 µs each time.
- 24 months on this tenant is about 33,000 rows, so the lookups alone took 4 to 8 seconds.
- Node runs on one thread, so while one person's request was doing this, everyone else waited.

**Fix:**
- `domain/localTime.ts` keeps one formatter for each time zone. This speeds up every
  local-date calculation in the API, about 8 times faster per call.
- HSE Performance works out the start of each month once per request. Incidents are then
  placed by comparing times, and each due date's end is worked out once.
- `domain/localTime.test.ts` fails if a formatter is built per call.

**What is left:** under load, the remaining time is mostly Prisma loading 33,000 rows on
the single Node thread. That is acceptable for a monthly-review screen used by a few
managers. If the screen grows, the next step is to count by month in SQL rather than in the
API.

### 2. A shift signing in at once was refused (fixed)

| 300 simultaneous sign-ins, one address | Refused | All done in |
|---|---|---|
| Before | 260 of 300 | 1.1 s |
| After | 0 of 300 (two runs) | 3.5 s |

**Cause:** the sign-in limiter counts each attempt when it arrives, and gives the count back
when the attempt succeeds. Checking a password takes time, so in a burst the first 40
attempts still being checked filled the address's budget of 40 failures. Everyone after them
was refused.

Each refusal also counted as a failure. So the lock kept itself going for as long as people
kept trying. The earlier fix for this problem was tested with sign-ins one after another, so
it did not catch this.

**Fix** (`routes/auth.ts`, `http/inFlightQueue.ts`):
- At most 8 sign-ins per address are in progress at once in each API process. The rest wait
  their turn instead of being refused. Password checks already queue on a small thread pool,
  so waiting costs nothing overall.
- The limiter's own refusals are given back, so a lock cannot feed itself.

The limit on guessing is unchanged:
- 40 failures per address per 15 minutes.
- A parallel burst of 100 wrong passwords gets exactly 40 attempts. A test checks this.

Tests in `routes/loginLimit.integration.test.ts`:

| Test | Without the fix |
|---|---|
| 300 simultaneous sign-ins | Fails: 85 to 189 refused |
| The limiter's refusals leave no count | Fails |

### Other screens: no problem found

| Screen | Single | Under load: median | Under load: 95th percentile |
|---|---|---|---|
| Dashboard overview | 71 ms | 633 ms | 882 ms |
| Site comparison | 46 ms | 357 ms | 432 ms |
| Incidents list | 20 ms | 85 ms | 124 ms |
| Incident stats | 48 ms | 208 ms | 305 ms |
| Permit stats | 47 ms | 145 ms | 184 ms |
| Permits list | 21 ms | 75 ms | 113 ms |
| Visitors dashboard | 18 ms | 82 ms | 114 ms |

## Sizing advice

- **One API process serves one CPU core.** For a customer with several hundred users, give
  the server at least 2 cores, and run 2 API replicas on Kubernetes (`deploy/k8s`). The
  limiter's counts are kept in Postgres, so the limit of 40 holds across replicas. The
  sign-in queue is per process, which is all it needs to be.
- Sign-in uses Argon2 on purpose, so it is slow to guess. 300 sign-ins at once take about 3.5
  seconds on 4 cores, so some people wait up to 3 seconds at the gate. More cores shorten this.
- Re-run this test before taking on a customer much larger than 30 sites.
