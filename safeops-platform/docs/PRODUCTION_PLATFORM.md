# SafeChain production platform

How SafeChain runs in production: the infrastructure, how a change gets from a pull request to
customers, how we know it is healthy, and how we keep it up. It is the entry point; the
step-by-step guides it links to (`DEPLOYMENT.md`, `SERVER_SETUP.md`, `MONITORING.md`,
`BACKUP.md`, `DISASTER_RECOVERY.md`) hold the detail.

Everything stated as working here was run, not assumed. Section 7 lists what was verified
and how.

---

## 1. Infrastructure architecture

Two tiers. **Start on tier 1.** It is one server, one Compose file and a few shell scripts,
and it serves a pilot through the first few dozen customers. Move to tier 2 when one of the
triggers in §1.3 is met, not before. Kubernetes adds real operational weight.

### 1.1 Tier 1: one server, Docker Compose (the default)

```
                    Internet
                       │  443
              ┌────────▼─────────┐   optional: Cloudflare in front (docs/CLOUDFLARE.md)
              │      Caddy       │   TLS (Let's Encrypt, auto-renew), HSTS, HTTP→HTTPS,
              │  (tls profile)   │   sets X-SafeOps-Proxy so the API can trust forwarding
              └──┬────────────┬──┘
   app.domain    │            │   api.domain
          ┌──────▼─────┐ ┌────▼──────────────┐      ┌───────────────────────┐
          │    web     │ │       api         │      │        worker         │
          │ nginx, SPA │ │ Express, :4000    │      │ reminders, reports,   │
          │ CSP, cache │ │ migrations on     │      │ webhooks (one pass at │
          └────────────┘ │ start, /metrics   │      │ a time: advisory lock)│
                         └────┬──────────┬───┘      └───┬──────────┬────────┘
                              │          └──── uploads volume ─────┘
                       ┌──────▼──────────────────────────▼──┐
                       │ PostgreSQL 16  (safeops_app login,  │
                       │ row-level security; pgdata volume)  │
                       └──────────────┬─────────────────────┘
                                      │ nightly + pre-deploy pg_dump, uploads tarball
                                      ▼
                         /backups  ──rclone──▶  off-host storage
```

| Service | Image | Role | Health | Restart |
|---|---|---|---|---|
| `db` | `postgres:16-alpine`, pinned by digest | Data; not published to the host | `pg_isready` | unless-stopped |
| `api` | `safeops-api:local` | HTTP API; runs migrations and creates the restricted DB login before serving | `/health` (image), `/health/ready` (deploy gate) | unless-stopped |
| `worker` | same image, `node dist/worker.js` | Background jobs | job-freshness check (`cli/workerHealth.ts`) | unless-stopped |
| `web` | `safeops-web:local` | Static app, security headers, CSP | `GET /` | unless-stopped |
| `caddy` | `caddy:2-alpine` (`tls` profile) | TLS and reverse proxy | — | unless-stopped |

**Design choices:**
- **Ports.** Only Caddy faces the internet. The API and web ports bind to `127.0.0.1`, and
  the database isn't published at all.
- **Logs.** Every container's logs rotate (`x-logging` in the Compose file), so a busy
  week can't fill the disk.
- **Database logins.** The service connects as `safeops_app`, a login that can read and
  write rows and do nothing else. Row-level security keeps each company's rows to that
  company in the database itself. Migrations run as the schema owner.
- **Releases.** A release is chosen by what the `:local` image tag points at. Every deploy
  keeps the image it replaced under an immutable `before-<timestamp>` tag. That is what
  makes rollback exact (§2.3).

**Sizing** is in `SERVER_SETUP.md`. Briefly: 2 vCPU / 4 GB / 80 GB SSD for a pilot,
4 vCPU / 8 GB for production with a few hundred daily users.

### 1.2 Tier 2: Kubernetes plus managed PostgreSQL

The manifests are in `deploy/k8s/`, documented in `deploy/k8s/README.md`, and validated
against the Kubernetes 1.30 schemas. This tier gives you:
- **More API capacity.** At least two API replicas, spread across nodes, autoscaling to six
  on CPU.
- **Deploys without downtime.** Rolling deploys (`maxUnavailable: 0`), with migrations run in
  an init container before new pods take traffic.
- **Safe maintenance.** Pod disruption budgets, so draining a node never takes out the
  last API pod.
