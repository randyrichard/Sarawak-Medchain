# Mobile: iOS and Android

How SafeOps was checked on phones, what was wrong, what changed, and how to check it again.

## How it was checked

`web/scripts/mobile-audit/run.cjs` (`npm run audit:mobile`) drives every signed-in page in a
browser, measuring the real layout rather than guessing from the code.

**Devices:**

| Device | Screen (CSS px) | Keyboard height used |
|---|---|---|
| iPhone SE | 320 × 568 | 336 |
| iPhone 14 Pro | 393 × 852 | 336 |
| Pixel 7 | 412 × 915 | 315 |
| Galaxy S8 | 360 × 740 | 290 |
| iPhone SE, landscape | 568 × 320 | 200 |

**Pages:** 22 in all. They are login, the dashboard, near miss, the incidents list and new
incident form, the incident board, an incident's detail page, actions, assets, permits,
visitors, toolbox, HSE Performance, reports, audits, training, workforce, contractors,
organization, administration, notifications and account.

**Checks:**

| What was asked | What is measured |
|---|---|
| Width ("length") | The page never scrolls sideways. The layout is never wider than the screen, which would make the phone shrink the whole page. Nothing pokes past the screen edge outside a scroll box. |
| Height | No text is cut off by a fixed-height box that cannot scroll. No pinned panel is taller than the screen. Dialogs stay usable on short screens. |
| Panels clashing | No text or control is drawn on top of another. No text runs out of its own box. |
| Navigation clashing | The top-bar items don't overlap, all stay on screen and are at least 44px. The menu drawer scrolls to its last item. Tab rows scroll rather than cut off. |
| Keyboard | The screen is shrunk by the keyboard's height, then each form field is focused. The field must be in view and not covered. Fields are checked on near miss, new incident, the incidents search box and four dialogs. |
| iOS zoom | No text field is under 16px, because an iPhone zooms into those on focus. |

### What it does not cover

