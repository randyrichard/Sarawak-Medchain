# Final report

31 July 2026 · `feature/permit-to-work` · RC1

Every figure below was produced by executing something on this machine. Where something
could not be executed, it says so and is not counted as verified.

---

# 🟢 READY FOR DESIGN PARTNER PILOT

Not LIMITED PRODUCTION. Three verifications remain, all blocked by the same missing host
software, none by the code. The exact work is at the end.

---

## 1. Deployment status

| Item | Status | Evidence |
|---|---|---|
| Docker build | **BLOCKED** | No docker/podman/nerdctl, no WSL2, not administrator. Checked again today |
| Compose structure | **Verified** | `validate-compose.mjs` — parses, resolves anchors, no keys under the wrong parent, db unpublished, three volumes, every service has logging and a restart policy, all six required vars documented. Proven non-vacuous against a deliberately broken copy |
| Migrations | **Verified** | 15 applied to an empty database; zero drift; upgrade byte-identical across 27 tables |
| Seed strategy | **Verified** | Base and demo separate; demo idempotent; production path never runs the demo seed |
| Health endpoints | **Verified** | `/health` 200; `/health/ready` 503 with the dependency named when the database is gone |
| Graceful shutdown | **Verified** | SIGTERM drains, disconnects Prisma, force-exits at 10 s |
| Production entrypoint | **Verified** | `npm start` → `node dist/server.js` boots and serves |
| Deployment scripts | **Verified (syntax + logic)** | Eight scripts `bash -n` clean; path resolution and the Docker guard tested from a foreign working directory |
| Image size | **Not measured** | Needs a build |
| Volume persistence | **Not exercised** | The down/up check is §6 of `verify-docker.sh` |

## 2. Infrastructure status

Three real risks found this cycle and fixed — none visible from application code:

| | Was | Now |
|---|---|---|
| Connection pool | Unbounded. Prisma sizes from host CPU count: 17 connections on 8 cores, **65 on 32**. Two instances could exhaust PostgreSQL's 100 | `connection_limit=20`, `pool_timeout=15`, `max_connections=100` explicit |
| Rate limit | 600/min **per IP**, hardcoded. A customer behind corporate NAT is one IP — forty people would throttle their own company | 3,000/min, tunable |
| Log rotation | **None.** json-file is unbounded; the API writes a line per request. A full disk stops PostgreSQL | 20 MB × 3 per service |

| Measured | Value |
|---|---|
| Cold boot | **2,388 ms** |
| Warm boot | **922 ms** |
| API memory, steady | 196 MB |
| API memory, 1000 concurrent | 465 MB peak |
| PostgreSQL memory | 28 MB |
| DB connections under load | 12–18, flat |

## 3. Security status

| | Result |
|---|---|
| Controls (`security-probe`) | **21/21** |
| Attacks (`attack-probe`) | **18/18** |
| Tenant isolation | 10 endpoints, all 403 cross-tenant |
| Authentication | `alg:none`, re-signed payload, tampered signature, forged token — all 401 |
| **Session expiry** | **Verified today** with a 1-minute-TTL instance: fresh token 200 → expired token 401 `unauthenticated` → refresh cookie still valid → replacement token works and differs |
| Privilege escalation | Body-supplied and header-supplied roles both ignored |
| Mass assignment | A permit cannot be created already issued; workflow-owned incident fields ignored |
| Race conditions | Ten concurrent creates → ten distinct references; concurrent approvals do not bypass the control gate |
| Replay | Refresh rotation: first 200, replay 401 |
| Upload abuse | Executable refused; traversal filename never becomes the stored path |
| Passwords | Argon2id; secrets stored as SHA-256 digests only |
| Audit trail | 21 call sites recording actor, role, IP, device |

## 4. Performance

Measured today against the running stack.

| Operation | Median |
|---|---|
| **Dashboard — all 9 calls in parallel** | **416 ms** ← what a user waits for |
| Login (Argon2id) | 191 ms |
| Incident creation | 7 ms |
| Permit creation | 12 ms |
| Individual dashboard endpoints | 3–15 ms |
| Training matrix | 5 ms |
| Certificate register | 9 ms |
| Asset register | 11 ms |

Under concurrency, with the limiter lifted:

| Users | p50 | p95 | Server errors |
|---|---|---|---|
| 100 | 123 ms | 563 ms | 0 |
| 500 | 936 ms | 2,683 ms | 0 |
| 1000 | 1,376 ms | 5,789 ms | 0 |

Across all three tiers the API logged **21,011 requests with zero 5xx and zero unhandled
errors**. The 3,555 failures seen at 1000 concurrent were the load generator exhausting
sockets client-side, not the server.

No N+1 anywhere: query counts are identical at 12 rows and at 100 drawn from 5,012.

## 5. Remaining risks

### Blocking LIMITED PRODUCTION

| # | Risk | Removes it |
|---|---|---|
| R1 | **Images never built.** Every command inside them is verified; the images are not | `bash scripts/verify-docker.sh` — 2–4 h |
| R2 | **No TLS handshake.** Configs written; `Secure` and HSTS confirmed in production mode | Deploy behind Caddy, then sign in and press F5 — 1 h |
| R3 | **Restore never executed.** `pg_dump`/`pg_restore` are not on this machine | `deploy/restore.sh` on a scratch host, timed — 1 h |

