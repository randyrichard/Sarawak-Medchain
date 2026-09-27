/**
 * One incident, on one page, written from its record.
 *
 * The accident investigation report is the document a safety officer said takes longest
 * to prepare (docs/CUSTOMER_RESEARCH.md, P5): the facts are all in SafeOps already, spread
 * across the report, the people, the investigation and the actions, and assembling them
 * for a client or management meant copying each into Word by hand.
 *
 * Every sentence is built from fields, never paraphrased or inferred. Where a field is
 * empty the page says it has not been recorded, rather than leaving a gap a reader could
 * take for "nothing to say". Access is exactly the incident page's: `IncidentService.get`
 * applies tenant membership, row scope and the anonymous-reporter mask, so this can show
 * nobody anything they could not already open.
 */
import type { PrismaClient } from '@prisma/client'
import { IncidentService, type Caller } from './incidentService.js'
import { PERSON_ROLE_LABEL } from './incidentInvestigation.js'
import { docDate, humanize, severityName, stageLabel, typeName } from './incidentCatalog.js'
import type { ReportData } from './reportService.js'

const DAY = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const NOT_RECORDED = 'Not yet recorded.'

export class IncidentSummaryService {
  private incidents: IncidentService

  constructor(private db: PrismaClient) {
    this.incidents = new IncidentService(db)
  }

  async build(caller: Caller, incidentId: string): Promise<ReportData> {
    // Access, scope and the anonymous mask - the incident page's own rules.
    const inc = await this.incidents.get(caller, incidentId)

    const [company, site, people] = await Promise.all([
      this.db.company.findUnique({ where: { id: inc.companyId }, select: { name: true } }),
      this.db.site.findUnique({ where: { id: inc.siteId }, select: { name: true, timezone: true } }),
      this.db.incidentPerson.findMany({
        where: { incidentId: inc.id },
        orderBy: [{ role: 'asc' }, { addedAt: 'asc' }],
      }),
    ])

    const tz = site?.timezone || 'Asia/Kuching'
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).format(d)
    const fmtDate = (d: Date) => docDate(d)

    const type = typeName(inc.type)
    const severity = severityName(inc.severity)
    const stage = stageLabel(inc.stage)
    const siteName = site?.name ?? ''
    // IncidentService has already masked the name for anyone below HSE manager; those who
    // may see it are still told the report was filed anonymously.
    const masked = inc.anonymous && inc.reporterId === null
    const reporter = masked ? 'an anonymous reporter'
      : `${inc.reporter || 'an unnamed reporter'}${inc.anonymous ? ' (filed anonymously)' : ''}`

    const injured = people.filter((p) => p.injuryType)
    const daysLost = people.reduce((n, p) => n + (p.daysLost ?? 0), 0)
    const today = utcDay(new Date())
    const actions = inc.actions.filter((a) => a.status !== 'cancelled')
    const done = actions.filter((a) => a.status === 'completed' || a.status === 'verified')
    const late = actions.filter((a) => (a.status === 'open' || a.status === 'in_progress') && utcDay(a.dueDate) < today)
    const closed = inc.stage === 'closed'
    // When it was reported, which is what the incident page shows - not when the row was
    // written, which differs for anything entered after the fact or queued offline.
    const reportedAt = inc.reportedAt ?? inc.createdAt
    const openDays = Math.max(0, Math.round((today - utcDay(reportedAt)) / DAY))

    const summary = [
      `${inc.number}, ${/^[aeiou]/i.test(type) ? 'an' : 'a'} ${type} incident of ${severity} severity, occurred at `
        + `${inc.location}, ${siteName} on ${fmt(inc.occurredAt)} and was reported by ${reporter} on ${fmt(reportedAt)}.`,
      people.length === 0
        ? 'No people have been recorded against it.'
        : `${plural(people.length, 'person was', 'people were')} recorded as involved`
          + (injured.length ? `, ${injured.length} injured${daysLost ? ` with ${plural(daysLost, 'day')} lost` : ''}.` : ', none injured.'),
      inc.rootCause
        ? `The root cause is recorded as: ${inc.rootCause.trim().replace(/\.$/, '')}.`
        : 'No root cause has been recorded yet.',
      actions.length === 0
        ? 'No corrective actions have been raised.'
        : `${plural(actions.length, 'corrective action')} raised, ${done.length} completed`
          + (late.length ? `, ${late.length} overdue.` : '.'),
      closed
        ? `The incident was closed${inc.closedAt ? ` on ${fmt(inc.closedAt)}` : ''}.`
        : `It is at the ${stage} stage and has been open for ${plural(openDays, 'day')}.`,
    ].join(' ')

