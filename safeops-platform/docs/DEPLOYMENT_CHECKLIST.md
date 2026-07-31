# Deployment validation checklist

Every item is **PASS**, **FAIL**, or **BLOCKED**. Nothing is marked PASS unless it was
actually executed and the output recorded.

Assessed 1 August 2026 · `feature/permit-to-work` · RC1

---

## Summary

| | Count |
|---|---|
| PASS | 11 |
| FAIL | 0 |
| **BLOCKED** | **12** |

**Every blocked item has the same single cause: there is no container runtime on the
development machine.** Not twelve problems — one problem, twelve consequences.

---

## The blocker, precisely

Checked again today:

```
docker      absent from PATH
podman      absent from PATH
nerdctl     absent from PATH
wsl.exe     present, but: "The Windows Subsystem for Linux is not installed."
admin       False
```

And, checking whether a host could be provisioned from here instead:

```
aws, az, gcloud, doctl, flyctl, terraform   all absent
ssh, scp                                     PRESENT
```

So this machine **cannot build or run containers**, and **cannot create a server**. It
*can* reach one over SSH if you provide it.

Installing Docker Desktop needs administrator rights and a reboot. Neither is mine to take.

---

## What machine is required

Any one of these removes all twelve blockers. Listed cheapest-effort first.

### Option A — a Linux VPS *(recommended)*

The closest thing to what the customer will actually run.

| | |
|---|---|
| Provider | Hetzner CX22, DigitalOcean, Linode, Vultr, or any cloud |
| Spec | **2 vCPU, 4 GB RAM, 50 GB SSD** |
| OS | Ubuntu 24.04 LTS |
| Cost | roughly €5–12 / month |
| Also needed | A domain, with two A records pointing at it |

Why a domain matters: TLS cannot be verified without one, and the refresh cookie is
`SameSite=Strict`, so both names must share a registrable domain —
`app.yourdomain.com` and `api.yourdomain.com` work.

**What I need from you:** the host's IP, a username, and SSH access. `ssh` and `scp` exist
on this machine, so I can then run the whole deployment and every verification below.

### Option B — Docker Desktop on this Windows machine

| | |
|---|---|
| Needs | Administrator rights + a reboot |
| Commands | `wsl --install` then `winget install Docker.DockerDesktop` |
| Unblocks | Items 3–7, 11–14 (Docker, persistence, backup, restore, rollback, health) |
| Does **not** unblock | Items 8–10 — HTTPS, cookies over TLS, reverse proxy. Those need a real domain |

Good enough to prove the images work. Not enough to close the release.

### Option C — a Mac or Linux machine you already have

Same as A, but local. Docker Desktop or Docker Engine, plus a domain for the TLS half.

---

## Items 1 & 2 — Plan and commands: **PASS**

Produced and committed. No host required to write them.

| Deliverable | Where |
|---|---|
| Deployment plan | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Host build, firewall, systemd, cron | [SERVER_SETUP.md](SERVER_SETUP.md) |
| Every Docker command with expected output | [DOCKER_VERIFICATION.md](DOCKER_VERIFICATION.md) |
| Automated nine-check verifier | `scripts/verify-docker.sh` |
| Deploy / rollback / backup / restore / health / startup | `deploy/*.sh` |
| Reverse proxy | `deploy/Caddyfile`, `deploy/nginx-safeops.conf` |

---

## Items 3–14 — Execution

### 3. Deploy with Docker Compose — **BLOCKED**

*Cause:* no container runtime.

```bash
cd /srv/safeops/safeops-platform
```

```bash
cp .env.prod.example .env.prod && chmod 600 .env.prod && npm run keygen
```

```bash
node scripts/validate-compose.mjs
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

*Already PASS:* the compose file is structurally validated, and every command **inside**
the images has been executed natively — `npm ci --omit=dev`, `prisma generate`,
`npm run build`, `node dist/server.js`, `prisma migrate deploy`.

### 4. Verify every container — **BLOCKED**

```bash
docker compose -f docker-compose.prod.yml ps
```

```bash
docker inspect --format '{{.State.Health.Status}}' $(docker compose -f docker-compose.prod.yml ps -q api)
```

Expect three services, `db` healthy, `api` healthy.

### 5. Verify PostgreSQL persistence — **BLOCKED**

**The single most important check on this page.** If it fails, no customer data is safe.

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c 'SELECT count(*) FROM "Company";'
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c 'SELECT count(*) FROM "Company";'
```

The two counts must match.

### 6. Verify uploads survive restart — **BLOCKED**

