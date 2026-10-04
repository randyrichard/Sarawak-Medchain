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
