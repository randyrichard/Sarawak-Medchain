# Runbook

The index. Every operational document, and which one you want.

Nothing is duplicated here on purpose — a second copy of a procedure drifts from the first,
and during an incident you cannot tell which one is current.

## By situation

| It is… | Go to |
|---|---|
| A new machine for a developer | [INSTALL.md](INSTALL.md) |
| A new server for a customer | [SERVER_SETUP.md](SERVER_SETUP.md) |
| Time to deploy | [DEPLOYMENT.md](DEPLOYMENT.md) · `deploy/deployment.sh` |
| Going wrong right now | [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) |
| The customer on the phone | [SUPPORT_RUNBOOK.md](SUPPORT_RUNBOOK.md) |
| The host is gone | [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) |
| A restore of any size | [RESTORE.md](RESTORE.md) |
| Backups | [BACKUP.md](BACKUP.md) |
| What to watch | [MONITORING.md](MONITORING.md) |
| Onboarding a customer | [CUSTOMER_ACCEPTANCE.md](CUSTOMER_ACCEPTANCE.md) |
| A browser question | [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md) |
| Docker, on a host that has it | [DOCKER_VERIFICATION.md](DOCKER_VERIFICATION.md) |
| Where the product actually stands | [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md) |

## Daily

```bash
cd /srv/safeops/safeops-platform && deploy/healthcheck.sh
```

Containers, serving, readiness, scheduler, 5xx, connections, disk, backup freshness. Exits
non-zero if anything needs attention. Most questions are answered here.

## The commands worth memorising

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

```bash
docker compose -f docker-compose.prod.yml restart api
```

```bash
deploy/backup.sh
```

```bash
deploy/rollback.sh
```

## Deploy

```bash
deploy/deployment.sh
```

Backs up, records the running image IDs, builds, starts, waits for readiness, confirms no
migrations are pending, and runs the security probe. It refuses to declare success if the
probe fails.

Rolling back returns the **application only**. Migrations are additive, so the previous
release runs against the newer schema — verified by doing exactly that.

## Escalate immediately

- Any 5xx that is not a 503 during a database outage
- `security-probe.ts` failing a tenant-isolation check — **stop the pilot, this is a breach**
- A backup that will not `pg_restore --list`
- Disk above 90%: PostgreSQL stops when it fills
- No scheduler activity for a day: reminders are not firing and nobody is being told

## Known limitations

Say these before a customer finds them. Full list in
[CUSTOMER_ACCEPTANCE.md](CUSTOMER_ACCEPTANCE.md) §10.

| | |
|---|---|
| No email | Notifications are in-app only |
| In-app restore covers records, not their history | Incident timelines and permit checklists are not in it. Real recovery is `pg_dump` |
| Lists cap at 2,000 rows | Search and filters reach everything |
| Trend charts and Safety Score are illustrative | Every KPI tile, the priority queue and the site map are real |
| Permission matrix is display-only | Roles are enforced in the services |
| Global search is not built | |
| Single instance | A restart is a brief outage |
| Safari and Firefox untested | Test before go-live if their people use either |
