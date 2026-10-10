# Putting Cloudflare in front of SafeChain

Two separate things, on purpose:

- **The public demo** (below, at the end) can go on Cloudflare today. It is the web app on
  its own with invented sample data, for showing prospects. No customer data, no server.
- **A real deployment** puts Cloudflare in front of the SafeChain server. That needs a domain
  and a server first, and is the rest of this document.

Cloudflare gives you three things this deployment does not have: a WAF, DDoS absorption, and
a CDN. It is free at the tier that matters here.

It is also not configurable yet, and it is worth being clear why before you start.

## Prerequisites you do not have yet

1. **A domain that resolves.** `safeops.com.my` is still NXDOMAIN. Cloudflare works by
   becoming your domain's nameservers, so there must be a domain to move.
2. **A server with a public address.** Cloudflare proxies to an origin; today the origin is
   a laptop.
3. **Registrar access.** For a `.com.my` that is MYNIC, and changing nameservers there is
   the step that actually switches Cloudflare on.

Everything below is ready to execute the day those three exist. Nothing in it can be done
sooner, and configuring Cloudflare against a domain you do not control yet is not possible.

## The change that had to happen in the code

Adding Cloudflare inserts a hop:

    before   browser → Caddy → api
    after    browser → Cloudflare → Caddy → api

`req.ip` is how the API buckets rate limits and how it fills the audit trail and login
history. Express finds it by walking `X-Forwarded-For` from the right and skipping a
configured number of trusted hops. That number was hardcoded to 1, which was correct before
and wrong after — every visitor would have been recorded as Cloudflare, one person's abuse
would have throttled an entire customer, and the security log would have named the CDN as
the actor for every action anybody took.

Nothing would have failed. That is what makes it worth doing before rather than after.

**Putting Cloudflare in front does not change `TRUST_PROXY`.**

The setting names the peers allowed to speak for a client, not how many hops there are.
Cloudflare talks to Caddy; Caddy talks to the API over the private compose network. The peer
this process sees is still Caddy, so the default `loopback,linklocal,uniquelocal` remains
correct. Change it only if something on a public address reaches the API directly, in which
case name that address rather than adding a count.

Do not raise it speculatively. Trusting more hops than exist is worse than trusting too few:
a client can send `X-Forwarded-For` themselves, and a process that skips past the real proxy
will believe them.

## Setup, in order

### 1. Add the domain

Cloudflare dashboard → Add a site → enter the domain → **Free** plan. It scans existing DNS
records; check the ones it imports.

### 2. Change nameservers at MYNIC

Cloudflare gives two nameservers. Set them at the registrar. Propagation is usually under an
hour; the dashboard tells you when it is active. **Nothing below works until it is.**

### 3. DNS records

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `app` | your server's IPv4 | **Proxied** (orange cloud) |
| A | `api` | your server's IPv4 | **Proxied** (orange cloud) |

Proxied is the whole point — grey-cloud means DNS only and you get none of the protection.

### 4. TLS mode: Full (strict)

SSL/TLS → Overview → **Full (strict)**.

- *Flexible* is plaintext from Cloudflare to your server. Do not use it: every invitation and
  reset link carries a single-use credential, and this is the leg they would cross unencrypted.
- *Full (strict)* requires a valid certificate on the origin, which Caddy already obtains.

Turn on **Always Use HTTPS** and **Automatic HTTPS Rewrites**.

### 5. Lock the origin down

This is the step people skip, and skipping it makes the WAF decorative: if your server
answers the whole internet, an attacker reaches it directly by IP and never passes through
Cloudflare at all.

Allow inbound 80 and 443 **only from Cloudflare's published ranges**
(`https://www.cloudflare.com/ips/`), on the provider firewall — DigitalOcean cloud firewall,
or `ufw` on the droplet.

### 6. WAF

Security → WAF → enable **Cloudflare Managed Ruleset**. Leave the OWASP ruleset off at first:
it is noisy, and a false positive here blocks somebody filing an incident report.

Add one rate-limiting rule to start:

    If  URI Path equals /auth/login
    Then  Block for 10 minutes after 20 requests in 1 minute, per IP

The API already rate-limits login at exactly this shape. The Cloudflare rule stops that
traffic before it reaches your server at all, which is the difference between absorbing an
attack and merely surviving one.

