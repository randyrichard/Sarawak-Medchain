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

**The API and web ports bind to `127.0.0.1`.** On a public server, publishing them on
`0.0.0.0` would put plaintext HTTP on the public interface beside the HTTPS one, and
anything reaching it bypasses TLS and HSTS entirely. Caddy reaches both over the compose
network, so the loopback default costs nothing. Change `BIND_HOST` only if your TLS
terminator runs on a different machine.

**TLS is opt-in, not absent.** `--profile tls` starts Caddy from `deploy/Caddyfile`, which
obtains and renews a real Let's Encrypt certificate automatically. Omit the profile if a
load balancer or an existing nginx terminates TLS instead — nothing else changes.

---

# Production setup — first deployment

The whole sequence, in order. Steps 1–6 put it up; 7–11 are the checks that tell you it
actually works. Do not skip 7–11: every one of them has caught something real.

### 1. Copy the template

```bash
cd safeops-platform && cp .env.prod.example .env.prod
```

`.env.prod` is gitignored. It will hold every secret this deployment has — do not commit
it, and do not paste it into a chat window.

### 2. Generate secrets

A fresh database password, generated on the machine, never reused from anywhere:

```bash
openssl rand -base64 24
```

Put it in `POSTGRES_PASSWORD`. Then the token-signing keypair:

```bash
cd api && npm run keygen
```

That prints `JWT_PRIVATE_KEY_B64` and `JWT_PUBLIC_KEY_B64`. Copy both into `.env.prod`.
These sign every access token; rotating them signs everyone out, which is the correct
emergency response to a suspected compromise.

### 3. Set the domain

Replace every `REPLACE_ME` in `.env.prod`. They are written as `REPLACE_ME.example.com` on
purpose: `example.com` is reserved by RFC 2606, and the API refuses to boot on it — so a
half-filled config fails immediately instead of mailing your customer links to a domain
that does not exist.

`SAFEOPS_APP_DOMAIN` and `SAFEOPS_API_DOMAIN` **must share a registrable domain**
(`app.yourcompany.com` + `api.yourcompany.com`). The refresh cookie is `SameSite=Strict`;
a pair on unrelated domains silently drops it and nobody stays signed in.

### 4. Set APP_PUBLIC_URL

```
APP_PUBLIC_URL=https://app.yourcompany.com
```

`https`, always. Every invitation and password-reset link is built from this and each one
carries a single-use credential in the URL. The API refuses to start on a plaintext value,
on localhost, and on a reserved domain.

### 5. Configure DNS

Point both names at the server's public IP, and **wait for them to resolve before starting
the stack**:

```bash
dig +short app.yourcompany.com api.yourcompany.com
```

This has to come first. Caddy proves control of both names to obtain a certificate, so
starting before DNS resolves means a failed challenge and a rate-limit counter you did not
need to spend. Ports 80 and 443 must be reachable from the internet for the same reason.

Then run the pre-flight on the server. It checks that both names resolve **to this
server**, that the app and API share a registrable domain, that `APP_PUBLIC_URL`,
`VITE_API_BASE_URL`, `CORS_ORIGINS` and `COOKIE_DOMAIN` agree with each other, and that no
template placeholder (including an SMTP password still reading `APP_PASSWORD`) is left.
It starts nothing and prints no secret:

```bash
deploy/preflight.sh                # add --behind-cdn if the names point at Cloudflare
```

`deploy/deployment.sh` runs it first on every deploy and stops before building if it fails.
Every script in `deploy/` also turns on `--profile tls` by itself whenever
`SAFEOPS_APP_DOMAIN` is set, so a restart or rollback does not leave Caddy stopped.

### 6. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tls up -d --build
```

First start applies all migrations to an empty database and Caddy obtains certificates.
Give it a minute, then check nothing is restarting:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile tls ps
```

### 7. Verify HTTPS

A real certificate, and HTTP redirecting to it:

```bash
curl -sI https://app.yourcompany.com | head -1
```

```bash
curl -sI http://app.yourcompany.com | grep -i "^location"
```

The first must be `200` **without** `-k` — needing `-k` means the certificate is not
trusted and the pilot is not ready. The second must redirect to `https://`.

HSTS is set by Caddy:

```bash
curl -sI https://app.yourcompany.com | grep -i strict-transport
```

