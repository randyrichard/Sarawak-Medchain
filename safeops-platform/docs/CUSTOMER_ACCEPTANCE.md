# Customer acceptance checklist

Work through this with the customer's IT contact and HSE lead present. Each line is either
done and demonstrated, or it is not done. Sign the bottom when every line is ticked.

**Customer:** ________________________  **Date:** ____________
**Environment:** ________________________  **Signed off by:** ____________

---

## 1. Infrastructure

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 1.1 | Host provisioned, 2 vCPU / 4 GB minimum | `nproc && free -h` | ☐ |
| 1.2 | Docker and the compose plugin installed | `docker --version && docker compose version` | ☐ |
| 1.3 | Repository at the release tag | `git describe --tags` | ☐ |
| 1.4 | Compose file validates | `node scripts/validate-compose.mjs` | ☐ |
| 1.5 | Disk has room for a year: database, uploads, 30 days of backups | `df -h` — 50 GB is comfortable for a pilot | ☐ |

## 2. Database

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 2.1 | Database created and healthy | `docker compose -f docker-compose.prod.yml ps db` shows healthy | ☐ |
| 2.2 | Password is generated, not chosen | `openssl rand -base64 24` | ☐ |
| 2.3 | Not published to the host | `docker compose -f docker-compose.prod.yml port db 5432` returns nothing | ☐ |
| 2.4 | Migrations applied | `docker compose ... exec api npx prisma migrate status` says up to date | ☐ |
| 2.5 | Connection pool bounded | `DB_POOL_SIZE` set; total across instances below `max_connections` | ☐ |
| 2.6 | **Demo seed NOT run** | `SELECT count(*) FROM "Company";` returns only the customer's | ☐ |

## 3. Application

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 3.1 | Signing keys generated for this deployment | `npm run keygen`; values in `.env.prod`, not shared with any other environment | ☐ |
| 3.2 | Health endpoint green | `curl -fsS https://api.customer.example/health` | ☐ |
| 3.3 | Readiness green | `curl -fsS https://api.customer.example/health/ready` returns `{"status":"ready"}` | ☐ |
| 3.4 | Web app loads | Open the site; the sign-in page renders | ☐ |
| 3.5 | Restart policy set | `docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' <container>` → `unless-stopped` | ☐ |
| 3.6 | Survives a reboot | Reboot the host; `deploy/healthcheck.sh` passes without intervention | ☐ |

## 4. HTTPS and domain

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 4.1 | Domain resolves to the host | `dig +short app.customer.example` | ☐ |
| 4.2 | TLS certificate valid | `curl -vI https://app.customer.example 2>&1 \| grep -i 'SSL certificate verify'` | ☐ |
| 4.3 | HTTP redirects to HTTPS | `curl -sI http://app.customer.example \| head -1` → `301` | ☐ |
| 4.4 | HSTS present | `curl -sI https://app.customer.example \| grep -i strict-transport` | ☐ |
| 4.5 | **Web and API share a registrable domain** | `app.x.com` + `api.x.com` ✓ — different domains break sessions silently | ☐ |
| 4.6 | Cookie flags correct | `npx tsx api/scripts/headers-probe.ts https://api.customer.example https://app.customer.example` → HttpOnly, Secure, SameSite=Strict | ☐ |
| 4.7 | CORS refuses unknown origins | Same probe: an arbitrary origin is not echoed | ☐ |
| 4.8 | **Session survives a reload** | Sign in, press F5. You stay signed in. **The single most important line on this page** | ☐ |

## 5. Administrator account

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 5.1 | Company and first site created | Visible under Organization | ☐ |
| 5.2 | Administrator created with `mustChangePassword` | They are forced to set their own on first sign-in | ☐ |
| 5.3 | First password delivered out of band | Not by email, not in a ticket | ☐ |
| 5.4 | They have signed in and changed it | Confirm with them directly | ☐ |
| 5.5 | A second administrator exists | One admin is a single point of failure — the last-admin guard will refuse to remove them | ☐ |

