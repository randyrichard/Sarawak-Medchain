# Pilot readiness

Assessment of whether SafeOps can be put in front of a real company, what to show them,
and what to fix first. Written 29 July 2026 against `feature/permit-to-work` at `141f715`.

---

## Verdict

**Go — for a demo and a design-partner pilot. No-go for unsupervised production use.**

Every module is backed by PostgreSQL with server-enforced rules, 281 integration tests run
against a real database, and the full journey has been walked in the browser for both
tenants. The product does what it claims on screen.

What it is not yet is a system you can hand over and walk away from. There is no scheduler,
so the reminders and escalations the UI describes do not fire on their own. Uploaded files
live on the API server's local disk. Only the login endpoint is rate-limited. None of that
blocks a demo or a supervised pilot with one friendly customer; all of it blocks a signed
contract with an SLA.

The honest framing for a first meeting: *"This is running on a real database with real
enforcement, and here is a workspace being used. These three things are still manual, and
your pilot is how we decide the order we automate them."*

---

## 1. Demo readiness checklist

Run through this the morning of the meeting, not in the room.

### Environment

- [ ] `npm run dev` from `safeops-platform/` — starts Postgres (5433), API (4000), web (5181)
- [ ] `npm run demo` in `api/` — dataset present and dated relative to today
- [ ] Sign in at http://localhost:5181 as `hse@demo.safeops.app` / `SafeOpsPlatform2026`
- [ ] Mission Control shows a permit expiring within the hour (proves the data is live, not a screenshot)
- [ ] Browser console clean on a fresh load — no red
- [ ] Second browser profile or incognito ready, in case a session needs resetting mid-demo

> If anything looks stale or half-populated: `npm run demo:reset` takes about 20 seconds and
> rebuilds everything with fresh relative dates.

### Content

- [ ] Incident register opens on 4 open incidents, none titled "Load test incident"
- [ ] Permit board shows work in progress with a live countdown
- [ ] Corrective actions board shows one genuinely overdue item
- [ ] Audit register shows one audit held open by an unverified finding
- [ ] Training shows 75% compliance with visible gaps — not 100%, not 0%
- [ ] Company switcher offers both Borneo Industrial and Kenyalang Construction

### Machine

- [ ] Laptop on mains, sleep disabled — the API and Postgres do not survive a suspend cleanly
- [ ] Notifications and chat muted
- [ ] Browser zoom at 100%, window at least 1280 wide
- [ ] `docs/` and this file closed — do not screen-share the risk list

### Do not demonstrate

These work, but they invite a question the pilot build cannot answer well:

- **Backup & Recovery** — restore is additive and functional, but there is no scheduler, so
  "Daily 02:00" is aspirational. Background jobs now correctly read "not yet run / Scheduled".
- **API & Webhooks** — keys and secrets are stored as digests and the screens are real, but
  the usage series is empty and no webhook has ever been delivered.
- **Roles & Permissions matrix** — it is a declaration of intent. Authorisation switches on
  `Membership.role` in the services; editing a cell does not change what an endpoint allows.
  Say so if asked. Do not let a prospect believe they can self-serve a custom role.

---

## 2. Suggested demo dataset

Loaded by `api/prisma/demo.ts`. Idempotent, tagged by `createdBy` so a reset removes exactly
what it created, and dated relative to the run so it never goes stale.

| | Borneo Industrial (enterprise, 6 sites) | Kenyalang Construction (standard, 3 sites) |
|---|---|---|
| Incidents (open + closed) | 12 | 4 |
| Corrective actions | 14 | 4 |
| Permits | 6 | 1 |
| Assets | 10 | 2 |
| Inspections | 20 | 4 |
| Audits | 5 | 2 |
| Audit findings | 3 | 1 |
| Compliance obligations | 8 | 5 |
| Controlled documents | 6 | 2 |
| Certificates | 73 | 3 |
| Employees | 18 | 2 |
| Platform users | 7 | 2 |

It is shaped around the moments worth showing rather than volume:

- **A permit inside its final hour.** The board sorts it to the top with a live countdown. If
  the meeting overruns it lapses on screen, which demonstrates derived status better than any
  explanation. A second hot-work permit has three hours left as a safety margin.
