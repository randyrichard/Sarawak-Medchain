# The contractor HSE evidence pack

One PDF, covering a stated period, holding the records a client's HSE auditor asks for.
Exported from **Permits to Work** and from **Reports** by anyone who may read a tenant-wide
report (admin, HSE manager, safety officer, CEO).

## What it is, and what it is not

It is SafeChain's own evidence pack. **It is not the PETRONAS Contractor HSE Guidelines
audit form, and it is not a DOSH/JKKP inspection form.**

That distinction is deliberate and is printed on the document's own first page.

Those are specific documents with specific layouts, and this product does not hold them. A
pack that captioned itself as a JKKP form while merely resembling one would be worse than
useless at an audit: the auditor works from the real form, finds this does not match it, and
now has a reason to doubt the records behind it too. The same reasoning as the limitations
page in the iG@P submission — the value is in being checkable, not in looking official.

What it does instead is organise the underlying records in the order an audit asks for them.

**To make it conform**, somebody needs the actual forms in hand: the JKKP form numbers and
their field order, or the CHSEMS audit checklist sections. Mapping these sections onto those
is a separate piece of work, and a small one once the forms exist — the data is all here.

## What is in it

**Cover.** Company, site, the audit period, five headline figures, and the compliance score
*with its workings* — every component's numerator, denominator and what it was counted from.

**Section 1 — Permits and the atmosphere tested under them.** Every permit live at any point
in the period (not merely raised in it: a permit opened on the 28th and worked through month
end belongs in both months' packs). Who signed each one. Gas readings as `3 / 1 failed`
rather than a bare count, because an auditor is looking for the failure. A permit type that
requires testing and has none is marked `NOT TESTED`.

**Section 2 — Job safety analysis.** Each hazard, its control, who was responsible, residual
risk. The `Origin` column says `field` where the step was written at the job on a device with
no signal, and `desk` otherwise.

**Section 3 — Competency and safety passes.** Every pass held by the people *named on those
permits* — not the whole register, which would bury the dozen that matter and hand the client
personal data about people who were never on their site. Worst first, so an auditor reading
one page sees the expired ones. "Expiring" means within 30 days of the period's end, matching
the window the scheduler already warns on.

**Section 4 — Incidents and evidence.** Incidents in the period with the count of files held
against each. The files accompany the pack rather than being embedded, so a pack covering a
busy month stays something somebody can open and email; each carries the checksum taken when
it was stored, which is what lets a copy be checked against the record.

**Auditor notes.** Ruled space, because a printed pack gets written on.

## The compliance score

There was no compliance score anywhere in this product before this pack, so the number is
computed here — which means it has to be checkable rather than trusted. Six components, each
a thing the company either did or did not do, countable from records rather than judged:
precautions confirmed, atmosphere tested, permits signed off, closed with handback,
isolations released, passes in date.

Two rules worth knowing:

- **A component nobody was asked is left out**, not counted as a pass. A site that ran no
  confined-space work did not score full marks on gas testing. Counting empty components as
  passes inflates the score of exactly the sites doing the least work.
- **Nothing is weighted.** A weighting would be an opinion about whether an unreleased
  isolation matters more than an expired medical, and this document is evidence for an
  auditor to judge, not a place to publish that opinion.

A period with nothing in it scores `N/A`, not `0%`.

## Where it lives

| | |
|---|---|
| Builder | `api/src/lib/auditPack.ts` — produces `ReportData` |
| Renderer | `api/src/lib/reportPdf.ts` — the existing engine, unchanged |
| Routes | `GET /reports/audit-pack` (figures), `GET /reports/audit-pack.pdf` (the document) |
| UI | `web/src/features/reports/components/AuditPackDialog.tsx` |
| Tests | `auditPack.integration.test.ts` (real Postgres), `auditPackScore.test.ts` |

Deliberately **not** a second renderer: that engine already handles page breaks, repeated
table headers, the workspace's timezone and the transliteration a WinAnsi PDF needs, and a
parallel implementation would drift from it on exactly those details.

The period is asked for and never defaulted. A pack silently covering "the last 30 days"
would be a document whose contents depend on the day somebody clicked Export, which is the
one property an audit record must not have.

Exporting is written to the tenant audit log. The on-screen figures are not — logging every
dashboard refresh would bury the exports that matter.

## A note on column widths

Each table is budgeted to `PAGE_WIDTH` (523pt), and a test enforces it. The renderer will
always scale a table to fit, which sounds forgiving and is not: the first version's columns
summed to ~9% over, everything shrank, and `PTW-2026-0417` broke across two lines as
`PTW-2026-04` / `17`. A permit number split in half is the first thing an auditor looks at.

Headers set the minimum width, not the values — they are drawn uppercase and bold, so `OFF`
is wider than the `3` beneath it.

Found by generating a pack and reading it, not by any assertion. Worth doing again after any
change to these tables:

```bash
cd safeops-platform/api && npm run db:start && npx prisma migrate deploy
npx vitest run src/lib/auditPack.integration.test.ts
```