### 8. Verify health

```bash
curl -s https://api.yourcompany.com/health/ready
```

`/health/ready` reports on the database, not just the process. Use it, not `/health`.

### 9. Verify login

Bootstrap the first platform administrator (section 4 below has the detail):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  node dist/cli/grantPlatformAdmin.js you@yourcompany.com --create --reset-link
```

Open the printed link in a browser, set a password, and sign in. Confirm the URL is
`https://` and that the session survives a page reload — if it does not, the two hostnames
are not on one registrable domain and the `SameSite=Strict` cookie is being dropped.

### 10. Verify the API

From a browser on the app, the dashboard should load with data. From a terminal, confirm
the API refuses what it should:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.yourcompany.com/api/incidents
```

Must be `401`. Anything else means authentication is not being enforced — stop and
investigate before letting a customer near it.

### 11. Verify backup and restore

Do this **before** go-live, not after the first incident:

```bash
./deploy/backup.sh
```

Then restore that dump into a scratch database and check it, per section 9. A backup you
have never restored is a hypothesis, not a backup.

**`safeops_uploads` is not in the database dump.** `pg_dump` covers Postgres only; the
uploads volume holds incident photographs and permit documents and needs its own copy.
`deploy/backup.sh` tars it separately — make sure both end up off this host.

---

## 1. Configure

```bash
cd safeops-platform && cp .env.prod.example .env.prod
```

> **Every value in `.env.prod` must be generated fresh for your deployment.** The file is
> gitignored and no real value is committed anywhere in this repository. If you have been
> handed a `.env.prod` that already contains keys, a database password or
> `*.example.com` hostnames, it is a local **test** file from development — regenerate all
> of it. Reusing a development key means anybody who has seen this repository's history can
> mint tokens for your customers.
>
> Fresh values needed: `POSTGRES_PASSWORD`, both `JWT_*_B64` keys, and the four hostname
> settings (`CORS_ORIGINS`, `VITE_API_BASE_URL`, `APP_PUBLIC_URL`, `COOKIE_DOMAIN`).

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

**`APP_PUBLIC_URL` must be the https address your users actually visit.** Every invitation
and report link is built from it. The API validates it at boot and refuses to start if it
is missing, if it points at `localhost`/`127.0.0.1` (a link nobody outside the machine can
reach looks like it worked to whoever sent it), or **if it is not https**.

The https requirement is not cosmetic: those links carry a single-use credential in the
URL — the invitation that creates an account and the reset link that takes one over — so
over plaintext the token is readable in transit and is all an attacker needs. TLS
terminates upstream of the container, so this value is the only place the deployment
declares its scheme.

If the container exits immediately on first deploy, one of these is almost always why; the
reason is on the first line of `docker compose logs api`.

**Web and API must share a registrable domain.** The refresh cookie is
`sameSite=strict`, so `app.example.com` + `api.example.com` works and
`safeops.vercel.app` + `safeops.onrender.com` does not — the browser will silently refuse
to send the cookie and no session will survive a page reload. Decide this before the first
deploy.

## 2. Build and start

**Prerequisites:** Docker Engine with Compose v2. Verified against Docker 29.6.2 / Docker
Desktop 4.84 on WSL2. The build pulls `node`, `nginx` and `postgres` base images by digest,
so the first build needs network access to Docker Hub; after that it is offline-capable.
The API image is ~577 MB and the web image ~76 MB.

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

### What the bundle still contains

The browser bundle carries the in-app mock backend, and it is worth being precise about
what that does and does not mean.

**No credentials ship.** The demo password, the demo account addresses and the fixture user
records are compiled out of a production build, and that is enforced rather than trusted:

```bash
cd safeops-platform/web && npm run build && npm run verify:bundle
```

It scans every built file and exits non-zero if a credential appears. Wire it into CI ahead
of any deploy.

**Fictional content does ship.** Names like "Marcus Tan", the two demo company names and
some fake IP addresses remain inside the mock backend's generator functions. They are
synthetic, grant nothing, and the mock never executes in production — `VITE_API_BASE_URL`
is set, so every module is served by the API.

They are still bundled because the mock is not an optional module: `client.ts` ends with
`export const api = new MockApiClient()`, and that class holds the mock stores as fields and
switches to the server per feature internally. Removing it from the bundle means replacing
the API client that several dozen components import — a refactor, not a configuration
change, and not one to attempt while hardening. The residue is bundle size and a slightly
unprofessional view-source, not a security exposure.

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

Confirm the deployment is serving, closed to anonymous callers, and sending its security
headers. This is anonymous and read-only, so it is safe against a customer's live data, and
`deploy/deployment.sh` already runs it as its last step:

```bash
cd safeops-platform && deploy/smoke.sh https://api.example.com https://app.example.com
```

Expect `All smoke checks passed.` On a **demo or staging** deployment that has the seeded
demo accounts, also run the signed-in probe (`deploy/deployment.sh --demo-probe` does it for
you). It cannot run against a real customer database, which has no demo accounts:

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

  https://app.yourcompany.com/reset-password?token=JEXBDE2ST8FJ…
```