- **One genuinely overdue corrective action**, high priority, four days late, with an owner.
- **Two high-risk incidents with no investigator** — the alarm Mission Control exists to raise.
- **An audit that scored 78% and cannot close** because one Major finding's action is unverified.
- **75% training compliance** with six people carrying a lapsed mandatory certificate and
  eleven certificates inside the renewal window.
- **Three assets past their inspection date**, one carrying a defect from a failed check.
- **A second tenant with entirely different numbers**, so switching workspaces proves isolation.

Nothing in it is visibly tagged as demo data. The tidy pass also archives the 500 load-test
incidents that made the register unusable — archived rather than deleted, so a single `UPDATE`
restores them.

```bash
cd safeops-platform/api && npm run demo:reset
```

---

## 3. Suggested first-pilot user journey

Forty minutes. The order matters: lead with the thing that has no substitute, and let each
screen answer the question the previous one raised.

**1 · Mission Control (5 min).** Sign in as Marcus Tan, HSE Manager. Do not narrate the tiles.
Point at the priority queue: *"This is what my morning looks like. Everything here is a real
record — I can open any of them."* Open the overdue action. Then the site map: Bintulu is red
and the reason is on the card.

**2 · The permit that is about to expire (8 min).** Click through from the queue. Show the
precaution checklist, the gas test that had to pass before issue, the countdown. Then attempt
to close it while an isolation is still applied and let the server refuse. **This is the
strongest moment in the demo** — it is the difference between a form and a control, and it is
the thing a paper system cannot do. Do not rush it.

**3 · Report an incident, live (8 min).** Switch to Amirul Hassan, Site Safety Officer. Report
something from the room — a trip hazard, a near miss the visitor mentions. Watch it appear
with a real INC number. Advance it one stage, raise a corrective action, assign it. Then jump
back to Mission Control and show the counters moved.

**4 · An audit that will not close (6 min).** Open the contractor audit at 78%. Show the Major
finding and its unverified action. *"This audit stays open until someone verifies that work.
Not because of a policy document — because the system refuses."*

**5 · Competency (5 min).** The matrix, filtered to the gaps. Six people are not competent for
their role today. Scan a certificate's QR code with a phone and let the verification page load
with no login. Auditors and clients can check a certificate without being given access.

**6 · Switch tenants (3 min).** Change to Kenyalang Construction. Every figure changes. *"This
is a different customer. Same platform, no shared data — the separation is enforced in the
database, not in the interface."*

**7 · Their turn (5 min).** Hand over the laptop. Let them click. This is where you find out
what they actually care about, and everything before it was setup for this.

**Close on the pilot ask, not on features.** One site, one month, their real incidents. What
you need from them is a named HSE owner and their existing incident form.

---

## 4. Remaining risks

Ordered by what would hurt most, soonest.

### Would break a pilot

| Risk | Detail | Fix |
|---|---|---|
| **No scheduler** | The UI promises reminders at 7/3/1 days, escalation at T+5 and T+10, certificate expiry scans and daily backups. Nothing runs them. A pilot customer will notice within a fortnight that no email ever arrived. | A cron worker calling existing service methods. The logic is written; only the trigger is missing. |
| **Uploads on local disk** | Incident attachments write to `api/uploads/`. On a container platform that is wiped on redeploy, and it is not shared between instances. | S3-compatible object storage, or a mounted volume plus a single instance for the pilot. |
| **`sameSite: strict` refresh cookie** | Correct for a same-site deployment. If the web app and API end up on different registrable domains (`*.vercel.app` and `*.onrender.com`, say), the browser will never send the refresh cookie and no session will survive a reload. | Deploy both under one domain, or relax to `sameSite: none; secure` with the CORS allowlist doing the work. Decide before the first deploy, not after. |

### Would embarrass in a demo

