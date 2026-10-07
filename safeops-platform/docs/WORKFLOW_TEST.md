# Workflow test, October 2026

The October audit (`AUDIT_2026-10.md`) visited every page but did not use the product: it
loaded screens and checked what was on them. This pass drove each main workflow from start
to finish in a real browser, Playwright and Chromium, against the API and a freshly seeded
Postgres database. Each workflow signed in as the person who would really do the job,
completed it through the interface, and checked the result where it should appear next: the
register, the next person's queue, the certificate list or the exported file. Console errors
and failed API calls were recorded throughout.

## Workflows

| # | Workflow | Who | Result |
|---|---|---|---|
| 1 | Report an incident: four steps, submit, find it in the register | Employee | Pass after fix 1 |
| 2 | Report a near miss on a phone (Pixel 7 and iPhone 13 profiles, touch) | Employee | Pass |
| 3 | Investigate an incident from Reported to Closed: investigator, findings, causes, 5-Why, actions, review, verification | HSE manager | Pass after fix 2 |
| 4 | Raise a standalone corrective action, progress it, complete and verify it | HSE manager, owner | Pass |
| 5 | Permit to work, full lifecycle: draft, controls, gas test, approve, name workers, toolbox talk, activate, close | Supervisor, HSE manager | Pass after fixes 3 to 5 |
| 6 | Inspect an asset, fail an item, and see the defect become a corrective action | Safety officer | Pass |
| 7 | Pre-register a visitor, approve, check in (site rules), print the pass, check out | Safety officer | Pass after fix 7 |
| 8 | Record a toolbox meeting with attendees and see it count | Supervisor | Pass |
| 9 | Schedule a training session, enrol people, run attendance, sign off, see the certificates | HSE manager | Pass after fix 6 |
| 10 | Admin invites a user; they accept the link signed out, set a password and sign in; the link cannot be reused | Admin, new user | Pass |
| 11 | Change password: the wrong current password is refused, the old password stops working, the new one works | Any user | Pass |
| 12 | All five reports: preview and PDF; a scheduled report run now and downloaded from History; every CSV export (actions, certificates, competency matrix, HSE performance by site and by month, users, audit log, login history) | HSE manager, admin | Pass |
| 13 | HSE Performance: refuse bad man-hours, record hours and see the rates move, reopen and see the saved value, set targets and see tiles marked on or off target, targets kept after reload | HSE manager | Pass |

**On a phone.** All 13 were then run again on a 320px iPhone SE profile, with touch input,
measuring the layout after every step. Every workflow completes on the phone. The mobile
pass found and fixed further problems, most importantly report photos that were never
uploaded and an anonymous reporter named in the activity log (`MOBILE.md`, second pass).

The exports were checked for content as well as for downloading. Every PDF is a real PDF.
No CSV has `undefined`, `NaN`, `[object Object]` or `Invalid Date` in a cell, and none has
an unguarded formula cell. The users and audit log exports match the database row for row.
In the HSE performance export, every site's LTI frequency rate equals its lost-time injuries
× 1,000,000 ÷ its hours.

## What was broken, and is fixed

| # | Found in | Problem | Fix and test |
|---|---|---|---|
| 1 | Workflow 1 | **One report filed two incidents.** The idempotency key was created only after a first attempt failed. A report the server had already saved, whose reply was lost on poor site wifi, was then queued under a new key and filed again. | The key goes with the first attempt, and a queued resend carries the same key. `ReportIncidentPage.dom.test.tsx`; the near-miss form does the same. |
| 2 | Workflow 3 | **The server let an investigation close with nothing in it.** The page told the manager what each stage needs: an investigator, findings, a cause and a 5-Why statement, settled and then verified actions, and notes. Only the offline demo enforced it. The server checked only that stages went in order. | `incidentStageGate.ts` enforces each stage on the server. `incidentStageGate.test.ts`, and an integration test that tries to close an empty investigation. |
| 3 | Workflow 5 | **Four permit competencies had no training course**: hot work, electrical isolation, rigging and radiography. A permit requiring one could never be staffed, because no one could ever hold that certificate. | Courses TRN-111 to TRN-114. `trainingCatalog.test.ts` checks that every required competency has a course. |
| 4 | Workflow 5 | **A refused approval showed its reason off screen**, at the top of a long drawer, while the button pressed was at the bottom | The reason now appears beside the action bar |
| 5 | Workflow 5 | **No demo worker had a medical**, so every worker was correctly refused for every permit, and the demo could not show a permit through to work | The demo seeds medicals with a realistic spread: most current, some expiring soon, a few lapsed |
| 6 | Workflow 9 | **Training could not enrol anyone on a real server.** The people list read the offline demo's fixture people even with a server. Those are empty outside development, so "New session" listed nobody, and Organization → People was blank. | Reads the employee register. `clientEmployees.test.ts`. The dialog also says so when its lists fail to load, rather than showing them empty. |
| 7 | Workflow 7 | **The visitor drawer was not announced as a dialog and ignored Escape**, unlike every other drawer | Modal dialog role, and Escape closes it unless a dialog on top is open. `VisitorDrawer.dom.test.tsx`. |
| 8 | Full API suite | **A sign-in throttle test could fail when the machine was busy.** It read the counter before the limiter had taken back its last refusal, which happens after the reply is sent. | The test waits for the counter to settle. It still fails if a refusal is ever counted. |

Each fix except 4 and 5 has a test that fails without it. Fixes 4 and 5 were checked
in the browser.

## Checked and correct

These are refusals, so they stop a workflow, and that is the intent:

- A permit cannot be approved without its required controls and a gas test.
- A permit cannot start without named workers and a toolbox talk they have acknowledged.
- A worker without a current medical or the required certificate is refused, and told why.
- A visitor cannot check in until five site rules are acknowledged.
- An investigation cannot move forward without each stage's content.
- A used or expired invitation link says so and offers a way back. A weak password is
  refused before it is sent.
- A negative or non-numeric man-hours figure or target cannot be saved.

A near miss reported on a phone submits on the first tap on real touch profiles. An early
run suggested otherwise, but that came from a desktop mouse click at the edge of the window.

## How to repeat it

Seed a database with `npm run demo:reset`, start the API and the web app, and drive each
workflow above as the user named. Two of the workflows store data, so clear it before running
them again:

- Workflow 13 changes targets. "Save" stays disabled when nothing has changed, so a value
  that is already saved cannot be saved again.
- Workflow 10 creates a new user each run.