### Customer

| Risk | Severity | Workaround |
|---|---|---|
| Expects emailed escalations | High | None. **Say it before they sign.** Reminders exist and are reliable; they live in the bell |
| Uses Safari or Firefox | High | Untested. The test is: sign in, reload, stay signed in |
| Relies on the in-app restore | Medium | Measured: 11 of 32 incident timelines and 20 of 38 permit checklists not restored. Stated in red at the point of decision |
| Grows past 2,000 records in a register | Low | Search and filters are server-side and reach everything |
| Asks how the Safety Score works | Low | It is not computed. Have the answer ready |

### Operational

| Risk | Severity | Workaround |
|---|---|---|
| First Docker build fails | Medium | Expected. `verify-docker.sh` stops at the first failure with a specific message |
| Web and API on different registrable domains | Medium | Sessions die silently on reload. Called out in four places |
| Slow memory growth over weeks | Unknown | Four-minute soak shows flat connections, sawtooth heap. Weekly checks in MONITORING.md |
| Single instance | Low | Accepted for a pilot. `unless-stopped`; the scheduler is idempotent |

## 6. Open bugs

**None known.** Two were found this cycle, both in my own verification tooling:

| Was | Why it mattered | Now |
|---|---|---|
| `attack-probe` counted a check that could not run as "repelled" — it would print 18/18 while two never executed | A verification script reporting success it did not earn is worse than no script | Skipped checks excluded from the denominator, listed, and force a non-zero exit |
| `attack-probe` crashed with a stack trace when the login throttle was exhausted | Looked like a product failure; was the limiter working | Explains the cause and how to clear it |

## 7. Production checklist

| | Status |
|---|---|
| No Critical issues | ✅ |
| No High issues | ✅ |
| 298 API + 36 web tests | ✅ |
| Both typechecks, both builds | ✅ |
| Migrations from empty, zero drift, lossless upgrade | ✅ |
| Rollback proven (previous release against the newer schema) | ✅ |
| Security 21/21, attacks 18/18 | ✅ |
| Session expiry and refresh | ✅ |
| Scheduler live and idempotent | ✅ |
| Database outage recovery, no restart | ✅ |
| Connection pool bounded | ✅ |
| Log rotation configured | ✅ |
| Documentation (13 documents) | ✅ |
| **Docker images built** | ❌ blocked |
| **HTTPS handshake** | ❌ blocked |
| **Restore drill executed** | ❌ blocked |

## 8. Customer checklist

[CUSTOMER_ACCEPTANCE.md](CUSTOMER_ACCEPTANCE.md) — 10 sections, sign-off, and a section
requiring the eight known limitations to be read aloud and acknowledged.

The line that matters most is 4.8: **sign in, press F5, stay signed in.** That is the
`SameSite=Strict` cookie crossing a real domain boundary, and it is the single most likely
deployment-day failure.

## 9. Rollback procedure

```bash
deploy/rollback.sh
```

Returns the **application only**. Migrations are additive, so the previous release runs
against the newer schema unchanged — verified by checking out the previous release and
running it against an already-upgraded database, where it served and passed all 21 security
checks.

The database is not rolled back, and that is correct: rolling it back would discard
everything the customer entered since the deploy. If a future migration is genuinely
destructive that stops being true, and the answer becomes `deploy/restore.sh` with the
pre-deploy backup — which `deployment.sh` takes automatically.

## 10. Estimated uptime

**No uptime commitment should be given for this pilot.**

An availability figure is a measurement, and nothing has run in production for a single
day. What can honestly be said:

| | |
|---|---|
| Architecture | Single instance, single database, single host. **No redundancy** |
| Planned downtime | ~30 s per deploy; ~15 s per restart |
| Unplanned, database blip | The API stays up and returns 503; recovers without a restart — verified twice |
| Unplanned, host loss | RTO 2 h, RPO 24 h — **both untested targets, not commitments** |
| Realistic expectation | 99% (≈7 h/month) for a single-host pilot with nightly backups |

Say this to the customer: *"One server, nightly backups, and we will tell you when
something breaks. This is a pilot, not a service with an SLA."* Offering 99.9% on this
architecture would be a promise the deployment cannot keep.

---

## Exact work to reach 🚀 READY FOR LIMITED PRODUCTION

Three tasks. None is code. One working day.

### 1. Build and prove the images — 2–4 h

```bash
cd safeops-platform && bash scripts/verify-docker.sh
```

Nine checks, stops at the first failure. **§6 is the one that matters**: it counts
companies, tears the stack fully down, brings it back and counts again. If the numbers
differ, the volume is not persisting and no customer data is safe.

### 2. TLS, and prove the session — 1 h

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

```bash
cd api && npx tsx scripts/headers-probe.ts https://api.customer.example https://app.customer.example
```

Then the part no script can do: **sign in, press F5, confirm you are still signed in.**

### 3. Drill the restore, timed — 1 h

```bash
deploy/backup.sh
```

```bash
deploy/restore.sh /backups/db-<stamp>.dump
```

It takes a safety dump first, compares every table against the manifest, and checks for
orphaned children. Record the elapsed time on line 6.5 of the acceptance checklist — that
number is your RTO, and until you have it, you do not have one.

**When all three pass, this is 🚀 READY FOR LIMITED PRODUCTION**, with the eight
limitations disclosed to the customer in writing.