| Risk | Detail | Status |
|---|---|---|
| **12-month trend charts are illustrative** | Mission Control's incident/near-miss/LTI series and the safety-score sparklines come from seeded curves. The headline near-miss figure is now real and the sparkline is rebased to end on it, but the shape is invented. | Unfixed. There is no history endpoint. Low risk — a new customer has no history either — but do not point at the curve and attribute meaning to it. |
| **Safety Score and its deltas** | The composite score and every "vs last month" delta are seeded. The definition tooltip describes a formula that is not computed. | Unfixed. If asked how the score is calculated, say it is being finalised with pilot customers. Do not read the tooltip aloud. |
| **Global search** | The header search box reads "coming with data modules" and does nothing. | Unfixed, and honestly labelled. Expect it to be the first thing a visitor clicks. |

### Would matter to a security-minded buyer

| Risk | Detail | Status |
|---|---|---|
| **No rate limiting outside auth** | `/auth/login` and `/auth/refresh` are limited. The eight module routers are not. Every endpoint requires a valid session, so this is a denial-of-service and scraping concern rather than an access one. | Unfixed. One `express-rate-limit` applied at the app level would close it. |
| **Permission matrix is display-only** | Documented in the schema and above. A buyer who edits a cell and expects an endpoint to close will be wrong. | By design, but say it out loud rather than being asked. |
| **CSV import size** | The admin importer accepts up to 500,000 characters by validation, but `express.json` caps the body at 100 kB, so anything larger fails with a 413 and a confusing message. | Unfixed. Cosmetic mismatch — align the two bounds. |
| **Dev cluster encoding** | The local PostgreSQL cluster was initialised under a Windows locale and is WIN1252, not UTF-8. Production will be UTF-8. Stored text avoids characters that differ (`O2`, not `O₂`), and `scripts/dev.mjs` now pins `--encoding=UTF8` for new clones. | Contained. The existing cluster is deliberately not rebuilt — it holds local development data. |

### Accepted, low

- Three backup rows and one invited-but-not-activated user (Nadia Rahim) remain in the demo
  tenant. Both look like normal usage and are worth keeping.
- Chunk sizes exceed Vite's 500 kB warning. The charts bundle is 525 kB raw, 156 kB gzipped.
  Fine over broadband; worth code-splitting before a mobile-heavy rollout.

---

## 5. Final fixes before the first customer meeting

Nothing on this list blocks the meeting. Ordered by value per hour.

**Before the meeting (about an hour):**

1. Run `npm run demo:reset` on the demo machine and walk the journey end to end once. Any
   surprise you find in rehearsal is one the customer does not.
2. Decide the answer to *"what happens when someone doesn't do their action?"* The escalation
   is described in the UI and does not run yet. Have the sentence ready.
3. Disable sleep on the demo laptop. Postgres and the API do not recover from a suspend
   cleanly, and recovering takes longer than the room's patience.

**Before a pilot customer touches it (roughly a week):**

4. Build the scheduler. It is the single largest gap between what the interface promises and
   what the system does.
5. Move uploads to object storage.
6. Settle the cookie and domain question, then deploy once and verify a session survives a
   reload on the real domain.
7. Add app-level rate limiting.

**Before a paying customer (later):**

8. Compute the safety score, or remove it. A headline number nobody can explain is worse than
   no headline number.
9. Real 12-month trends once a tenant has 12 months.
10. Wire the permission matrix to enforcement, or relabel it as documentation.

---

## What was fixed to get here

For the record, the pilot-hardening pass found and closed:

- Mission Control's priority queue and insights panel asserted specific facts about records
  that did not exist (`CA-440`, `PTW-1183`, "night-shift incidents up 18%") beneath a footnote
  claiming they were generated from the workspace's own data. Both now derive from live rows.
- The site risk map kept seeded per-site counts while the KPI tiles read live, so one screen
  could report one overdue action for the company and five for a single site.
- `listActions` dropped the `siteId` the server sends, leaving every row in the corrective
  action register unattributed and the site filter matching nothing.
- The assignee directory spanned every company in the fixture set, so Borneo's "assign owner"
  dropdown listed Kenyalang's staff.
- The admin console formatted a never-run job's null timestamp as a date — "ran 20663d ago" —
  beside a green OK.
- Four client methods (`addIncidentAction`, `updateIncidentAction`, `addIncidentAttachment`,
  `capaAnalytics`) still wrote to localStorage despite the server endpoints existing.
- A production build with no `VITE_API_BASE_URL` fell back to in-browser mock authentication.
  It now fails closed.
