# HSE Performance - the wider view

`/performance` in the web app, `GET /performance` on the API. Open to the admin, HSE manager,
safety officer and CEO roles (`analytics:view`). Only the admin and HSE manager may record
man-hours.

## Why it exists

An HSE manager asked for SafeOps to have a "wider view". The dashboard answers *what needs
doing today, at this site*. The question asked of an HSE manager by the board, by DOSH and by
clients during contractor prequalification is a different one: **across every site and over
months, are we getting safer, and where are we not?** Answering it needs three things the
rest of the product did not give:

1. **Rates, not counts.** Two lost-time injuries mean something very different on a 40-person
   site and a 900-person one. Every injury figure is normalised by exposure.
2. **Leading as well as lagging indicators.** Injury rates only move after somebody has been
   hurt. ISO 45001 §9.1 requires monitoring of the activity that prevents injuries too.
3. **Time and sites together.** A trend says whether things are improving. A site league table
   on the same rates says where to look.

## What the page shows

| Section | Contents |
|---|---|
| Hours basis notice | Shown whenever any hours are estimated (see below) |
| Lagging indicators | LTI frequency rate, severity rate, incidence rate, TRIR, fatalities, hours worked |
| Leading indicators | Near misses reported, near-miss ratio, actions closed on time, overdue actions, toolbox meetings |
| Monthly trend | Near misses against recordable injuries per month, with a table of the same figures (LTIs, hours, monthly LTI frequency rate) |
| Sites compared | Every site on the same rates, sortable, worst LTI frequency rate first |
| Record man-hours | Hours worked per site per month (admin and HSE manager only) |

The period is 6, 12 or 24 whole calendar months ending with the current month. It is kept in
the URL (`?months=24`), so a view can be shared. The page follows the project picker; the site
picker does not narrow it, because comparing sites is the point. A user restricted to some
sites only ever sees those sites.

## Formulas

| Indicator | Formula | Source |
|---|---|---|
| LTI frequency rate | lost-time injuries × 1,000,000 ÷ hours worked | DOSH JKKP 8 annual return; ILO |
| Severity rate | days lost × 1,000,000 ÷ hours worked | DOSH JKKP 8 |
| Incidence rate | lost-time injuries × 1,000 ÷ workers | DOSH JKKP 8 |
| TRIR | recordable injuries × 200,000 ÷ hours worked | US OSHA (200,000 h = 100 full-time workers for a year); asked for by multinational clients |
| Near-miss ratio | near misses ÷ recordable injuries | Heinrich / Bird accident-ratio triangle |
| Actions closed on time | actions completed on or before their due date ÷ actions completed in the period | ISO 45001 §10.2 |

Rates are rounded to two decimals, which is the precision they are reported at. **A rate with
nothing to divide by (no hours, or no workers) is `null` and is shown as "—", never as 0.00**,
because 0.00 would read as a perfect record.

### What counts as what

These definitions come from `api/src/lib/incidentCatalog.ts`. They are the same rules the
incident board and reports use.

- **Lost-time injury:** severity `lost_time_injury`, `fatality` or `catastrophic`, or type
  `lti` or `fatality`.
- **Recordable injury:** a lost-time injury, or severity `medical_treatment` or
  `restricted_work`, or type `mtc` or `rwc`. First aid is not recordable, as under OSHA.
- **Fatality:** severity or type `fatality`.
- **Near miss:** severity or type `near_miss`.
- **Days lost:** the sum of days lost recorded against the injured persons on each incident.
- **Workers:** the headcount of the sites in scope.

Which incidents are counted:
- Incidents are placed in a month by when they occurred.
- Drafts and archived incidents are excluded.

Which actions are counted:
- **Closed actions** are those completed or verified within the period.
- A due date is a calendar day, so closing at any time on it counts as on time.
- **Overdue actions** is the count open past their due date right now, not over the period.

## Hours worked: recorded or estimated

Every rate divides by hours worked, so this figure decides whether the rates mean anything.

- **Recorded:** an admin or HSE manager enters the month's total for a site under *Record
  man-hours*. It should be the payroll or timesheet total, employees and contractors together.
  Clearing a month returns it to the estimate.
- **Estimated:** a month with no recorded figure uses site headcount × 195 hours. That is 45
  hours a week (the Employment Act 1955 limit as amended in 2022) × 52 weeks ÷ 12 months. The
  current month is pro-rated by how far through it we are.

The page says how much of the total is estimated, for example "33% of hours estimated from
headcount". Sites and months with any estimated hours are marked **est.** Estimated rates are
fine for comparing sites. Record actual hours before the figures go on a JKKP 8 return or to a
client.

## Storage and security

- Man-hours are kept in `SiteManHours`, one row per site per month, unique on `(siteId,
  month)`, with who changed it last and when.
- The table has the same row-level security policy as every other tenant table:
  `tenant_isolation` using `safeops_tenant_visible("companyId")`.
- Recording is refused for a future month, for a figure that is not a whole number between 0
  and 50,000,000, and for a site outside the caller's company or site restriction.
- `web/src/features/permissions/serverAgreement.test.ts` checks that the web navigation and
  the API agree on who may view the page (`PERFORMANCE_ROLES`) and who may record hours
  (`MAN_HOURS_ROLES`).

## Tests

| File | What it covers |
|---|---|
| `api/src/lib/hsePerformance.integration.test.ts` | Every rate against hand-worked figures on a real database: recorded and estimated hours, site restriction, man-hours permissions and validation, and the no-hours case returning `null` |
| `web/src/features/performance/PerformancePage.dom.test.tsx` | What the reader is told: unknown rates shown as "—", the estimate notice, worst site first, the chart's table, who sees *Record man-hours*, saving only changed months, and an axe audit |
| `web/src/features/performance/lib.test.ts` | Formatting and hours parsing |
| `web/src/api/performanceApi.test.ts` | Request URLs |

## Sources

- Department of Occupational Safety and Health Malaysia (DOSH / JKKP): *Occupational Safety
  and Health (Notification of Accident, Dangerous Occurrence, Occupational Poisoning and
  Occupational Disease) Regulations 2004*, and the JKKP 8 annual return of occupational
  accidents and diseases. Defines the frequency, severity and incidence rates and their bases.
- ILO: *Resolution concerning statistics of occupational injuries* (16th ICLS, 1998). Defines
  the frequency rate per 1,000,000 hours worked.
- US OSHA: *29 CFR 1904*, Recordkeeping, and the incidence rate formula (N/EH × 200,000).
- ISO 45001:2018, §9.1 (monitoring, measurement, analysis and performance evaluation) and
  §10.2 (incident, nonconformity and corrective action).
- UK HSE: *Developing process safety indicators* (HSG254). Explains leading and lagging
  indicators and why both are needed.
- Malaysia Employment (Amendment) Act 2022: the 45-hour normal working week used for the
  estimate.