- **Network isolation.** Default-deny network policies.
- **Least privilege.** Read-only root filesystems, no capabilities, non-root.
- **A better database.** Managed PostgreSQL with point-in-time recovery, so data can be
  recovered to the minute rather than to last night's dump.
- **Shared uploads.** Uploads move to a `ReadWriteMany` volume (object storage is on the
  roadmap, §8).

### 1.3 When to move from tier 1 to tier 2

Move when **any** of these is true:
- A customer contract requires an uptime SLA above ~99.5%, or no deploy downtime at all.
  Tier 1 has about 4 s of API unavailability per deploy, measured in §7.
- The API sustains more than ~60% CPU at peak on the largest sensible single server.
- The data, or the recovery objective, needs point-in-time recovery: less than 24 hours of
  loss.
- You need staging and production to be identical environments.

---

## 2. Deployment workflow

### 2.1 From pull request to production

```
 PR ──▶ CI (safeops-platform-ci) ──▶ review ──▶ merge ──▶ CI on the release branch
          • API: typecheck, 1,460+ tests vs real Postgres, every
            route test as the restricted DB login (RLS), npm audit
          • web: tests, build, bundle credential scan, npm audit
          • docker: build both images, boot the production stack
            from docker-compose.prod.yml, run deploy/smoke.sh
                                                                │ green
                                                                ▼
                                   safeops-platform-release ──▶ GHCR images :<sha>, :edge
                                     • provenance + SBOM          + vulnerability report
                                                                │
                                         (if a server is configured) approval gate
                                                                ▼
                                   ssh server: deploy/deployment.sh --version <sha>
```

### 2.2 What `deploy/deployment.sh` does, and why each step prevents downtime

| Step | What happens | What it prevents |
|---|---|---|
| Pre-flight | `deploy/preflight.sh` checks the configuration | Booting cleanly while serving nobody: template values, wrong domains, a cookie domain mismatch, CORS |
| Keep | Running images are tagged `before-<stamp>` | A rollback with nothing exact to return to |
| Back up | `pg_dump` plus an uploads tarball, verified readable | A bad migration with no way back |
| Get release | Pull `:<sha>` from the registry, or build here; point `:local` at it | Deploying something that wasn't tested |
| Start | `docker compose up -d`; the API migrates, then creates the restricted DB login, then serves | Serving against a schema it doesn't expect |
| Ready gate | Waits for `/health/ready` (API plus database) | Declaring success while broken |
| Verify | No pending migrations; worker started | Silent background failure |
| Smoke | `deploy/smoke.sh`: up, closed to anonymous callers, security headers, CORS, SPA routing | Handing a broken or insecure build to a customer |
| Prune | Keeps the 5 newest `before-*` images | The disk filling, one release at a time |

**Release rules:**
- **Migrations are additive.** The previous release must run against the new schema. That
  is what makes an application-only rollback safe. A destructive change is split across
  two releases.
- **Deploy during low use.** On tier 1 the API restarts, with about 4 s of failed requests;
  the web app retries.
- **First deploys only:** pass `--skip-backup`.
- **Demo or staging only:** pass `--demo-probe` to also run the signed-in security probe.

### 2.3 Rollback

```
deploy/rollback.sh                 # to the release the last deploy replaced
deploy/rollback.sh --to <tag>      # any kept release (before-…) or registry sha
```

**How it works:**
- Rollback points `:local` at the chosen release.
- It recreates the api, worker and web containers.
- It waits for ready, checks the API is really running the requested image, and runs the
  smoke test.
- The database is not touched. If the bad release had a destructive migration, use
  `deploy/restore.sh` with the pre-deploy backup.

**Bug fixed in this change.** Before this change, rollback tagged `safeops-api:rollback`,
but Compose never read that name, so a "rollback" restarted the newest image. It was
verified end to end in §7.

---

## 3. CI/CD pipelines

| Workflow | Trigger | Jobs | Blocks on |
|---|---|---|---|
| `safeops-platform-ci.yml` | PRs touching `safeops-platform/`; pushes to `main` and `feature/permit-to-work` | `api`, `web`, `docker` (build, boot, smoke) | Any test failure, a credential in the bundle, a high npm advisory, an image that doesn't boot or fails the smoke test, an image running as root |
| `safeops-platform-release.yml` | `safeops-platform-ci` succeeding on a push; manual | `publish` (GHCR, provenance, SBOM, Trivy report), `deploy` (optional, approval-gated) | Publish failures. The vulnerability scan reports and does not block. |
| Dependabot (`.github/dependabot.yml`) | Weekly | npm (api, web: minor/patch grouped), Docker base images, Compose images, GitHub Actions | — |

