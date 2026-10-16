# VDP appendix material

Assembled 13 October 2026. Covers items B, C and D of the supporting-documents list.

## B — Founder profile

`B-founder-profile.md`. A structure with blanks marked `[ ... ]`. Nothing personal was
invented; fill the blanks before sending.

## C — Screenshots

Six captures at a 1440×900 viewport. **Where each came from matters** — do not describe any
of them as a live customer system, because none of them is:

| File | Screen | Source |
|---|---|---|
| `01-sign-in.jpg` | Sign-in, with demonstration roles | Offline demo build |
| `02-incidents-register.jpg` | Incident register, sorted most serious first | Offline demo build |
| `03-incident-investigation.jpg` | One incident through the eight investigation stages | Offline demo build |
| `04-permits-to-work.jpg` | Live permit board — hot work, confined space, work at height | Offline demo build |
| `05-dashboard.jpg` | Dashboard with site comparison | Full stack, demonstration dataset |
| `06-monthly-safety-report.jpg` | Monthly safety report, August 2026 | Full stack, demonstration dataset |

All data in them is invented. The first four come from the offline demonstration build,
which carries its own sample data in the browser; the last two come from the full stack
running against the seeded demonstration dataset, because the dashboard and the report are
produced by the server and the offline build has no server.

These are 800×500 images, which is adequate for a PDF appendix but not for print. To take
sharper ones yourself, run the stack and capture at full screen resolution:

```bash
npm --prefix safeops-platform run dev
```

Then open `http://localhost:5181` and use a demonstration role to sign in.

## D — Architecture overview

`D-architecture-overview.md`. One page. Every claim was read from the source and the
deployment configuration; it ends with a section stating what is *not* in place, which is
there on purpose.

## Items E, F, H, I

E (feature status) and F (security and privacy) are extracts from the proposal's own
Section 5 and Section 9 tables. H is Section 8. I is a monthly report in PDF — generate it
from the Reports page of the running stack with the month set to August 2026, which is the
month the demonstration dataset has incidents in; September and October are empty and would
show a report with nothing in it.
