# Monitoring

What to watch, what it means, and what to do. Written for a pilot: one host, one customer,
no observability stack. If you already run Prometheus or Datadog, the endpoints and log
format below plug into it.


> **Metrics and alerting.** The API exports Prometheus metrics at `/metrics`, enabled by
> `METRICS_TOKEN`. Ready-made alert rules and a scrape config are in `deploy/monitoring/`.
> Every request carries an `X-Request-Id` that also appears in its log line. Overview:
> `docs/PRODUCTION_PLATFORM.md` §5.

## The one thing to monitor

```
GET https://api.customer.example/health/ready
```

Not `/health`. Liveness only says the process is alive; readiness checks the database and
returns 503 when it cannot be reached. A process that is up but cannot serve data is not a
service that is working, and only readiness knows the difference.

| Endpoint | Returns | Use it for |
|---|---|---|
| `/health` | `{"status":"ok","uptime":N}` | Liveness — should the process be restarted? |
| `/health/ready` | `{"status":"ready"}` or 503 `{"status":"unavailable","dependency":"database"}` | Readiness — should traffic be sent here? |

Both are exempt from rate limiting, so a monitor can never be throttled into declaring the
service dead.

## Uptime monitoring

Any external checker — UptimeRobot, Better Stack, a cron on another host. External matters:
a monitor on the same machine cannot tell you the machine is unreachable.

| Setting | Value |
|---|---|
| URL | `https://api.customer.example/health/ready` |
| Interval | 60 s |
| Alert after | 2 consecutive failures |
| Also monitor | `https://app.customer.example/` — the web container can fail independently |

## Local checks

```bash
cd /srv/safeops/safeops-platform && deploy/healthcheck.sh
```

Covers containers and restart counts, serving, readiness, scheduler activity, 5xx in 24h,
connection usage against `max_connections`, disk, and backup freshness. Exits non-zero if
anything needs attention, so cron can alert on it:

```cron
*/15 * * * * cd /srv/safeops/safeops-platform && deploy/healthcheck.sh --quiet || echo "SafeOps health check failed $(date)" >> /var/log/safeops-health.log
```

## Logs

One JSON line per request:

```json
{"t":"2026-07-31T09:14:02.113Z","method":"GET","path":"/incidents","status":200,"ms":11,"user":"cms1g…","ip":"::1"}
```

Deliberately absent: request bodies, query strings and headers. Those carry the customer's
safety data and their session tokens.

```bash
docker compose -f docker-compose.prod.yml logs --since 1h api | grep '"status":5'
```

```bash
docker compose -f docker-compose.prod.yml logs --since 1h api | grep '"status":429'
```

```bash
docker compose -f docker-compose.prod.yml logs --since 24h api | grep safeops-scheduler
```

Rotation is configured in compose: 20 MB × 3 files per service, 60 MB each. Without it the
json-file driver is unbounded and a full disk stops PostgreSQL.

## Thresholds

Values from measurements on this codebase, not from a template.

| Signal | Normal | Investigate | Act |
|---|---|---|---|
| `/health/ready` | 200 | one 503 | two consecutive 503 |
| Dashboard response | under 600 ms | over 1 s | over 3 s |
| 5xx in 24 h | 0 | any non-503 | more than 5 |
| 503 in 24 h | 0 | any | sustained — the database is unstable |
| 429 in 24 h | 0 | sustained | a legitimate customer being throttled: raise `RATE_LIMIT_PER_MIN` |
| DB connections | 12–20 | over 60% of `max_connections` | over 80% |
| API RSS | 150–250 MB | over 600 MB | growing every week |
| Disk | under 60% | over 75% | over 90% — PostgreSQL stops when it fills |
| Backup age | under 24 h | over 36 h | over 48 h |
| Scheduler | a sweep line every 15 min | nothing for an hour | nothing for a day — **reminders are not firing** |

The scheduler row is the one people forget. A stack that is green everywhere else but not
sweeping is quietly failing at the thing the customer bought.

## Weekly

```bash
docker stats --no-stream
```

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname='safeops';"
```

```bash
df -h && du -sh /var/lib/docker/volumes/safeops_uploads/_data
```

Memory sawtoothing between 150 and 250 MB is a garbage collector working. Memory higher
every week is a leak — capture `docker stats` output before restarting, or the evidence
goes with the process.

## Monthly

```bash
docker compose -f docker-compose.prod.yml exec -T db pg_restore --list /backups/db-$(date +%F).dump | head
```

Then a real restore drill onto a scratch host — [RESTORE.md](RESTORE.md). A backup nobody
has restored is a hope.

## Slow queries

PostgreSQL logs anything over a second (`log_min_duration_statement=1000`):

```bash
docker compose -f docker-compose.prod.yml logs --since 24h db | grep duration
```

At pilot volume this should be empty. Measured on a year of operations — 5,012 incidents,
6,000 certificates — the slowest operation is 111 ms.

## What not to alert on

| | Why |
|---|---|
| A single 503 | The API recovers from a database blip on its own, without a restart |
| 429 during a bulk import | The limiter working as designed |
| Scheduler raising 0 notifications | Correct when nothing is due |
| A restart after a deploy | Expected |

Alerting on these trains whoever is on call to ignore the alerts, which costs more than the
alerts save.