**Settings for the release workflow** (repository → Settings → Secrets and variables → Actions):

| Name | Kind | Purpose |
|---|---|---|
| `SAFEOPS_VITE_API_BASE_URL` | variable | The API URL baked into the web bundle. Without it, only the API image is published. |
| `SAFEOPS_DEPLOY_HOST` | variable | The server. Without it, the workflow publishes and does not deploy. |
| `SAFEOPS_DEPLOY_USER`, `SAFEOPS_DEPLOY_DIR` | variable | SSH user (`safeops`) and checkout directory (`/srv/safeops`). |
| `SAFEOPS_DEPLOY_SSH_KEY` | secret | A key that can log in as that user, and nothing more. |
| `SAFEOPS_DEPLOY_KNOWN_HOSTS` | secret | The server's host key line, so the connection can't be redirected. |
| Environment `production` | setting | Add yourself as a required reviewer, so every production deploy waits for a click. |

**On the server**, for registry deploys, set `SAFEOPS_API_IMAGE=ghcr.io/<owner>/safeops-api`
and `SAFEOPS_WEB_IMAGE=ghcr.io/<owner>/safeops-web` in `.env.prod`. Then log in once with a
read-only token: `docker login ghcr.io`.

---

## 4. Docker and Kubernetes

| | Tier 1 (Compose) | Tier 2 (Kubernetes) |
|---|---|---|
| Definition | `docker-compose.prod.yml` | `deploy/k8s/base` + `overlays/production` |
| Images | Built on the server, or pulled by sha | Pulled by sha, set in the overlay |
| Migrations | API entrypoint, before serving | API init container, before the pod is ready |
| Restricted DB login | Entrypoint (`cli/dbAppRole.js`) | Init container (same command) |
| Release | `deploy/deployment.sh [--version sha]` | `kustomize edit set image …; kubectl apply -k` |
| Rollback | `deploy/rollback.sh` | `kubectl rollout undo` or the previous sha |
| Scale | One API container | 2–6 API pods (HPA), PDBs, spread over nodes |
| Deploy downtime | ~4 s | None (rolling, readiness-gated, `preStop` drain) |
| TLS | Caddy | ingress-nginx + cert-manager |
| Database | Container with a volume, nightly dumps | Managed, with PITR |

**Image standards, enforced or checked:**
- base images pinned by digest;
- multi-stage builds;
- the API runs as uid 1000, which CI checks;
- the API and worker run with a read-only root filesystem and no capabilities (verified);
- built-in `HEALTHCHECK`;
- `exec node` as PID 1, so `SIGTERM` reaches the drain logic.

---

## 5. Monitoring and logging

### 5.1 Four layers

| Layer | What | Where |
|---|---|---|
| **Uptime** (outside-in) | `GET https://api…/health/ready` and `GET https://app…/` every minute, from outside the server | Any external checker: UptimeRobot, Better Stack, Uptime Kuma on another machine. This is the alert that still works when the server is gone. |
| **Metrics** | `GET /metrics` (Prometheus format, needs `METRICS_TOKEN`) | Prometheus, or Grafana Cloud's free tier, scraping with `deploy/monitoring/prometheus.yml` |
| **Alerts** | `deploy/monitoring/alerts.yml`: 9 rules, unit-tested with `promtool` | Alertmanager or Grafana alerting |
| **Logs** | One JSON line per request, plus error lines carrying the same request id | `docker compose logs`, rotated. Ship them with Vector, Promtail or Grafana Alloy when there's more than one server. |

### 5.2 Metrics the API exports

| Series | Answers |
|---|---|
| `safeops_up`, `safeops_db_up` | Is it up, and can it reach Postgres? |
| `safeops_http_requests_total{method,route,status}` | Traffic and errors, per endpoint. Routes are templates (`/incidents/:id`), never raw paths, so the number of series stays bounded. |
| `safeops_http_request_duration_seconds{method,route}` | Latency histogram, per endpoint |
| `safeops_job_last_success_age_seconds{job}`, `safeops_job_last_run_failed{job}` | Is background work running: reminders, expiry, reports, webhooks… |
| `process_resident_memory_bytes`, `nodejs_heap_used_bytes`, `nodejs_eventloop_delay_p99_seconds`, `process_uptime_seconds` | Process health, saturation, restarts |

