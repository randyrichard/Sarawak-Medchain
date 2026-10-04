# Going live with a customer

What changes when SafeOps leaves localhost, and what has to be done or decided before a
company relies on it. Most of the list is now checked by a command. The rest are decisions
only the owner can make, and a check on real phones that no automated test replaces.

## 1. Run the go-live check

On the server, after deploying:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/cli/goLive.js
```

| Check | Fails or warns when |
|---|---|
| Email | Configured but cannot send (fail). Not configured: invitations and resets give the admin a link to pass on by hand (warn). |
| Demo accounts | A demo account still uses the published password `SafeOpsPlatform2026` (fail; warn if `ALLOW_DEMO_ACCOUNTS=true`) |
| Backups | No backup has completed, or the last one is over 26 hours old (fail). Backups are kept on the same machine (warn). |
| Database role | The API connects as the schema owner, so row-level tenant isolation does not apply (fail) |
| Multi-factor sign-in | No `MFA_SECRET_KEY_B64` (warn) |
| Worker | Has never run, or has stopped. Reminders and scheduled reports are not being sent (fail). |
| Public address | `APP_PUBLIC_URL` not set, so links in emails are wrong (fail) |
| Business day | Shows the time zone that "today" and "this month" use (`APP_TIMEZONE`, default Asia/Kuching) |

It exits with 1 on any failure, so it can gate a deploy script. Go live with no failures.
Every warning should be either fixed or decided on purpose.

## 2. Decisions only the owner can make

Each one needs a named answer, written down, before the first customer signs.

### Where the data lives (PDPA)

- **Decide:** the hosting provider and the country of the servers and backups.
- **Why it matters:** the records include injuries and medical details, which are sensitive
  personal data under the Personal Data Protection Act 2010.
- **If anything is outside Malaysia,** section 129, as amended on 1 April 2025, applies:
  - the destination must have substantially similar law, or ensure adequate protection;
  - a Transfer Impact Assessment is expected.
- **Hosting in Malaysia,** backups included, removes that step.
- **Then fill in** "Where it is stored" in `PERSONAL_DATA_PROTECTION_NOTICE.md`. The notice
  cannot be published with the placeholder in it.

### Who is woken up when it breaks

- **Decide:**
  - who receives the uptime alert;
  - how fast they must respond;
  - who covers when they are away.
- **Why it matters:** SafeOps is where injuries are reported and permits are signed off, so
  an outage during a shift is noticed on site before anyone else knows.
- **Setup:**
  - An **external** uptime monitor on `/health/ready` and the web address. See
    `MONITORING.md`. A monitor on the same machine cannot report that the machine is down.
  - The alert should reach a phone, not only an inbox.
- **Agree the response time with the customer.** A sole developer cannot honestly promise
  round-the-clock cover. Write down what is promised, for example "reply within 4 working
  hours".

### Where the server runs

- A laptop is fine for a demo, but not for a customer: it sleeps, travels and gets
  updated. Run SafeOps on a server that stays on: a VPS or a cloud VM (`SERVER_SETUP.md`).
- **Size it from the load test** (`LOAD_TEST.md`): at least 2 cores for a customer with
  several hundred users.
- Re-run the load test before taking on a customer much larger than 30 sites.

### Where the backups go

- Backups now run automatically every day (`BACKUP.md`). By default they are kept on the
  same machine, which does not survive losing the machine.
- **Decide** where `BACKUP_LOCATION` points: a NAS share, or a synced cloud folder in an
  acceptable country (see "Where the data lives").
- **Do one restore drill before go-live,** and one every quarter (`RESTORE.md`). A backup
  that has never been restored is not yet a backup.

### Email

- **Decide** the sending provider and the sending domain. Set up SPF and DKIM on that domain
  so messages are not marked as spam.
- Without email, SafeOps still works. Invitations and password resets give the admin a link
  to pass on by hand. But nothing is sent automatically:
  - permit expiry warnings;
  - overdue action reminders;
  - scheduled reports.

### Man-hours

- HSE rates divide by hours worked. Until a site's monthly hours are recorded, they are
  estimated from headcount, and the page lists which sites and months are missing.
- **Agree with the customer** who records hours each month, and from which payroll or
  timesheet report. Do this before rates go on a JKKP 8 return or to a client.

## 3. Check on real phones

The automated mobile audit (`MOBILE.md`) runs Chrome's engine at phone sizes. It is not
Safari, and it is not a real keyboard, camera or network. Before go-live, and before any
release that changes forms or layout, go through this on **one real iPhone (Safari)** and
**one real Android phone (Chrome)**. Use the production address, not localhost.

| # | Do | Pass when |
|---|---|---|
| 1 | Open the app and sign in | No zoom-in when tapping the email or password field. The page fits the width, with no sideways scroll. |
| 2 | Rotate to landscape and back | Nothing is cut off. The bottom navigation is still reachable. |
| 3 | Report an incident with a photo taken by the camera | The camera opens. The upload shows progress, and the photo appears on the incident. |
| 4 | Type in a long text field near the bottom of the screen | The keyboard does not cover the field being typed in. The Submit button can be reached. |
| 5 | Turn on airplane mode, report an incident, then turn it off | The report is kept and says it is waiting. It sends by itself when the connection returns, and only once. |
| 6 | Walk to the edge of wifi coverage and open the dashboard and incident list | Screens load, or show an error with a Retry button. Never a blank or endlessly loading screen. |
| 7 | Open a permit and approve or sign it off | Every button in the drawer can be reached and tapped. The status changes. |
| 8 | Leave the app in the background for 20 minutes, then return | Still signed in, or asked to sign in again. Never an error page. |
| 9 | Add the app to the home screen and open it from there | It opens the app. Nothing sits under the notch or the home bar. |
| 10 | Switch to dark mode with the moon button in the top bar | Everything stays readable. |
| 11 | Increase the system text size | Text grows without overlapping. |

Write down the phone, the OS version, the date and any failure. A failure on a real phone
outranks a pass in the automated audit.

## 4. On a poor connection

Site networks drop packets, and phones move between cells. What the app does about it:

- **Reads are retried.** A screen whose request gets no answer tries twice more, after 0.5
  and 1.5 seconds, before showing an error. The same happens on a 502, 503 or 504 from the
  proxy while the API restarts during a deploy.
- **Writes are not repeated blindly.** A write that got no answer may still have been done,
  so it reports the failure instead of risking a duplicate.
- **Incident reports have an outbox.** A report that cannot be sent is kept on the phone and
  sent when the connection returns. It carries an idempotency key, so the server never
  records it twice.
- **Screens that fail to load say so and offer Retry** (`AsyncContent`, and the tables' error
  state) rather than leaving a loading skeleton on screen.

(`web/src/api/http.ts`, tested in `web/src/api/httpRetry.test.ts`.)