    const facts: [string, string][] = [
      ['Incident', `${inc.number} — ${inc.title}`],
      ['Type', type],
      ['Severity', severity + (inc.highRisk ? ' (high risk)' : '')],
      ['Site', siteName],
      ['Location', inc.location],
      ['Department', inc.department || 'Not recorded'],
      ['Occurred', fmt(inc.occurredAt)],
      ['Reported', `${fmt(reportedAt)} by ${reporter}`],
      ['Conditions', [inc.shift && `Shift: ${inc.shift}`, inc.weather && `Weather: ${inc.weather}`].filter(Boolean).join(' · ') || 'Not recorded'],
      ['Emergency response', inc.emergencyResponseActivated ? 'Activated' : 'Not activated'],
      ['Stage', closed ? `Closed${inc.closedAt ? ` ${fmt(inc.closedAt)}` : ''}` : stage],
    ]

    const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : NOT_RECORDED)

    return {
      type: 'incident_summary',
      title: `Incident summary — ${inc.number}`,
      companyName: company?.name ?? '',
      siteName: siteName || null,
      generatedAt: new Date(),
      // The document's times in the site's own zone, and a footer fit for a client: this
      // is the page an HSE manager sends out, so "not for external distribution" was wrong.
      timezone: tz,
      periodLabel: `Occurred ${fmt(inc.occurredAt)}`,
      footer: `Confidential - incident summary prepared by ${company?.name ?? 'the company'} using SafeOps`,
      periodStart: null,
      periodEnd: new Date(),
      summary: [
        { label: 'People involved', value: String(people.length) },
        { label: 'Injured', value: String(injured.length) },
        { label: 'Days lost', value: String(daysLost) },
        { label: 'Actions overdue', value: String(late.length) },
      ],
      columns: [
        { key: 'k', label: 'Fact', width: 110 },
        { key: 'v', label: 'Detail', width: 405 },
      ],
      rows: facts.map(([k, v]) => ({ k, v })),
      emptyMessage: '',
      sections: [
        { title: 'Summary', note: summary },
        { title: 'What happened', note: text(inc.description) },
        { title: 'Immediate actions taken', note: text(inc.immediateActions) },
        {
          title: 'People involved',
          note: people.length === 0 ? 'Nobody has been recorded against this incident.' : undefined,
          ...(people.length > 0 ? {
            columns: [
              { key: 'name', label: 'Name', width: 100 },
              { key: 'role', label: 'Role', width: 70 },
              { key: 'company', label: 'Company', width: 80 },
              { key: 'injury', label: 'Injury', width: 80 },
              { key: 'body', label: 'Body part', width: 60 },
              { key: 'treatment', label: 'Treatment', width: 80 },
              { key: 'days', label: 'Days lost', width: 45 },
            ],
            rows: people.map((p) => ({
              name: p.name,
              role: PERSON_ROLE_LABEL[p.role] ?? p.role,
              company: p.company || '-',
              injury: p.injuryType || '-',
              body: p.bodyPart || '-',
              treatment: p.treatment || '-',
              days: p.daysLost == null ? '-' : String(p.daysLost),
            })),
          } : {}),
        },
        {
          title: 'Investigation',
          // A table rather than a paragraph: each finding is read, and checked, on its own.
          columns: [
            { key: 'k', label: 'Finding', width: 110 },
            { key: 'v', label: 'Recorded', width: 405 },
          ],
          rows: [
            { k: 'Lead investigator', v: inc.leadInvestigator || 'Not yet assigned' },
            { k: 'Team', v: text(inc.investigationTeam) },
            { k: 'Direct cause', v: text(inc.directCause) },
            { k: 'Root cause', v: text(inc.rootCause) },
            { k: 'Contributing factors', v: text(inc.contributingFactors) },
            { k: 'Recommendations', v: text(inc.recommendations) },
          ],
        },
        {
          title: 'Corrective actions',
          note: actions.length === 0 ? 'None raised.' : undefined,
          ...(actions.length > 0 ? {
            columns: [
              { key: 'code', label: 'Action', width: 52 },
              { key: 'title', label: 'What', width: 200 },
              { key: 'owner', label: 'Owner', width: 90 },
              { key: 'due', label: 'Due', width: 56 },
              { key: 'status', label: 'Status', width: 80 },
            ],
            rows: actions.map((a) => {
              const isLate = (a.status === 'open' || a.status === 'in_progress') && utcDay(a.dueDate) < today
              return {
                code: a.code,
                title: a.title,
                owner: a.owner,
                due: fmtDate(a.dueDate),
                status: isLate ? 'Overdue' : humanize(a.status),
              }
            }),
          } : {}),
        },
        { title: 'Reviewed by', writeIn: 3 },
      ],
    }
  }
}