### 5.3 Alerts (pages vs tickets)

| Alert | Fires when | Severity |
|---|---|---|
| `SafeOpsApiDown` | The scrape has failed for 2 min | page |
| `SafeOpsDatabaseUnreachable` | `safeops_db_up == 0` for 2 min | page |
| `SafeOpsHighErrorRate` | More than 5% 5xx over 10 min, with real traffic | page |
| `SafeOpsRemindersStalled` | Reminders haven't succeeded for 1 h | page |
| `SafeOpsSlowResponses` | p95 above 2 s for 15 min | ticket |
| `SafeOpsEventLoopBlocked` | Event-loop p99 above 0.5 s for 10 min | ticket |
| `SafeOpsMemoryHigh` | RSS above 1.5 GB for 30 min | ticket |
| `SafeOpsWebhooksStalled` | Webhooks haven't run for 15 min | ticket |
| `SafeOpsJobFailing` | A job's last run has been failing for 30 min | ticket |

Also alert on **disk above 80%** and **no backup newer than 26 hours**. Node exporter or
your host's monitoring covers both; see `MONITORING.md` and `BACKUP.md`.

### 5.4 Tracing a request

**Request IDs:**
- Every response carries `X-Request-Id`.
- It is taken from the proxy when the proxy sent one, and generated otherwise.
- The same id is in the request's log line (`rid`) and in any error logged for it.
- A 500 response returns it as `requestId`, so a customer can quote it and support can
  find the exact server-side error.

**Log lines** hold the method, path (with invitation and reset tokens redacted), route
template, status, duration, user id and client IP. They never hold request or response
bodies, query strings or headers.

---

## 6. Reliability and downtime prevention

| Risk | Control |
|---|---|
| A bad release | CI boots and smoke-tests the real stack. Deploys are gated on ready, migrations and smoke. Rollback is exact (§2.3). |
| A bad migration | Pre-deploy backup, verified readable. Additive-migration rule. `deploy/restore.sh` restores the backup. |
| A crash or OOM | `restart: unless-stopped`. Kubernetes liveness probes. Memory alert. |
| The database going away | Readiness drops (no traffic on k8s). `503` with `Retry-After`, not `500`. Alert in 2 min. |
| Background work stalling | Worker job-freshness healthcheck. Alerts on job age and failures. Work is isolated from the API's event loop. |
| A traffic spike or abuse | Per-IP and per-key rate limits stored in Postgres (they survive restarts). Bounded body size and connection pools. HPA on tier 2. |
| A disk filling | Log rotation, backup retention (`BACKUP_KEEP_DAYS`), pruning of old release images, alert at 80%. |
| Losing the server | Nightly backups copied off-host (`BACKUP.md`). Restore drill (`DISASTER_RECOVERY.md`). Tier 2: managed DB with PITR. |
| A cross-tenant data leak | Application row scope, plus Postgres row-level security under a least-privilege login. |
| Shutdown cutting work | `exec node` as PID 1. API and worker drain for 25 s. `stop_grace_period` and `terminationGracePeriodSeconds` cover it. |

**Recovery objectives:**

| | RPO (data loss) | RTO (time to restore) |
|---|---|---|
| Tier 1 | 24 h (nightly), or the last pre-deploy backup | ~30 min with a rehearsed restore (`DISASTER_RECOVERY.md`) |
| Tier 2 | Minutes (PITR) | Minutes for a pod or node; under 30 min for a regional restore |

---

## 7. What was verified for this document

All of the following was run, not just reviewed:

**The production stack, end to end.** It was run from `docker-compose.prod.yml` with locally
built images. This sandbox's network policy blocks Alpine's package mirror, so the images
were built from the project's Dockerfiles minus two `apk add` lines; CI builds the real ones.
1. `deployment.sh --version v1` on an empty server: success.
2. `deployment.sh --version v2`, with the pre-deploy backup: success.
3. `rollback.sh`: the API, worker and web returned to v1's exact image ids.
4. `rollback.sh --to v2`: back to v2's ids.
5. An unknown tag is refused, with nothing changed.

**Deploy downtime.** The API was probed every 200 ms through a release switch: about 4 s of
failed requests (20 probes).

