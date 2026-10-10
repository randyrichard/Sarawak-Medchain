# PRODUCTION CHECKLIST

What is already proven, and what only you can do.

The split matters. Everything in the first section has been executed and observed; nothing
in it is inferred from reading code. Everything in the second section is unverifiable from
this repository because it requires a domain, a server and credentials that do not exist
here — and claiming otherwise would be the one failure mode a safety product cannot afford.

---

## ALREADY VERIFIED

Run against the production Docker stack, not a dev server.

### Build and runtime
- [x] API and web images build from the production Dockerfiles
- [x] Containers start and report healthy
- [x] API runs as **uid 1000 (`node`)**, not root
- [x] `/health` and `/health/ready` answer 200 — readiness reports on the database
- [x] Graceful shutdown: `SIGTERM` drains and exits **0** in ~6s, inside Docker's 10s grace

### Database
- [x] **37 migrations** apply to a completely empty database
- [x] `prisma migrate status` clean against the running instance
- [x] Foreign keys enforce tenant relationships

### Backup and restore
- [x] `pg_dump` → clean database → `pg_restore`, row counts matching exactly
- [x] `verifyRestore` exits 0 and enumerates every tenant
- [x] **Uploads survive a real round trip** — a file uploaded through the product, the
      volume wiped, restored from its tarball, byte-identical (md5 verified) and downloadable
      through SafeChain afterwards
- [x] Confirmed the uploads file is **not** inside the PostgreSQL dump

### Security
- [x] Cross-tenant reads refused **403** on incidents, permits, users, sites, reports, activity
- [x] Own-tenant reads 200
- [x] Customer → platform endpoints **403**, including with a fully valid provisioning
      payload; nothing was created
- [x] Unauthenticated → **401** on every protected route tested
- [x] `/platform/me` returns `platformAdmin:false` to customers and leaks nothing
- [x] Exactly **one** platform administrator, holding **no** workspace membership
- [x] Platform admin cannot be invited into a workspace — refused at invitation *and* at
      acceptance; the CLI refuses the reverse direction
- [x] Revoking platform admin takes effect on the next request, read from the database
- [x] Cookies `HttpOnly; Secure; SameSite=Strict`
- [x] CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` all served
- [x] No credentials in the shipped bundle (`verify:bundle`, 86 files)
- [x] No reset or invitation tokens in application logs
- [x] `.env.prod` and every `.env.prod.*` backup gitignored
- [x] `npm audit --omit=dev --audit-level=high` clean, both packages

### Application
- [x] Production refuses to boot on a non-https `APP_PUBLIC_URL`, on localhost, and on a
      reserved documentation domain
- [x] A customer provisioned, invited, accepted, signed in, reported an incident, advanced
      it, and raised a permit — all confirmed in PostgreSQL
- [x] Email architecture: one provider seam, invitation and reset templates, failure handled
      without leaking tokens

---

## MANUAL PRODUCTION STEPS — MY ACTION REQUIRED

None of this can be done from the repository.

### 1. Domain
- [ ] Register a domain (~RM 50/year)
- [ ] Decide `app.` and `api.` hostnames — they **must** share a registrable domain, or the
      `SameSite=Strict` refresh cookie is dropped and nobody stays signed in

### 2. Server
- [ ] Rent a VPS — **4 GB RAM minimum**; the Vite build dies on 2 GB
- [ ] Singapore region for Malaysian latency (~10 ms)
- [ ] Ubuntu 24.04 LTS, SSH key auth only

### 3. DNS
- [ ] `A` record for `app` → server IP
- [ ] `A` record for `api` → server IP
- [ ] **Confirm both resolve before starting the stack** — Caddy proves control of them to
      get a certificate, and starting early spends a rate-limit attempt
- [ ] Cloudflare users: set both to **DNS only** (grey cloud) until HTTPS is confirmed

### 4. Server hardening
- [ ] Create a non-root user, add to `docker` group
- [ ] `ufw allow OpenSSH` **before** `ufw enable` — reversing these locks you out
- [ ] Allow 80 and 443 only; leave 4000 and 8080 closed (they bind to loopback)
- [ ] 2 GB swap so the web build cannot OOM

### 5. Secrets — generate on the server
- [ ] `openssl rand -base64 24` → `POSTGRES_PASSWORD`
- [ ] `npm run keygen` → the JWT keypair
- [ ] Never generate these on your laptop, never paste them into a chat window

### 6. Configuration
- [ ] `cp .env.prod.example .env.prod`
- [ ] Replace **every** `REPLACE_ME` — they are `.example.com` on purpose so the API refuses
      to boot if one is missed
- [ ] `APP_PUBLIC_URL=https://app.yourdomain.com`

### 7. SMTP — MY ACTION REQUIRED
- [ ] Obtain real credentials (Resend with a verified domain, or SMTP)
- [ ] Set `REPORT_EMAIL_FROM` plus exactly one transport
- [ ] **Verify a sending domain.** Without one, most providers deliver only to your own
      address and every customer invitation is refused
- [ ] Send yourself an invitation and confirm it arrives, including spam placement

### 8. Deploy
- [ ] `deploy/preflight.sh` reports **Ready.** (DNS points here, one registrable domain, no placeholders)
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tls up -d --build`
- [ ] Confirm nothing is restarting

### 9. TLS — MY ACTION REQUIRED
- [ ] `curl -sI https://app.yourdomain.com` returns 200 **without `-k`**
- [ ] HTTP redirects to HTTPS
- [ ] `Strict-Transport-Security` present
- [ ] Certificate chain valid in a real browser
- [ ] Client IP logged correctly through `X-Forwarded-For`, not the proxy's

> TLS has been exercised behind a locally-generated self-signed certificate — handshake,
> HSTS, redirect, secure cookies and forwarded IPs all verified. **No certificate from a
> public CA has ever been issued for this deployment.** That step is yours.

### 10. First accounts
- [ ] `grantPlatformAdmin.js you@yourcompany.com --create --reset-link`
- [ ] Set the password, sign in, **reload the page** — if the session dies, the two
      hostnames are not on one registrable domain
- [ ] Provision the first pilot company from the console
- [ ] Confirm the invitation email arrives

### 11. Backup
- [ ] `./deploy/backup.sh` — writes a database dump **and** a separate uploads tarball
- [ ] Copy both **off the server**. A backup on the machine it protects is not a backup
- [ ] Schedule nightly via cron
- [ ] **Restore once, before go-live**, per `RESTORE.md`

### 12. Rollback
- [ ] Read `deploy/rollback.sh` before you need it
- [ ] Know which image tag you are rolling back to
- [ ] Know that a migration is not automatically reversible — restoring the database is the
      rollback for a schema change

---

## Post-deploy verification

Run these from outside the server:

```bash
curl -sI https://app.yourdomain.com | head -1
```

```bash
curl -s https://api.yourdomain.com/health/ready
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.yourdomain.com/incidents
```

The last must be **401**. Anything else means authentication is not being enforced — stop
and investigate before a customer sees it.
