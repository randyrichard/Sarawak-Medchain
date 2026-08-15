# DEPLOYMENT

Putting SafeOps on a server for a pilot customer.

> **The images build and run.** Both were built with the compose file below, started as a
> three-container stack, and exercised: migrations applied, `/health` and `/health/ready`
> answered 200, unauthenticated requests refused, a foreign CORS origin declined, the first
> platform administrator bootstrapped, two customers provisioned, and `docker stop`
> completed in one second with the drain logic running.
>
> The first real build found three faults that no amount of reading the Dockerfile would
> have shown, all now fixed:
>
> 1. **Everything under `/app` was root-owned** while the process runs as `node`, so
>    `prisma migrate deploy` could not write to `node_modules/@prisma/engines`. The
>    container died on its first command and restarted forever.
> 2. **`openssl` was missing.** Prisma selects its query engine by probing the libssl
>    version; without it the probe failed and every database call would have used the wrong
>    engine.
> 3. **The build and runtime stages disagreed about openssl**, so `prisma generate`
>    produced a `linux-musl` engine while the runtime looked for
>    `linux-musl-openssl-3.0.x`. The image built cleanly and failed at run time.
>
> Base images are now pinned by digest. `node:24-alpine` had already drifted from Alpine
> 3.21 to 3.24.1, and that drift is what moves the openssl major underneath fault 3.

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

### The three settings that will bite you

**`CORS_ORIGINS` and `VITE_API_BASE_URL` must match your real hostnames.**
`VITE_API_BASE_URL` is compiled into the browser bundle at build time — changing it needs a
rebuild, not a restart.

**`APP_PUBLIC_URL` must be the address your users actually visit.** Every invitation and
report link is built from it. The API validates it at boot and will not start without it,
and will not accept a `localhost` or `127.0.0.1` value — a link nobody outside the machine
can reach looks like it worked to whoever sent it. If the container exits immediately on
first deploy, this is almost always why; the reason is on the first line of
`docker compose logs api`.

**Web and API must share a registrable domain.** The refresh cookie is
`sameSite=strict`, so `app.example.com` + `api.example.com` works and
`safeops.vercel.app` + `safeops.onrender.com` does not — the browser will silently refuse
to send the cookie and no session will survive a page reload. Decide this before the first
deploy.

## 2. Build and start

**Prerequisites:** Docker Engine with Compose v2. Verified against Docker 29.6.2 / Docker
Desktop 4.84 on WSL2. The build pulls `node`, `nginx` and `postgres` base images by digest,
so the first build needs network access to Docker Hub; after that it is offline-capable.
The API image is ~525 MB and the web image ~76 MB.

```bash
cd safeops-platform && docker compose -f docker-compose.prod.yml --env-file .env.prod build
```

```bash
cd safeops-platform && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Migrations run automatically as the API container starts — the entrypoint applies them and
only then execs the server, so the app never serves against a schema it does not expect. No
separate migration step is needed on a normal deploy.

Expect all three containers to reach `healthy`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

`docker stop` is graceful: the entrypoint ends in `exec node`, so the server is PID 1 and
receives SIGTERM directly. A stop that takes ten seconds means something is wrong — that is
Docker's kill timeout expiring, not a clean drain.

### The demo sign-in panel

The login page carries one-click demo accounts and a shared password while developing.
They are **not** in a production bundle: the panel and the password literal are both
compiled out unless the build is a development one. A deliberate demo deployment can bring
them back with `VITE_DEMO_LOGINS=true` and `VITE_DEMO_PASSWORD=…` at build time.

If you ever see that panel on a customer's deployment, the bundle was built wrong — the
accounts it names are the ones the demo seed creates, one of which is an administrator.

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

The seed creates a demo workspace with known passwords. **Do not run it in production** —
it refuses to run when `NODE_ENV=production`, and that guard is the only thing standing
between a customer's deployment and six shared-password accounts.

Migrations have already run by this point: the API container applies them on start. You
only need this if you are re-running them by hand after a manual intervention:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api npx prisma migrate deploy
```

### Create the first platform administrator