**Three pre-existing bugs, found and fixed along the way:**
- `rollback.sh` didn't roll back.
- The backup and restore integrity check (`pg_restore --list /dev/stdin`) rejected every
  valid dump through `docker compose exec`, so every deploy that took a backup failed.
  Every restore would have failed the same way.
- The deploy's last step signed in as demo accounts that production doesn't have, so every
  real deploy ended in "DO NOT hand this to a customer".

**CI's new docker steps.** The boot, smoke, restricted-login and metrics steps were executed
here exactly as written in the workflow.

**Smoke test.** 16 checks pass against a healthy stack; it fails loudly against a broken one.

**Metrics.** Served only with the token. `promtool check metrics` reports no lint issues.
Alert rules pass `promtool check rules` and `promtool test rules`.

**Kubernetes.**
- The rendered overlay is valid: 16 of 16 resources pass strict schema validation
  (kubeconform, Kubernetes 1.30).
- The API image runs as the manifests require: read-only root, all capabilities dropped,
  uid 1000. That covers the migrate init step, the server and the worker.

**Workflows.** Both pass `actionlint`.

---

## 8. Production checklist

### Before go-live, once

- [ ] Server per `SERVER_SETUP.md`: firewall allowing 22 and 443 only, a non-root deploy
      user, Docker, start on boot.
- [ ] `.env.prod` from `.env.prod.example`. **Every secret generated fresh**:
      `npm run keygen` gives the JWT keys, `WEBHOOK_SECRET_KEY_B64`, `MFA_SECRET_KEY_B64`
      and `APP_DB_PASSWORD`; `openssl rand -hex 24` gives `METRICS_TOKEN` and `PROXY_TOKEN`.
- [ ] `deploy/preflight.sh` is all green.
- [ ] DNS for app and API points at the server, and Caddy has issued certificates.
- [ ] `deploy/deployment.sh --skip-backup` (first deploy) ends in "All smoke checks passed".
- [ ] `docker compose logs api` shows `restricted database login ready (safeops_app)`.
- [ ] Email configured (`RESEND_API_KEY` or `SMTP_URL`); an invitation actually arrives.
- [ ] External uptime checks on `/health/ready` and the app, alerting a phone.
- [ ] Prometheus or Grafana Cloud scraping `/metrics`, with `alerts.yml` loaded and alerts
      routed.
- [ ] Nightly backup cron plus off-host copy (`BACKUP.md`). **A restore rehearsed** on a
      scratch server (`DISASTER_RECOVERY.md`).
- [ ] Platform admin created; your own MFA set up; "Require MFA" on for each customer that
      wants it.
- [ ] GitHub: a `production` environment with you as required reviewer; branch protection
      requiring `api`, `web` and `docker`.

### Every release

- [ ] CI green on the release commit.
- [ ] Migrations reviewed and additive.
- [ ] Deploy at a quiet time (tier 1 restarts the API for ~4 s).
- [ ] `deploy/deployment.sh [--version <sha>]` completes with smoke checks passed.
- [ ] Watch error rate and latency for 15 min. If either moves: `deploy/rollback.sh`.

### Weekly and monthly (`MONITORING.md`)

- [ ] Merge Dependabot PRs: base images and dependencies.
- [ ] Read the release workflow's vulnerability report.
- [ ] Check the newest backup's size against last week's, and the disk trend.
- [ ] Monthly: restore drill on a scratch server.

---

## 9. Roadmap: what this does not do yet

| Item | Why it matters | Effort |
|---|---|---|
| Tier-1 zero-downtime deploys (two API containers behind Caddy, health-checked) | Removes the ~4 s window without moving to Kubernetes | Medium |
| Uploads to S3-compatible object storage | Removes the RWX volume requirement; simpler backups and replicas | Medium (application change) |
| Encrypted, automated off-host backups (restic or rclone crypt) | Backups are currently unencrypted at rest | Small |
| Unprivileged nginx base for the web image | Lets the web pod use the `restricted` Pod Security profile | Small |
| Error tracking (Sentry or GlitchTip) keyed by request id | Stack traces grouped and alerted without reading logs | Small |
| A staging environment fed by the release workflow (`edge` tag) | Rehearse every release on production-shaped data | Medium |
| Enforce the remaining Authentication Policy settings (audit finding D-7) | The admin screen claims controls the server does not apply | Medium |