```bash
docker compose -f docker-compose.prod.yml exec api sh -c 'echo probe > /data/uploads/.persist'
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

```bash
docker compose -f docker-compose.prod.yml exec api cat /data/uploads/.persist
```

*Already PASS:* `UPLOAD_DIR` is configurable and its writability is checked at boot, so a
missing mount stops the process rather than losing evidence silently.

### 7. Verify scheduler survives restart — **BLOCKED**

```bash
docker compose -f docker-compose.prod.yml restart api
```

```bash
docker compose -f docker-compose.prod.yml logs --tail=40 api | grep 'scheduler running'
```

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U safeops -d safeops -c 'SELECT count(*) FROM "Notification";'
```

Restart again; the count must not increase.

*Already PASS natively:* verified twice — 12 notifications raised on a fresh install, and a
forced restart raised none.

### 8. Verify HTTPS — **BLOCKED**

*Cause:* no TLS terminator and no domain.

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

```bash
curl -sI http://app.yourdomain.com | head -1
```

```bash
curl -vI https://app.yourdomain.com 2>&1 | grep -iE 'SSL certificate verify|HTTP/2 200'
```

```bash
curl -sI https://api.yourdomain.com | grep -i strict-transport-security
```

### 9. Verify cookies — **BLOCKED over TLS**

```bash
cd api && npx tsx scripts/headers-probe.ts https://api.yourdomain.com https://app.yourdomain.com
```

Then the part no script can do: **sign in, press F5, confirm you are still signed in.**
That is `SameSite=Strict` crossing a real domain boundary, and it is the most likely
deployment-day failure.

*Already PASS over HTTP:* `HttpOnly` ✓, `Secure` ✓ (production mode), `SameSite=Strict` ✓,
`Path=/auth` ✓.

### 10. Verify reverse proxy — **BLOCKED**

```bash
curl -fsS https://api.yourdomain.com/health/ready
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://attacker.example' https://api.yourdomain.com/auth/login
```

```bash
docker compose -f docker-compose.prod.yml logs --tail=5 api
```

The logged client IP must be the real caller, not the proxy — per-IP rate limiting depends
on the forwarded headers being right.

### 11. Verify backup — **BLOCKED**

```bash
deploy/backup.sh
```

Produces a dump, an uploads tarball and a row-count manifest, and rejects a dump
`pg_restore` cannot read.

*Cause:* `pg_dump` is not on this machine — the embedded PostgreSQL ships only `initdb`,
`pg_ctl`, `postgres`. It **is** in the API image.

### 12. Verify restore — **BLOCKED**

```bash
deploy/restore.sh /backups/db-<stamp>.dump
```

Takes a safety dump first, restores database and uploads together, compares every table
against the manifest, and checks for orphaned child records.

**Record the elapsed time — that number is your RTO. Until you have it, you do not have one.**

*Already PASS at the application layer:* the in-app restore drill was executed and produced
a precise, uncomfortable result — parents restore, their history does not. 11 of 32 incident
timeline entries and 20 of 38 permit precaution checklists were not restored. Stated in red
in the restore dialog.

### 13. Verify rollback — **BLOCKED**

```bash
deploy/rollback.sh
```

*Already PASS in substance:* the previous release was checked out into a worktree and run
against an already-upgraded database. It started, served, and passed all 21 security checks.
That is the rollback that matters — migrations are additive, so an older release runs
against a newer schema unchanged. What is untested is the *script*, not the property.

### 14. Verify health endpoints — **BLOCKED in containers**

```bash
curl -fsS https://api.yourdomain.com/health
```

```bash
curl -fsS https://api.yourdomain.com/health/ready
```

```bash
deploy/healthcheck.sh
```

*Already PASS natively:* `/health` 200; `/health/ready` 503 with the dependency named when
the database is unreachable; recovery without a restart, verified twice.

---

## Item 15 — Human-executable checklist: **PASS**

Below. One working day on the host from Option A.

---

# Deployment day

Tick each line. Stop at the first failure — a later check passing while an earlier one
failed tells you nothing.

## Before you start — 15 min

- [ ] Host provisioned: 2 vCPU, 4 GB, 50 GB, Ubuntu 24.04 · `nproc && free -h && df -h`
- [ ] SSH works as a non-root user
- [ ] Domain has two A records pointing at the host · `dig +short app.yourdomain.com`
- [ ] **Both names share a registrable domain** — otherwise sessions die on reload
- [ ] Backup destination decided (off-host)

## Host build — 45 min · [SERVER_SETUP.md](SERVER_SETUP.md)

