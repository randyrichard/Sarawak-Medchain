# Time zones: when "today" and "this month" roll over

SafeOps counts days and months in the **business time zone**, `APP_TIMEZONE`. The default is
`Asia/Kuching` (UTC+8, no daylight saving). It is set per deployment in `.env.prod`, or in
`deploy/k8s/base/config.yaml` on Kubernetes, and it reaches both the API and the worker.
The API refuses to start if the name is not a time zone it recognises.

## Why it matters

Days used to roll over at UTC midnight, which is **08:00 in Malaysia**. Before eight in the
morning:

- a permit starting today was counted as yesterday's, and "Expiring today" didn't turn over
  until 08:00;
- an action due today was not yet "due today";
- visitors arriving at 07:00 went on yesterday's log;
- an incident at 02:00 on the 1st was counted in the **previous month's** injury rates. That
  can move a lost-time injury between months on a JKKP 8 return;
- a reminder sent before 08:00 counted from yesterday, so "expires in 30 days" was off by one.
  With the windows fixed but not the count, a certificate due in exactly 30 days could miss
  its warning;
- the calendars highlighted yesterday as "today". A calibration recorded at 07:30 defaulted
  to yesterday's date, and the dashboard's "last 7 days" ended yesterday;
- "Closed this month" on Permits was actually the last 30 days.

## The rule in the code

There are two kinds of date value, and they need two kinds of boundary:

| Value | Example | Stored as | Compared with |
|---|---|---|---|
| **Calendar date** | due date, expiry date, inspection due | UTC midnight of that date (`2026-03-05T00:00Z`) | `todayDate()`: today's **local** date in the same form |
| **Moment** | incident occurred, permit valid from/to, check-in | a real instant | `startOfLocalDay()` / `startOfLocalMonth()`: local midnight, which is 16:00 UTC the day before |

The helpers are in `api/src/domain/businessDay.ts`. The offset maths underneath is in
`domain/localTime.ts`, the same code that schedules reports across time zones. In the
browser, use `localISODate()` (`web/src/lib/localDate.ts`) for "today". Never use
`new Date().toISOString().slice(0, 10)`: a test fails if that appears outside the offline
demo data.

API responses for a period now give **local calendar dates**. For example, HSE Performance
returns `from: "2026-01-01"` and `to: "2026-06-30"`, inclusive.

## What is not covered

- **One zone per deployment.** A customer whose sites are in another time zone needs its
  own deployment, or per-company zones, which are not built.
- The per-site time zone (Administration → Sites) is used for the toolbox meeting
  "held today" check and for scheduled report periods. Everything else uses `APP_TIMEZONE`.
- API usage metering (`apiUsage`) stays on UTC days on purpose: it is an internal counter,
  not a business day.

## Tests

- `api/src/domain/businessDay.test.ts` covers the boundaries in Kuching, and in a
  daylight-saving zone on both sides of a clock change.
- `api/src/lib/hsePerformance.integration.test.ts` places incidents at 02:00 and 01:00 local
  on the 1st, and closes actions at 23:30 and 00:30 local around a due date. All three tests
  fail on the old UTC code.
- Six integration suites used to build "due today" fixtures from the UTC date. They passed
  before 16:00 UTC and failed after, so they depended on the time of day. They now use the
  local date, and pass at any hour.