The token is a query parameter, not a path segment. That is the shape the app's route
expects, and an earlier version of this command printed the other one — which opened a
not-found page and left the only account on the deployment unusable.

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

Optional to start, and the product is honest without it: reports still generate and
download, and invitations and password resets still work — the console shows the
administrator a link to pass on by hand. Nothing is ever recorded as emailed when it was
not.

**What configuring it turns on.** One provider, one code path, three workflows:

| Workflow | Without email | With email |
|---|---|---|
| User invited, or customer provisioned | Admin copies the link and sends it | Invitation emailed automatically |
| Admin issues a password reset | Link shown once, admin passes it on | Link emailed; the console says "emailed" and shows nothing |
| **User forgets their password** | **No recovery without a human** | Self-service — they request it from the sign-in page |
| Scheduled reports | Generated and downloadable | Delivered on schedule |

The third row is the one that matters for a pilot. Without email there is no self-service
recovery at all, so a customer's **sole administrator** who forgets their password has
nobody in the product who can help them — you have to run a CLI command on the server for
them. That is tolerable for one pilot customer and does not scale past a handful.

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

## 7. TLS and the reverse proxy

**What has and has not been proven.** `deploy/Caddyfile` is syntactically valid — checked
by running `caddy validate` against it, which also confirms it enables automatic
HTTP→HTTPS redirection. The stack has been exercised end-to-end over real HTTPS behind a
**locally-generated self-signed certificate**: TLS handshake, HSTS, the redirect, `Secure`
cookies, https links, and correct client IPs through `X-Forwarded-For`.

**No certificate from a public CA has ever been issued for this deployment**, because that
requires a domain this repository does not have. Issuance is the one step nobody can do
for you. Everything it depends on — the redirect, the headers, the proxy handling — has
been verified; the certificate itself has not.

With `--profile tls`, Caddy handles issuance and renewal automatically once DNS points at
the server. Without it, the stack publishes two plain-HTTP ports on loopback and expects
something in front of them:

| Service | Container port | Fronted by |
|---|---|---|
| web (nginx, static bundle) | 8080 | your TLS terminator |
| api (node) | 4000 | your TLS terminator |

Whatever terminates TLS — a load balancer, Caddy, or an nginx you already run — must:

- serve both on **one registrable domain** (`app.example.com` + `api.example.com`). The
  refresh cookie is `SameSite=Strict`, so unrelated domains silently drop it and no session
  survives a reload.
- send `Strict-Transport-Security: max-age=31536000; includeSubDomains`. The app does not
  set HSTS itself: it is only meaningful over HTTPS, and emitting it from a container that
  serves plain HTTP would be wrong on any deployment that terminates elsewhere.
- preserve `X-Forwarded-For`. The API trusts one proxy hop (`trust proxy = 1`), and the
  request log and rate limiter both read the client IP from it.