- [ ] `sudo apt update && sudo apt upgrade -y`
- [ ] Timezone set · `sudo timedatectl set-timezone Asia/Kuching`
- [ ] Non-root user; root and password SSH login disabled — **confirm a second session works before closing the first**
- [ ] Firewall: 22, 80, 443 only · `sudo ufw status verbose`
- [ ] Docker installed · `docker run --rm hello-world`
- [ ] `/srv/safeops` and `/backups` created and owned

## Configure — 20 min

- [ ] Repository cloned to `/srv/safeops`
- [ ] `cp .env.prod.example .env.prod && chmod 600 .env.prod`
- [ ] `npm run keygen`, both keys pasted in
- [ ] Database password generated · `openssl rand -base64 24`
- [ ] `CORS_ORIGINS` and `VITE_API_BASE_URL` set to the real hostnames
- [ ] `node scripts/validate-compose.mjs` → structurally sound

## Deploy — 2–4 h *(the unpredictable step)*

- [ ] `bash scripts/verify-docker.sh` → all nine checks pass

That script covers items 3–7 and 14. If it stops, fix what it names and run it again.

- [ ] **§6 passed** — company count identical across a full `down`/`up`. If not, **stop**: the volume is not persisting

## TLS — 1 h

- [ ] Caddy installed and `deploy/Caddyfile` in place with your hostnames
- [ ] `sudo caddy validate --config /etc/caddy/Caddyfile`
- [ ] `curl -sI http://app.yourdomain.com | head -1` → `301`
- [ ] `https://app.yourdomain.com` loads with a valid certificate
- [ ] HSTS present on both names
- [ ] `npx tsx api/scripts/headers-probe.ts https://api… https://app…` → HttpOnly, Secure, SameSite=Strict; unknown origin refused
- [ ] **Sign in, press F5, still signed in** ← the one that catches the cookie/domain mistake

## Customer workspace — 20 min

- [ ] Company and first site created
- [ ] Administrator created with `mustChangePassword: true`
- [ ] **Demo seed NOT run** · `SELECT count(*) FROM "Company";` returns only theirs
- [ ] First password delivered out of band
- [ ] They have signed in and set their own
- [ ] A second administrator exists

## Backup and restore — 1 h

- [ ] `deploy/backup.sh` → dump, uploads tarball, manifest
- [ ] Nightly cron installed
- [ ] Off-host copy working
- [ ] `deploy/restore.sh <dump>` on a scratch host
- [ ] Restore matched the manifest, no orphaned records
- [ ] **RTO recorded: ________ minutes**

## Security — 15 min

- [ ] `npx tsx api/scripts/security-probe.ts https://api.yourdomain.com` → 21/21
- [ ] `npx tsx api/scripts/attack-probe.ts https://api.yourdomain.com` → 18/18
- [ ] Non-admin cannot reach Administration
- [ ] Audit log shows today's setup actions

## Resilience — 30 min

- [ ] `docker compose ... restart api` → recovers, scheduler restarts, no duplicate notifications
- [ ] `docker compose ... stop db` → `/health` 200, `/health/ready` 503; start it → recovers **without a restart**
- [ ] `sudo reboot` → `deploy/healthcheck.sh` passes **without anyone touching it**
- [ ] `deploy/rollback.sh` exercised at least once

## Browsers — 2 h · [BROWSER_COMPATIBILITY.md](BROWSER_COMPATIBILITY.md)

- [ ] Chrome — sign in, reload, dashboard, report an incident
- [ ] Edge — same
- [ ] Firefox — same
- [ ] **Safari — same. The highest-risk target: strictest about cookies**
- [ ] Mobile Safari on a real iPhone
- [ ] Android Chrome on a real device

## Hand over — 1 h

- [ ] [CUSTOMER_ACCEPTANCE.md](CUSTOMER_ACCEPTANCE.md) completed and signed
- [ ] §10 limitations **read aloud** — especially: no email
- [ ] [SUPPORT_RUNBOOK.md](SUPPORT_RUNBOOK.md) handed over
- [ ] Escalation contacts filled into [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md)
- [ ] Monitoring pointed at `/health/ready`
- [ ] **No uptime SLA offered.** Single host, nightly backups, no redundancy

---

## When every box is ticked

This becomes **READY FOR LIMITED PRODUCTION**, with the eight known limitations disclosed
in writing.

Until then it remains **READY FOR DESIGN PARTNER PILOT**, and that is an accurate
description rather than a cautious one: the application is verified, the deployment is not.
