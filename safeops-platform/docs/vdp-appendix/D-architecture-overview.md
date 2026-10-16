# SafeChain — Product Architecture Overview

*Appendix D. One page. Every statement below was read from the SafeChain source code and
deployment configuration on 13 October 2026; the final section lists what is not yet in
place, for the same reason.*

---

## What it is

A multi-tenant web application for occupational safety and health management. One
deployment serves many customer organisations; each organisation's data is separated from
every other's. An organisation contains projects, projects contain sites, and a user's
access can be narrowed to named sites.

## Shape

```
                                    ┌─────────────┐
   browser ──TLS──▶  Caddy  ──┬──▶  │  web        │  static React application
                              │     └─────────────┘
                              │     ┌─────────────┐     ┌──────────────┐
                              └──▶  │  api        │ ──▶ │  PostgreSQL  │
                                    └─────────────┘     └──────────────┘
                                    ┌─────────────┐            ▲
                                    │  worker     │ ───────────┤  scheduled work
                                    └─────────────┘            │  (reports, reminders)
                                    ┌─────────────┐            │
                                    │  backup     │ ───────────┘  periodic dumps
                                    └─────────────┘
```

Six services, defined in `docker-compose.prod.yml`: `db`, `backup`, `api`, `worker`,
`web`, `caddy`.

## Technology

| Layer | What runs there |
|---|---|
| Web | React 18, Vite 5, TypeScript 5.6, Tailwind CSS 3.4 |
| API | Node.js, Express 4, TypeScript, Prisma 5.22, Zod request validation |
| Database | PostgreSQL 16 (container image pinned by digest, not by tag) |
| Edge | Caddy 2 — TLS termination and reverse proxy |
| Passwords | Argon2 (`@node-rs/argon2`) |
| Reports | Generated server-side as PDF (PDFKit) |
| Email | SMTP or Resend, via Nodemailer |

## Modules

Incidents · Incident Board · Corrective Actions · Assets & Inspections · Permits to Work ·
Visitors · Toolbox Meetings · Training & Competency · Employees · Contractors ·
HSE Performance · Reports · Audits & Compliance

## Roles

Six, defined in the database schema: `ceo`, `admin`, `hse_manager`, `safety_officer`,
`supervisor`, `employee`. Permission is checked at the API, not in the browser.

## How one customer is kept separate from another

Two independent lines:

1. **Application layer.** Every service resolves the signed-in caller's organisation from
   their session before it queries, and routes require a membership in that organisation.
   A user's membership may additionally name specific sites, which narrows every register
   they can read.

2. **Database layer.** PostgreSQL row-level security policies on the 35 tables that carry
   an organisation identifier. The API declares the caller's organisation as a
   transaction-local setting before each query; with nothing declared, a policy matches
   nothing, so a code path that forgot to say who it is acting for reads no rows rather
   than reading all of them.

   Four tables are deliberately outside these policies — `Membership`, `Invitation`,
   `ApiKey` and `SecurityPolicy` — because they are read while signing in or redeeming an
   invitation, before the caller's organisation is known. Child tables without their own
   organisation identifier are reached through a parent row that the policies do cover.

## Sessions

The access token is short-lived and held in memory only — never in browser storage, so it
cannot be read back by a script after the tab closes. The refresh token is an httpOnly
cookie marked `SameSite=Strict`, which requires the application and API to be served from
one registrable domain.

## Deployment

A Docker Compose stack, bound to the loopback interface by default so that nothing is
exposed until a reverse proxy is deliberately put in front of it. Separately, a public
demonstration build — the web application alone, with invented sample data and no server —
deploys to Cloudflare Workers.

---

## Not yet in place

Stated here rather than omitted, so that this document can be checked:

- **Encryption at rest** is a property of the hosting and is not configured, because the
  system does not yet run on hosted infrastructure. TLS in transit is configured.
- **Database-level isolation is currently inert.** The policies above are written and
  migrated, but they bind a restricted database login that takes effect only once
  `APP_DB_PASSWORD` is set, which it is not in the present configuration. Until then the
  application layer is the only line.
- **Multi-factor sign-in** requires a key (`MFA_SECRET_KEY_B64`) that is not yet generated.
- **No mail provider is configured**, so reports are produced and stored but not emailed.
- **No external certification** is held or claimed — no ISO 27001, no SOC 2, and no
  assessed statement of PDPA compliance.