- **not** strip or rewrite the response headers the web container sets. It already sends
  the Content-Security-Policy, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` and `Permissions-Policy`; a proxy that adds its own duplicates can
  produce a *more* restrictive combined policy than either intended.

After go-live, confirm from outside:

```bash
curl -sI https://app.example.com | grep -iE "strict-transport|content-security-policy"
```

```bash
cd safeops-platform/api && npx tsx scripts/headers-probe.ts https://api.example.com https://app.example.com
```

## 7a. Content-Security-Policy

The web container sets a CSP on every response. Scripts and styles are same-origin only —
there is no CDN, analytics tag or external font anywhere in the bundle.

Two directives are worth knowing about:

- **`script-src` carries a hash**, not `'unsafe-inline'`. `index.html` has one small inline
  script that applies the saved dark/light theme before first paint. If you edit that
  script the hash stops matching and the page breaks immediately — recompute it with
  `node -e` over the script body and update `web/nginx.conf.template`.
- **`style-src` is split into `-elem` and `-attr`.** Inline style *attributes* cannot be
  permitted by a nonce or a hash — CSP has no mechanism for it — and the app sets them in
  around 140 places, as does the charting library, so `style-src-attr 'unsafe-inline'`
  remains a genuine limitation short of a frontend refactor. Inline `<style>` *elements*
  are a separate question and were measured rather than assumed: the dashboard and a
  Recharts analytics view were both loaded and produced **zero** `<style>` elements, so
  `style-src-elem 'self'` blocks an injected stylesheet outright. The broad `style-src`
  stays only as a fallback for browsers that do not implement the narrower pair.

  Inline *style* cannot execute script; the residual exposure is restyling, not code
  execution.

`connect-src` must name the API origin, which is a different host. It is substituted at
container start from `CSP_CONNECT_SRC`, which `docker-compose.prod.yml` derives from
`VITE_API_BASE_URL` — so it follows the value the bundle was built against automatically.
If API calls fail with a CSP error in the browser console, those two have drifted apart.

### Locked out of a platform-admin account

A platform administrator belongs to no company, and the only in-product password reset is
scoped to one — an admin issuing it for a user in their workspace. So nothing in the product
can recover the account that creates every customer. Forgetting the password, or letting the
30-minute bootstrap link lapse, used to mean deleting the row and starting again.

Issue a fresh link from the server instead:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -e SAFEOPS_AUDIT_ACTOR="you@safeops.app" api node dist/cli/grantPlatformAdmin.js --reset-link you@safeops.app
```

It prints a `?token=` link that works once and expires in 30 minutes, and it cancels any
earlier unused link. **The existing password keeps working until the new link is used**, so
issuing one is not a lockout in itself. It changes no privilege, refuses an account that is
not active, and is recorded as `platform_admin_reset_link` in the audit trail — the trail
records that a link was issued, never which one.

Customer users do not need this: their own workspace admin issues reset links from
**Administration → Users**. It is only the platform account, which has no admin above it,
that has to be recovered from the server.

## 7b. Who has platform access

Every grant, revoke and refusal is written to `PlatformAuditEntry` — a separate table from
the tenant audit trail, because a platform administrator belongs to no customer:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT at, action, outcome, actor, \"actorHost\", \"targetEmail\", detail FROM \"PlatformAuditEntry\" ORDER BY at DESC LIMIT 20"'
```

Refused attempts are recorded too, so a grant somebody tried and did not get is visible.
The rows never contain a password, a hash or a reset token.

**Name yourself when you run the grant command.** Inside a container there is no OS user
and the hostname is a container id, so an unattributed row reads `unattributed` — true, and
no use to anyone asking who made an account staff months later:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -e SAFEOPS_AUDIT_ACTOR="you@safeops.app" api node dist/cli/grantPlatformAdmin.js someone@safeops.app
```

Review it alongside the current holders:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT email, status FROM \"User\" WHERE \"platformAdmin\" = true"'
```

## 8. Capacity

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

## 9. Backup and restore

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

## 10. Upgrading

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

## Before the first customer: go-live check

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/cli/goLive.js
```

It reports PASS, WARN or FAIL for each of these, and exits 1 on any FAIL:

- **Email:** whether it can send. Without it, invitations and resets are links an
  administrator passes on by hand.
- **Demo logins:** demo accounts still on the published password. Production refuses that
  password at sign-in unless `ALLOW_DEMO_ACCOUNTS=true`.
- **Backups:** whether a backup was taken in the last 26 hours, and whether
  `BACKUP_LOCATION` leaves the machine.
- **Database role:** whether the API connects as the restricted role, which is what makes
  row-level security apply.
- **MFA:** whether the MFA key is set.
- **Worker:** whether it is running, which is what sends reminders and reports.
- **Business day:** the time zone in use.

Fix every FAIL before customers sign in. Each WARN is a decision to make and write down.