## 6. Backups

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 6.1 | Backup runs and produces three files | `deploy/backup.sh` → dump, uploads archive, manifest | ☐ |
| 6.2 | Dump is readable | The script verifies with `pg_restore --list`; it fails loudly if not | ☐ |
| 6.3 | Scheduled nightly | `crontab -l` — see [BACKUP.md](BACKUP.md) | ☐ |
| 6.4 | Copied off this host | `rclone`, `aws s3 sync`, or their existing agent. A backup on the machine it protects is not a backup | ☐ |
| 6.5 | **Restore tested, and timed** | `deploy/restore.sh` on a scratch host. Record the elapsed time here: ______ | ☐ |
| 6.6 | Restore verified against the manifest | The script compares every table and checks for orphaned child records | ☐ |

## 7. Scheduler and notifications

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 7.1 | Scheduler started | `docker compose ... logs api \| grep 'scheduler running'` | ☐ |
| 7.2 | It raises notifications | Create an action due in 7 days; within 15 minutes a notification appears | ☐ |
| 7.3 | It does not duplicate | Restart the API; the count does not increase | ☐ |
| 7.4 | Notifications reach the bell | Visible in the UI, scoped to the right workspace | ☐ |
| 7.5 | **Customer told notifications are in-app** | The bell and its counts are in-app only — there is no email digest of notifications. Get an explicit acknowledgement | ☐ |
| 7.6 | Email transport configured | `REPORT_EMAIL_FROM` plus one transport set, and `/reports/catalog` reports a provider | ☐ |
| 7.7 | **One real invitation delivered** | Invite your own address; the row reads *Emailed*, the mail arrives, and its link points at `APP_PUBLIC_URL`. This is the only proof external delivery works — see [DEPLOYMENT.md §5](DEPLOYMENT.md) | ☐ |
| 7.8 | Scheduled report email arrives | Run a report now; the run history shows *Sent* and the PDF is attached | ☐ |

## 8. Security

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 8.1 | Security probe passes | `npx tsx api/scripts/security-probe.ts https://api.customer.example` → 21/21 | ☐ |
| 8.2 | Attack probe passes | `npx tsx api/scripts/attack-probe.ts https://api.customer.example` → 18/18 | ☐ |
| 8.3 | Audit log recording | Administration → Audit Log shows the setup actions just performed | ☐ |
| 8.4 | Roles behave | Sign in as a non-admin; Administration is not reachable | ☐ |
| 8.5 | `.env.prod` not in version control | `git check-ignore -v .env.prod` | ☐ |

## 9. Operations

| | Check | How to prove it | ✓ |
|---|---|---|---|
| 9.1 | Health check script runs clean | `deploy/healthcheck.sh` exits 0 | ☐ |
| 9.2 | Log rotation active | `docker inspect --format '{{.HostConfig.LogConfig}}' <container>` shows max-size | ☐ |
| 9.3 | Monitoring points at `/health/ready` | Not `/health` — readiness reports on the database | ☐ |
| 9.4 | Escalation contacts filled in | [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md), bottom of the page | ☐ |
| 9.5 | Support runbook handed over | [SUPPORT_RUNBOOK.md](SUPPORT_RUNBOOK.md) | ☐ |

## 10. Limitations acknowledged

Get these said out loud before go-live. Every one has ended somebody's pilot by being
discovered rather than disclosed.

| | Limitation | Acknowledged | ✓ |
|---|---|---|---|
| 10.1 | **No email.** Notifications are in-app only | | ☐ |
| 10.2 | **The in-app restore covers records, not their history.** Incident timelines and permit precaution checklists are not in it. Real recovery is `pg_dump` | | ☐ |
| 10.3 | Lists show up to 2,000 records; search and filters reach everything | | ☐ |
| 10.4 | Trend charts and the Safety Score are illustrative. Every KPI tile, the priority queue and the site map are real | | ☐ |
| 10.5 | The permissions matrix is display-only; roles are enforced in the services | | ☐ |
| 10.6 | Global search is not built | | ☐ |
| 10.7 | Single instance — a restart is a brief outage | | ☐ |
| 10.8 | Safari and Firefox are untested. If their people use either, test before go-live | | ☐ |

---

## Sign-off

Every line above is ticked, and the limitations in section 10 have been read aloud and
acknowledged.

| | Name | Signature | Date |
|---|---|---|---|
| Deployed by | | | |
| Customer IT | | | |
| Customer HSE lead | | | |