### 7. What to leave off

- **Rocket Loader** — it rewrites and injects script. The Content-Security-Policy in
  `web/nginx.conf.template` allows `'self'` plus one hash and nothing else, so Rocket Loader
  will be blocked by the browser and the app will not boot.
- **Auto Minify** — the Vite build already minifies; a second pass risks breaking the CSP hash.
- **Cloudflare Web Analytics** — it injects a script from `static.cloudflareinsights.com`,
  which the CSP blocks. Adding it to `connect-src`/`script-src` weakens a policy that is
  currently tight for the sake of page-view counts.
- **Caching HTML.** `/assets/*` is already immutable and safe to cache. `index.html` must not
  be, or people run a stale bundle after a deploy. The nginx config already sets
  `Cache-Control: no-store` on it; leave Cloudflare's default respecting that.

## After it is live, check these

1. `TRUST_PROXY` is left at its default, unless something public reaches the API directly.
2. Sign in, then Administration → Security → Login History. **The IP shown must be yours,
   not a Cloudflare address.** If it is Cloudflare's, hop count is wrong and the audit trail
   is being filled with the wrong actor.
3. `curl` your server's raw IP on port 443. It should refuse. If it answers, step 5 is
   incomplete and the WAF can be bypassed.
4. `deploy/healthcheck.sh` passes, including the `APP_PUBLIC_URL` resolution check.

## What Cloudflare does not do

It does not protect against anything on the far side of it: a stolen password, a
misconfigured role, or an authorised user exporting data they are entitled to. It absorbs
volume and filters known-bad patterns. Every finding in the security audit was on the
application side, and none of them would have been stopped by a WAF.

## The public demo

The web app runs entirely in the browser in demo mode: two invented companies, their
people, incidents, permits and so on, with nothing sent anywhere. That needs no server, so
it can be hosted on Cloudflare Workers as static files, free, today.

It is a separate Cloudflare Worker, `safeops-demo`. It is not the `sarawak-medchain` Worker,
which is the earlier MedChain product built from `frontend/`.

### What makes it safe to publish

- **Its own build.** `npm run build:demo` (`web/scripts/build-demo.mjs`) is the only build
  allowed to sign in without a server (`VITE_OFFLINE_DEMO`). Every other production build
  without an API address still refuses to sign anyone in.
- **Its own password.** The demo accounts' password is the demo's, shown on its sign-in
  page. It is not the password the API seed gives the same accounts, so the demo never
  publishes something a seeded server would accept. `demoBuild.test.ts` fails if they match.
- **It says what it is.** Every screen carries "Demo mode. Everything here is made-up sample
  data…". Nothing typed leaves the visitor's browser.
- **Same security headers as a real deployment.** The build writes `dist/_headers` from
  `nginx.conf.template`, so the Content-Security-Policy cannot drift; the page may connect
  only to itself.
- **It never calls a server.** Screens that need one (Visitors, Employees, HSE Performance,
  the incident board, some reports) say so rather than trying.

`npm run verify:bundle` reports the demo accounts in a demo build. That is correct: that
check is for customer builds, and the demo is the one build meant to contain them.

### Setting it up (once, in the Cloudflare dashboard)

1. **Workers & Pages → Create → Import a repository →** `randyrichard/Sarawak-Medchain`.
2. Settings:

   | Setting | Value |
   |---|---|
   | Project name | `safeops-demo` (must match `web/wrangler.jsonc`) |
   | Production branch | `feature/permit-to-work` (where SafeChain lives) |
   | Root directory | `safeops-platform/web` |
   | Build command | `npm run build:demo` |
   | Deploy command | `npx wrangler deploy` |
   | Non-production branch deploy command | `npx wrangler versions upload` |
   | Build watch paths, include | `safeops-platform/web/*` |
   | API token | Create new token |

   No build variables are needed; the build script sets everything.
3. Deploy. The address is `https://safeops-demo.<your-subdomain>.workers.dev`.
4. Optional: in the `sarawak-medchain` Worker, set its build watch path to `frontend/*`, so
   SafeChain commits stop triggering MedChain builds.

### Checking it

Open the address, pick a role under "Demo workspace", and sign in. The "Demo mode" note is
at the top of every screen. Reload a deep link such as `/permits`: it must load the app, not
a Cloudflare 404.