Customers are created from inside the product, by a SafeOps platform administrator. That
is a different thing from a customer's own administrator: it is authority over every
tenant, and nothing in the customer-facing console can grant it. The first one has to be
made from the shell, once.

A fresh deployment has **no accounts at all** — there is no public sign-up, and the demo
seed refuses to run against production. So the first command opens the account and grants
the privilege together:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/cli/grantPlatformAdmin.js --create you@safeops.app
```

It prints a single-use link. Open it, choose your own password, and sign in:

```
Set a password with this single-use link:

  https://app.yourcompany.com/reset-password/JEXBDE2ST8FJ…
```

**No password is chosen by anyone, including you.** The account is created with a hash of
random bytes that nothing can reproduce, so until that link is used there is no working
credential for it — which is the same property that protects every customer administrator.
The link expires in 30 minutes and is shown once; run this interactively and don't pipe the
output anywhere it will be kept.

Afterwards, `--create` is not needed. For somebody who already has an account:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/cli/grantPlatformAdmin.js you@safeops.app
```

To take the flag away again:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/cli/grantPlatformAdmin.js --revoke someone@safeops.app
```

The command takes exactly one address and refuses two, rather than guessing which you
meant; it refuses to grant to a deactivated account, because platform authorization checks
status on every request and the grant would silently do nothing; and it always allows a
revoke, including from a deactivated account. Re-running it is safe and says "no change".

(In development the same tool is `npm run platform:grant -- you@safeops.app`. The deployed
image installs without dev dependencies, so it runs the compiled file directly.)

Keep this list short and review it: a platform administrator can see every customer on the
deployment. The flag is read from the database on every request rather than carried in the
session, so revoking it takes effect on the holder's next call, not when their token
expires.

### Create the customer

Sign in and open **SafeOps customers** in the sidebar — it only appears for platform staff.
"New customer" asks for the company, the plan, the first administrator and their first
site, and in one transaction creates:

- the company, on the chosen plan, with `subscriptionStatus: trial`
- one site
- one administrator, with an `admin` membership scoped to that company alone
- one invitation, valid for 7 days

Nobody at SafeOps ever holds a working password for a customer's workspace. The
administrator receives an invitation and chooses their own; the account is created in
`invited` status with no usable credential until they do. If a company name is submitted
twice the second attempt is refused rather than creating a duplicate tenant, so a
double-click cannot bill anybody twice.

No incidents, permits, audits or compliance records are created. A safety register that
arrives pre-filled with invented rows is worse than an empty one, because somebody
eventually has to work out which of them were real.

**If email is not configured**, the console says so plainly and shows the invitation link
once, for you to pass on yourself. Copy it then — it is a credential and is not shown
again. The same happens if the provider rejects the message; the customer is still created
correctly and the link still works.

Everything above is recorded in the new customer's own audit trail, including whether the
invitation email actually went out. The invitation token is never written to it.

## 5. Email

> **Live delivery is NOT VERIFIED.** No message has ever left this repository through a
> real provider: there is no Resend account, no API key and no verified sending domain
> here, and none was invented. What *is* verified, by test: the adapter's request shape,
> its idempotency key, its timeout, its failure classification, that a lone recipient is
> addressed directly rather than bcc'd, that the API key never appears in a log, an error,
> a response or the audit trail, and that a failed send leaves the invitation valid and
> says so honestly. The one unproven step is whether your account and DNS deliver — which
> is exactly what the drill at the end of this section is for.

Optional, and the product is honest without it: reports still generate and download, and
invitations still work — the console shows the administrator a link to pass on by hand.
Nothing is ever recorded as emailed when it was not.

Turning it on means setting a sender and exactly one transport.

```
REPORT_EMAIL_FROM="SafeOps <safeops@yourcompany.com>"
RESEND_API_KEY=            # from the Resend dashboard
```

`REPORT_EMAIL_FROM` becomes **required** the moment either transport is set. The API
refuses to start without it, because a relay rejects every message that has no From and
the run history would otherwise fill with failures caused by a missing line here.

### Resend

1. Add your sending domain in the Resend dashboard and complete its DNS records.
   **Until the domain is verified, Resend rejects every message.** This is the step most
   often skipped, and the symptom is every invitation showing *Email failed*.
2. Create an API key and put it in `.env.prod` as `RESEND_API_KEY`. It is read only by
   the API process. It is never sent to the browser, never written to the audit trail and
   never returned by any endpoint.
3. Restart the API and confirm the provider is live:

   ```
   curl -s -H "Authorization: Bearer $TOKEN" \
     'https://api.yourcompany.com/reports/catalog' | grep provider
   ```

   `"provider":"resend"` means the API has accepted the configuration. It does **not**
   mean a message has been delivered — only the test below proves that.

### SMTP instead

For a customer whose mail policy requires their own relay:

```
REPORT_EMAIL_FROM="SafeOps <safeops@yourcompany.com>"
SMTP_URL=smtps://user:password@smtp.yourcompany.com:465
```

Resend wins if both are set.

### Prove it works — do this before go-live

Email is the one part of this system that cannot be verified from the repository, because
it depends on a live account, a verified domain and DNS. Send one real invitation to an
address you control:

1. **Administration → Invitations → Invite user**, to your own address.
2. The confirmation should read *Invitation emailed*. If it shows a link to copy instead,
   nothing was sent — check `REPORT_EMAIL_FROM` and the key.
3. Open the mail. Confirm:
   - the sender is your `REPORT_EMAIL_FROM`;
   - the subject reads *You're invited to join &lt;Company&gt; on SafeOps*;
   - the **Accept invitation** link points at your `APP_PUBLIC_URL`, not localhost;
   - it arrived in the inbox rather than the spam folder.
4. Click it, set a password, sign in.
5. Back in **Invitations**, that row now reads *Accepted*.
6. In **Audit Log**, confirm `Invited user` and `Invitation email sent` are recorded, and
   that no token appears in either.

If the invitation shows **Email failed**, the reason from the provider is on the row —
that text is the provider's own, and it is usually a rejected key or an unverified domain.
The invitation itself is still valid: use **Resend** once the configuration is fixed.

## 6. Environment reference

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Set by compose from the Postgres credentials |
| `JWT_PRIVATE_KEY_B64` | yes | `npm run keygen`. Rotating it signs everyone out — that is the emergency response to a suspected compromise |
| `JWT_PUBLIC_KEY_B64` | yes | As above |
| `CORS_ORIGINS` | yes | Comma-separated. Only these origins may call the API |
| `APP_PUBLIC_URL` | **yes** | Where users reach the app. Every invitation and report link is built from it. Validated at boot: the API refuses to start without it, and refuses a `localhost`/`127.0.0.1` value — a link nobody outside the machine can reach looks like it worked to whoever sent it |
| `REPORT_EMAIL_FROM` | when email is on | Envelope sender, e.g. `SafeOps <safeops@yourcompany.com>`. Required as soon as a transport is set; the API refuses to boot without it |
| `RESEND_API_KEY` | no | Resend transport. Server-side only — never sent to the browser, never written to the audit trail, never returned by an endpoint |
| `SMTP_URL` | no | SMTP transport, for a customer using their own relay. Resend wins if both are set |
| `MAIL_REPLY_TO` | no | Where replies go, if not the sender |
| `SEED_ALLOW_PRODUCTION` | no | Leave unset. The demo seed refuses to run under `NODE_ENV=production` without it, because it creates accounts — including an administrator — sharing a password that is public in this repository |
| `VITE_API_BASE_URL` | yes | Build-time. A bundle built without it refuses to sign anyone in |
| `COOKIE_DOMAIN` | no | Set when web and API are on sibling subdomains |
| `ACCESS_TOKEN_TTL_MIN` | no | Default 15 |
| `REFRESH_TOKEN_TTL_DAYS` | no | Default 30 |
| `MAX_FAILED_LOGINS` | no | Default 5, then lockout |
| `LOCKOUT_MINUTES` | no | Default 15 |
| `SCHEDULER_ENABLED` | no | Default `true`. `false` on all but one instance if you scale out |
| `SCHEDULER_INTERVAL_MIN` | no | Default 15 |
| `UPLOAD_DIR` | yes in production | Must be a mounted volume. Checked for writability at boot — a missing or read-only mount stops the process rather than surprising someone mid-upload |

## 7. Capacity

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

## 8. Backup and restore

> **VERIFIED.** A full round-trip was executed against the running stack: two customers
> provisioned through the API, `pg_dump -Fc` inside the `db` container (224 KB), restore
> into a clean database with `pg_restore`, row counts identical (Company 2, Site 2, User 3,
> Membership 2, migrations 36), both tenants present with their plans intact, the API
> started against the restored database and served `/health/ready`, and a login using a
> password set *before* the dump succeeded. `verifyRestore` returned 0 on the restored
> database and 1 after a company row was deliberately deleted with the foreign key dropped.
>
> Run the drill at the end of this section on your own deployment anyway — this proves the
> procedure, not your disks.

The `db` service already mounts a `safeops_backups` volume at `/backups`, and the Postgres
image carries its own client tools, so the dump is taken inside that container.

### Take a backup

```bash
docker compose -f docker-compose.prod.yml exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /backups/safeops-$(date +%Y%m%d-%H%M%S).dump'
```

`-Fc` is the custom format: compressed, and restorable table-by-table if you ever need only
part of it.

**Copy it off the host.** A backup on the same machine as the database survives a bad
migration and nothing else — not a failed disk, not a lost server.

```bash
docker compose -f docker-compose.prod.yml cp db:/backups/safeops-20260815-120000.dump ./
```

Schedule it from the host's own cron, daily and before every upgrade. This product holds a
company's incident and audit history; some of it is what they would produce to a regulator,
and none of it can be reconstructed from anywhere else.

### Restore

Stop the API first, so nothing writes while the schema is being replaced:

```bash
docker compose -f docker-compose.prod.yml stop api
```

```bash
docker compose -f docker-compose.prod.yml exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /backups/safeops-20260815-120000.dump'
```

```bash
docker compose -f docker-compose.prod.yml start api
```

`--clean --if-exists` drops what it is about to replace, so the restore lands on a database
that already has a schema. It is destructive by design: everything written after the dump
is gone. That is the point, and it is why the drill matters more than the command.

Uploaded evidence — photographs attached to incidents — lives in the `safeops_uploads`
volume, **not** in the database dump. A restore that brings back the records without the
files leaves an investigation citing evidence that no longer exists, so back the volume up
alongside the dump:

```bash
docker run --rm -v safeops_uploads:/data -v "$PWD":/out alpine tar czf /out/safeops-uploads-$(date +%Y%m%d).tar.gz -C /data .
```

### Check a restored database before trusting it

`pg_restore` exiting zero means the file was readable, not that the result is something to
serve customers from. A dump taken mid-write, a restore that ran out of disk, or simply the
wrong file all produce a database that starts and answers queries.

```bash
docker compose -f docker-compose.prod.yml exec api node dist/cli/verifyRestore.js
```

It is read-only and safe to run against production at any time. It checks that the schema
is fully migrated and that no migration is stuck mid-change, that the core tables exist,
and that nothing is orphaned — sites whose company is gone, memberships whose user is gone,
incidents whose site is gone. Those are the joins a torn restore breaks first. It exits
non-zero if anything is wrong, so it can gate a script.

It then prints one line per customer, with site, user and incident counts:

```
tenants:
  Borneo Industrial Group (big): 6 site(s), 7 user(s), 520 incident(s)
```

**Read that list.** The structural checks pass happily on a restore of the wrong backup;
only somebody who knows the customers can see that a company is missing or that a year of
incidents is not there.

### The drill

Before go-live, prove the whole chain works together, on a throwaway copy:

1. Take a dump.
2. Restore it into a scratch database.
3. Run `verifyRestore.js` against the scratch database and confirm it exits 0.
4. Confirm a known incident **and its attachment file** are both there — the attachment
   comes from the uploads volume, not the dump, which is the failure this step exists to
   catch.

Do it once, on purpose, while nothing depends on the answer.

## 9. Upgrading

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