The audit runs Chromium (Chrome's engine) with each phone's size, touch input and user
agent. That is how Android renders. It is **not Safari**. Three iOS behaviours are handled
by rules instead, and should be checked on a real iPhone before an important release (the
real-phone checklist is in `GO_LIVE.md`, section 3):

- Safari zooms into any field under 16px. This is prevented by the 16px rule below.
- The iOS keyboard does not resize the page. It overlays the page and Safari scrolls the
  focused field into view. The tests shrink the screen instead, which is the stricter case:
  it is what Firefox and Samsung Internet do on Android.
- The notch and home bar. The app does not opt into drawing under them (there is no
  `viewport-fit=cover`), so Safari keeps content clear of them by itself.

## What was found, and fixed

| # | Problem | Where | Fix |
|---|---|---|---|
| 1 | **The whole page shrank on phones.** The layout was 516px wide on 320–412px screens, so every word was drawn at 60–80% size. | HSE Performance | Two causes. **(a)** Page-header actions could not wrap: `PageHeader`'s action row was `shrink-0` only, so four buttons made a 678px row. It now wraps within the screen. **(b)** A screen-reader-only label ("Overdue actions") in an off-screen table column escaped its scroll box, because absolutely positioned elements are not clipped by a scroll box that isn't positioned itself. All 30 horizontal scroll boxes are now `relative`, `DataTable` included. |
| 2 | **iPhones zoomed in on every field.** Almost every input was 12–14px, so tapping a search box or filter zoomed the page and left it zoomed. | 16 pages: login, dashboard, near miss, incidents, new incident, board, actions, assets, permits, toolbox, HSE Performance, reports, audits, workforce, contractors, account | Text fields are 16px on touch screens (`@media (pointer: coarse)` in `index.css`). The desktop keeps its compact sizing. Zoom itself is never disabled. |
| 3 | **The near-miss submit bar covered the field being typed in** once the keyboard was up, on every phone tested. | Report near miss | The bar stays pinned while reading. It stops pinning while a text field has focus (`:has(:focus)`) and on short screens. |
| 4 | **Dialog fields could not be reached in landscape with the keyboard up.** The pinned header and buttons took all of the height. | Every dialog | On short screens (`short:`, max-height 500px) the whole panel scrolls as one. |
| 5 | Job descriptions were drawn **on top of** "not yet run". | Administration → background jobs | The row wraps: the text keeps a minimum width and the status drops below it. |
| 6 | Site names were squeezed to a word per line and ran into the "3 departments" pill. | Organization → structure | Same wrap. |
| 7 | Audit titles were squeezed to a word per line. | Audit & Compliance | The title gets the full row on phones, and the details wrap beneath. |
| 8 | "9,597,512" ran past the edge of its tile. | HSE Performance | The tile figure scales with screen width (18–24px). |
| 9 | "INVESTIGATIONS OPEN" touched its tile's edge. | Incident board | The label may hyphenate. |

**Before:** 9 problems. The iOS zoom problem alone affected 16 of the 22 pages.

**After:** `npm run audit:mobile` reports **0 findings** on all five devices, 22 pages, the
navigation checks and the keyboard checks.

One limit remains. In landscape with the keyboard up, only about 120px of screen is left.
The near-miss "What happened?" box is 130px tall, so all of it cannot be in view at once.
Its first line, where the typing happens, is.

## Keeping it fixed

`web/src/lib/mobileLayout.test.ts` runs in CI and pins each rule:

- every `overflow-x-auto` scroll box is `relative`;
- page-header actions wrap;
- dialogs scroll as one on short screens;
- the near-miss bar unpins while typing;
- touch screens get 16px fields, and zoom is never disabled in the viewport meta.

For the layout itself, which only a browser can measure, run the audit:

```bash
# web app running against an API with the demo data (api/: npm run demo)
cd web
MOBILE_AUDIT_URL=http://localhost:5173 npm run audit:mobile   # exits 1 on any finding
```

It signs in five times, once per device. The API's login limiter allows only a few sign-ins
per quarter hour, so wait between back-to-back runs, or use a scratch database.

## Second pass, October 2026

The first pass measured 22 pages as each one first loads. This pass measured what people
actually do on a phone: every tab, the record drawers, every "New / Add / Register" dialog,
and every role. It also checked colour contrast at phone width (the earlier crawl ran axe
only on desktop), the size of every tap target, and pinned bars that block the view. Then it
ran all 13 end-to-end workflows on a 320px iPhone SE (see `WORKFLOW_TEST.md`).

**Coverage:** five roles (admin, HSE manager, safety officer, supervisor, employee) and the
CEO view. Three phone sizes: 320px (iPhone SE), 360px (Galaxy S8) and 393px (iPhone 14 Pro).
Light and dark mode. More than 1,300 screen states in all.

**New checks in `npm run audit:mobile`** (`scripts/mobile-audit/targets.js`):

- a control under 24px, the WCAG 2.5.8 floor, measured through its label where it has one;
- a control with no name;
- pinned bars taking more than 30% of the screen.

The probe also now ignores content scrolled out of view under the top bar. Measuring a
scrolled page had reported that content as overlapping the bar.

### What was found, and fixed

| # | Problem | Where | Fix |
|---|---|---|---|
| 1 | **Photos on both report forms were never uploaded.** The near-miss form said "1 photo(s) attached", and the incident form listed files with sizes and "Evidence: 2 file(s)". Only the file names went into the report, which the server ignores. A worker who photographed the scene was told the photos were on record. | Report incident, report near miss | The files are uploaded to the new incident (`features/incidents/evidence.ts`). They are screened first against the types and size the server accepts: photos and PDF, 10 MB each. Anything refused is named. If an upload fails, the incident page says so. A report saved offline says its photos could not be kept. Tests: `ReportIncidentPage.dom.test.tsx`, `evidence.test.ts`. Verified in a browser on a phone profile: the photo is in the database. |
| 2 | **An anonymous report named its reporter in the activity log.** The header said "Reported anonymously", while the log beneath it said "Incident reported — <name>, employee", to everyone who could open it. | Incident page, Activity tab | Below HSE manager, the reporter's own events and uploads are masked too. Test: `incidentInvestigation.integration.test.ts`, which fails without the fix. |
| 3 | **Inspection and audit "Photos" buttons threw the photos away** and recorded only a count, which the result then showed as "2 photo(s)". | Inspection runner, audit runner | The buttons are removed until the product can store those photos. See "Still open" below. |
| 4 | **A corrective action's link to its incident read "·"**, and the actions export had empty Incident and Department columns. The register API never sent the incident's number, title or department. | Action drawer, actions CSV | `listActions` and `getAction` return them. Test: `incidentService.integration.test.ts`. |
| 5 | **Screens printed site ids.** A site created in the product has an id like `site-a1b2c3d4e5f6`. The printed visitor pass, the asset, worker, employee and action drawers, the incident board, findings, the competency matrix and the actions CSV showed it, uppercased. | 9 places | `useSiteLabel()` gives the site's name. |
| 6 | **Calendars were unreadable on a phone.** Seven columns of about 45px each showed every entry as a coloured dot and "(", and the colour key is hidden at that width. | Actions and inspection calendars | Below `sm`, an agenda lists each day's entries with code, title and status in words, each a 44px target (`MonthAgenda`). |
| 7 | **Rows squeezed to one word per line**, with codes broken mid-way ("AST-/1137"), and text drawn over the trainer's name at 320px. | Inspections, training sessions, backups, security recommendations, every card header | The title gets the whole first line on a phone, and the rest wraps below it. |
| 8 | **Colour contrast below 4.5:1.** Competency pills had white text on green or amber (1.8–3.4:1). Calendar days outside the month were faded (2.2:1). The file size on an amber row in dark mode was 3.5:1. | Training matrix, calendars, audit documents, toolbox | Pills use a coloured border with ink text, as `StatusPill` does. Out-of-month days use a sunken background with muted text. The amber row, and "present" on a toolbox site's green tile (4.2:1 in dark mode), use `ink-2`. |
| 9 | **Tap targets under 24px**, and under 44px for controls used constantly. These included the invitation's site checkboxes (19px rows), the toggle switch (36×20), the dialog and drawer close buttons (24–28px), Privacy and Terms links (19px), finding codes (17px), table checkboxes (14px), filter chips (29px), and "Group by" and mention selects. | Throughout | Touch screens get 44px rows and buttons: one CSS rule for every checkbox or radio label, plus `coarse:` sizing on each control. Table checkboxes are 24px. |
| 10 | **The Privacy and Terms pages were 329px wide on a 320px phone**, so the phone shrank the page. | Legal pages | The header wraps, and the long file path can break. |
| 11 | **Sideways-scrolling tables could not be scrolled by keyboard.** | Dashboard, incident stages, roles, matrix, invitations, login history, audit log, API keys | Each is a focusable, named region. |
| 12 | Unlabelled controls: "Group by" selects, the CSV import box | Actions, training, users | Named |
| 13 | A webhook's event names ran out of a two-column grid | Developer → webhooks | One column on phones |
| 14 | **A near miss reported with no signal was lost** unless the person came back and retyped it: the form said "Could not submit… try again". The full incident form already kept such a report and sent it later. | Report near miss | It goes into the same outbox, under the same key, so it cannot be filed twice. It says any photos were not kept. Test: `ReportNearMissPage.dom.test.tsx`. |

### Mobile ethics

| Question | Finding |
|---|---|
| Can people zoom? | Yes. Zoom is never disabled, and fields are 16px so iPhones do not zoom in by themselves. |
| Are permissions asked for in context? | Yes. Location is asked only when someone taps "Capture GPS". Nothing asks for notifications, the camera or location on load. |
| Does anything claim what did not happen? | It did, and is fixed: photos "attached" that were never sent (1, 3), and the anonymity of the activity log (2). The near-miss form also no longer forces the camera. With `capture`, Android opened the camera directly, although the button says "Take or attach a photo". |
| Pop-ups, interstitials, pre-ticked boxes, auto-play? | None. The crawl found no pinned bar taking more than 30% of any screen. |
| Data cost on site connections | 123 KB compressed to first load. Every page after that is loaded when first opened. There are no web fonts, trackers or analytics. A report or near miss made with no signal is kept on the phone and sent later (fixed, 14). |
| Dark mode, reduced motion | Dark mode follows the phone unless the person chooses otherwise. Animations stop when the phone asks for reduced motion. |
| Phone numbers | Tappable to call in the employee drawer and emergency contacts. On a site phone, that is the point of having them. |

### Still open

| Item | Why it is not done here |
|---|---|
| **Photos for inspections and audits** | Nothing stores a photo against an inspection or an audit answer, or against a corrective action that has no incident. This needs storage, routes and permissions: a feature, not a fix. Until then, the runners do not offer a photo button. |
| Avatar initials at 9–11px | They sit beside the person's name or inside a labelled button, so they are a visual cue rather than text that has to be read. |
| A real iPhone in Safari | Still needed before an important release (`GO_LIVE.md` §3). |
