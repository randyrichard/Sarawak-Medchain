import type { PrismaClient } from '@prisma/client'
import { DOSH_LABEL, DOSH_RULES, suggestDosh, type DoshCategory } from '../domain/doshNotification.js'
import { DomainError } from '../domain/errors.js'
import { docDate } from './incidentCatalog.js'
import { instantForLocal, localParts } from './reportSchedule.js'
import type { ReportData } from './reportService.js'
import type { SummaryScope } from './reportSummaries.js'

/**
 * A calendar year's DOSH figures: what the annual JKKP 8 summary is filled in from.
 *
 * Counted from the decisions recorded on each incident (domain/doshNotification.ts), never
 * from severity. Whether an injury was a serious bodily injury is a legal question somebody
 * answered on the incident; re-deriving it here would publish a guess as a statutory figure.
 * So an incident nobody has decided on is not counted as anything - it is listed, by name,
 * as the gap it is.
 *
 * Man-hours are the recorded figures only. The HSE Performance page estimates a missing
 * month from headcount, which is fine for comparing sites and wrong for a return to the
 * regulator, so here a missing month is reported as missing.
 */

export class DoshAnnualError extends DomainError {
  constructor(message: string) {
    super('validation', message, 400)
    this.name = 'DoshAnnualError'
  }
}

const ACCIDENT: DoshCategory[] = ['death', 'serious_bodily_injury', 'over_four_days']
const COUNTED: DoshCategory[] = [
  'death', 'serious_bodily_injury', 'over_four_days', 'dangerous_occurrence', 'occupational_poisoning', 'occupational_disease',
]

const fmt = (n: number) => n.toLocaleString('en-MY')

export async function buildDoshAnnual(
  db: PrismaClient, scope: SummaryScope & { year: number | null }, timezone: string, now = new Date(),
): Promise<ReportData> {
  const { companyId, companyName, siteName, projectName, siteIds } = scope
  const thisYear = localParts(now, timezone).year
  const year = scope.year ?? thisYear
  if (!Number.isInteger(year) || year < 2000 || year > thisYear) {
    throw new DoshAnnualError('Choose a year up to this one.')
  }

  // Local midnight on 1 January to local midnight on the next 1 January; this year so far.
  const periodStart = instantForLocal(year, 1, 1, 0, 0, timezone)
  const yearEnd = instantForLocal(year + 1, 1, 1, 0, 0, timezone)
  const periodEnd = year === thisYear ? now : yearEnd
  const at = siteIds ? { siteId: { in: siteIds } } : {}

  const [incidents, sites, manHours] = await Promise.all([
    db.incident.findMany({
      where: { companyId, ...at, archived: false, occurredAt: { gte: periodStart, lt: yearEnd } },
      select: {
        number: true, title: true, occurredAt: true, type: true, severity: true,
        doshCategory: true, doshDetail: true, doshInformedAt: true, doshSubmittedAt: true, doshReference: true,
        site: { select: { name: true } },
        people: { where: { role: 'injured' }, select: { daysLost: true } },
      },
      orderBy: { occurredAt: 'asc' },
    }),
    db.site.findMany({ where: { companyId, ...(siteIds ? { id: { in: siteIds } } : {}) }, select: { id: true, headcount: true } }),
    db.siteManHours.findMany({
      where: {
        companyId, ...at,
        month: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      select: { hours: true },
    }),
  ])

  const count = (c: DoshCategory) => incidents.filter((i) => i.doshCategory === c).length
  const daysLostOf = (i: (typeof incidents)[number]) => i.people.reduce((s, p) => s + (p.daysLost ?? 0), 0)
  const notifiable = incidents.filter((i) => i.doshCategory && COUNTED.includes(i.doshCategory))
  const daysLost = notifiable.filter((i) => ACCIDENT.includes(i.doshCategory!)).reduce((s, i) => s + daysLostOf(i), 0)
  const undecided = incidents.filter((i) => !i.doshCategory
    && suggestDosh({ type: i.type, severity: i.severity, injured: i.people }).flagged)
  const notSent = notifiable.filter((i) => !i.doshSubmittedAt)

  // Months that have passed in the period, per site, against the months recorded.
  const monthsInPeriod = year === thisYear ? localParts(now, timezone).month : 12
  const siteMonths = sites.length * monthsInPeriod
  const hours = manHours.reduce((s, r) => s + r.hours, 0)
  const workers = sites.reduce((s, x) => s + x.headcount, 0)
  const day = (d: Date | null) => (d ? docDate(d, timezone) : '-')

  return {
    type: 'dosh_annual',
    title: `DOSH annual summary (JKKP 8 figures) - ${year}`,
    companyName,
    siteName,
    projectName,
    generatedAt: now,
    periodStart,
    periodEnd,
    periodLabel: year === thisYear
      ? `1 January to ${docDate(now, timezone)} ${year} (year to date)`
      : `1 January to 31 December ${year}`,
    timezone,
    summary: [
      { label: 'Deaths', value: fmt(count('death')) },
      { label: 'Serious bodily injuries', value: fmt(count('serious_bodily_injury')) },
      { label: 'Off work over 4 days', value: fmt(count('over_four_days')) },
      { label: 'Dangerous occurrences', value: fmt(count('dangerous_occurrence')) },
      { label: 'Occupational poisoning', value: fmt(count('occupational_poisoning')) },
      { label: 'Occupational disease', value: fmt(count('occupational_disease')) },
      { label: 'Days lost', value: fmt(daysLost) },
      { label: 'Not yet decided', value: fmt(undecided.length) },
    ],
    columns: [
      { key: 'ref', label: 'Ref', width: 52 },
      { key: 'date', label: 'Date', width: 58 },
      { key: 'site', label: 'Site', width: 80 },
      { key: 'category', label: 'Category', width: 110 },
      { key: 'form', label: 'Form', width: 38 },
      { key: 'told', label: 'DOSH told', width: 58 },
      { key: 'sent', label: 'Form sent', width: 58 },
      { key: 'reference', label: 'DOSH ref', width: 60 },
      { key: 'days', label: 'Days lost', width: 40 },
    ],
    rows: notifiable.map((i) => {
      const c = i.doshCategory!
      return {
        ref: i.number,
        date: day(i.occurredAt),
        site: i.site.name,
        category: DOSH_LABEL[c] + (i.doshDetail ? ` - ${i.doshDetail}` : ''),
        form: DOSH_RULES[c].form ?? '-',
        told: DOSH_RULES[c].immediate ? day(i.doshInformedAt) : 'n/a',
        sent: day(i.doshSubmittedAt),
        reference: i.doshReference ?? '-',
        days: ACCIDENT.includes(c) ? String(daysLostOf(i)) : '-',
      }
    }),
    emptyMessage: `No incident in ${year} is recorded as notifiable to DOSH.`,
    sections: [
      {
        title: 'Hours worked and workers',
        stats: [
          { label: 'Man-hours recorded', value: fmt(hours) },
          { label: 'Site-months recorded', value: `${fmt(manHours.length)} of ${fmt(siteMonths)}` },
          { label: 'Workers (current headcount)', value: fmt(workers) },
        ],
        note: manHours.length < siteMonths
          ? 'Some months have no recorded man-hours, and none are estimated here. Record them under HSE Performance before using these figures on a return.'
          : 'Every month in the period has recorded man-hours.',
      },
      ...(notSent.length > 0 ? [{
        title: 'Written reports not recorded as sent',
        note: `${notSent.length} notifiable ${notSent.length === 1 ? 'incident has' : 'incidents have'} no JKKP 6 or JKKP 7 recorded as sent: ${notSent.map((i) => i.number).join(', ')}.`,
      }] : []),
      ...(undecided.length > 0 ? [{
        title: 'Not yet decided',
        note: 'These incidents point at a possible DOSH duty and nobody has recorded a decision, so they are counted as nothing above. Decide each one on the incident.',
        columns: [
          { key: 'ref', label: 'Ref', width: 60 },
          { key: 'date', label: 'Date', width: 70 },
          { key: 'title', label: 'What happened', width: 385 },
        ],
        rows: undecided.map((i) => ({ ref: i.number, date: day(i.occurredAt), title: i.title })),
      }] : []),
      {
        title: 'About these figures',
        note: 'Counted from the DOSH decision recorded on each incident. SafeChain does not submit anything to DOSH: check the figures against the current JKKP 8 form before filing it.',
      },
    ],
  }
}
