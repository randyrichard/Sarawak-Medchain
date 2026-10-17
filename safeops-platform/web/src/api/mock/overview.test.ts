import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDemoStores } from './demo'
import {
  buildOverview, compareSites, COMPARE_ROLES, countAttention, INJURY_SEVERITIES, LOST_TIME_SEVERITIES, SEVERITY_RANK,
} from './overview'
import { kpiCards, notCountedNote } from '@/features/dashboard/lib'
import type { Actor } from '../incidents'

/*
 * The public demo's Home asked a server it does not have, so it opened on "This part of
 * SafeChain needs the SafeChain server" in red, twice, over "Needs Attention · 0 items". It
 * now counts Home from the demo's own records. What matters is that those numbers are the
 * ones the page behind each link shows, so most of this compares the two.
 */

const admin: Actor = { name: 'Randy Richard', role: 'admin', siteIds: [] }
const fresh = () => createDemoStores(() => {})

describe('Home in the offline demo', () => {
  it('has something to show: the demo has open incidents, overdue actions and live permits', () => {
    const o = buildOverview(fresh(), { companyId: 'big' }, admin)
    expect(o.attentionTotal).toBeGreaterThan(0)
    expect(o.attention.some((a) => a.priority === 'critical')).toBe(true)
    expect(o.kpis.overdueActions).toBeGreaterThan(0)
    expect(o.kpis.activePermits).toBeGreaterThan(0)
    expect(o.incidents.recent.length).toBeGreaterThan(0)
  })

  it('counts each figure through the same filter as the page its link opens', () => {
    const stores = fresh()
    const o = buildOverview(stores, { companyId: 'big' }, admin)
    const actions = (bucket: Parameters<typeof stores.incidents.listCapa>[1]['bucket']) =>
      stores.incidents.listCapa('big', { bucket }, admin).length
    const incidents = (status: Parameters<typeof stores.incidents.list>[1]['status']) =>
      stores.incidents.list('big', { status }).length
    const permits = (status: NonNullable<Parameters<typeof stores.permits.list>[1]>['status']) =>
      stores.permits.list('big', { status }).length

    expect(o.kpis.overdueActions).toBe(actions('overdue'))
    expect(o.actions.dueToday).toBe(actions('due_today'))
    expect(o.actions.dueThisWeek).toBe(actions('due_week'))
    expect(o.kpis.openInvestigations).toBe(incidents('investigating'))
    expect(o.incidents.awaitingReview).toBe(incidents('awaiting_review'))
    expect(o.kpis.activePermits).toBe(permits('active'))
    expect(o.kpis.permitsAwaitingReview).toBe(permits('awaiting'))
    expect(o.permits.expiringSoon).toBe(permits('expiring'))
    expect(o.permits.expiredOpen).toBe(permits('expired'))
    expect(o.equipment.inspectionOverdue).toBe(stores.incidents.listAssets('big', { bucket: 'overdue' }).length)
    expect(o.equipment.inService).toBe(stores.incidents.listAssets('big', { status: 'In Service' }).length)
  })

  it('orders the queue as the server does: band first, then the longest overdue', () => {
    const o = buildOverview(fresh(), { companyId: 'big' }, admin)
    const band = { critical: 0, overdue: 1, today: 2, soon: 3, review: 4 }
    for (let i = 1; i < o.attention.length; i++) {
      const [a, b] = [o.attention[i - 1], o.attention[i]]
      expect(band[a.priority]).toBeLessThanOrEqual(band[b.priority])
      if (a.priority === b.priority) expect(a.overdueDays ?? -1).toBeGreaterThanOrEqual(b.overdueDays ?? -1)
    }
    // Every critical item is an open incident of Serious or worse, and opens that incident.
    for (const item of o.attention.filter((a) => a.priority === 'critical')) {
      expect(item.kind).toBe('incident')
      expect(item.href).toMatch(/^\/incidents\/inc-/)
    }
  })

  it('words the queue as the server does: stage names, sentences, nothing open called overdue', () => {
    const o = buildOverview(fresh(), { companyId: 'big' }, admin)
    const critical = o.attention.filter((a) => a.priority === 'critical')
    for (const item of critical) {
      expect(item.status).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)*$/)
      expect(item.overdueDays).toBeNull()
      expect(item.detail).toMatch(/ · (opened today|open 1 day|open \d+ days)$/)
    }
    // Most severe first: a Critical incident above an older Serious one.
    const ranks = critical.map((a) => a.detail.split(' · ')[0])
    expect(ranks.indexOf('Critical')).toBeLessThan(ranks.lastIndexOf('Serious'))
    const details = o.attention.map((a) => a.detail)
    expect(details).toContain('Awaiting approval · raised today')
    expect(details.filter((d) => d.startsWith('Expires in'))).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Expires in (under an hour|1 hour|\d+ hours)$/)]),
    )
    expect(details.join('\n')).not.toMatch(/\(s\)|1 hours|Awaiting submitted/)
  })

  it('leaves out what the demo keeps no record of, and says so', () => {
    const o = buildOverview(fresh(), { companyId: 'big' }, admin)
    expect(o.notCounted).toEqual(expect.arrayContaining(['visitors', 'reports', 'calibration']))
    const tiles = kpiCards(o).map((c) => c.id)
    expect(tiles).not.toContain('visitorsOnSite')
    expect(tiles).not.toContain('expiringEquipment')
    expect(tiles).toContain('overdueActions')
    expect(notCountedNote(o)).toBe(
      'Not in this demo: visitors on site, scheduled reports and calibration certificates. They need the SafeChain server.',
    )
  })

  it('narrows to a site, and reaches actions through their incident for a department', () => {
    const stores = fresh()
    const atSite = buildOverview(stores, { companyId: 'big', siteId: 'btu' }, admin)
    expect(atSite.scope.siteName).toBe('Bintulu LNG Terminal')
    expect(atSite.incidents.recent.every((i) => i.site === 'Bintulu LNG Terminal')).toBe(true)
    expect(atSite.kpis.overdueActions).toBe(stores.incidents.listCapa('big', { bucket: 'overdue', siteId: 'btu' }, admin).length)

    const dept = buildOverview(stores, { companyId: 'big', department: 'Maintenance' }, admin)
    expect(dept.scope.notes.actionsFilteredByIncidentDepartment).toBe(true)
    const viaIncident = stores.incidents.listCapa('big', { bucket: 'overdue' }, admin)
      .filter((a) => a.incidentId !== null && a.department === 'Maintenance')
    expect(dept.kpis.overdueActions).toBe(viaIncident.length)
  })

  it('refuses what the server refuses', () => {
    const stores = fresh()
    expect(() => buildOverview(stores, { companyId: 'big', siteId: 'pjy' }, admin)).toThrow('Site not found in this workspace.')
    expect(() => buildOverview(stores, { companyId: 'big', projectId: 'p1' }, admin)).toThrow('Project not found in this workspace.')
    expect(() => buildOverview(stores, { companyId: 'big', from: '2026-10-10', to: '2026-10-01' }, admin)).toThrow('The start of the range is after its end.')
    expect(() => buildOverview(stores, { companyId: 'big', from: 'yesterday' }, admin)).toThrow('That date range is not valid.')
  })

  it('counts a picked range as whole local days', () => {
    const o = buildOverview(fresh(), { companyId: 'big', from: '2026-03-01', to: '2026-03-31' }, admin)
    expect(new Date(o.scope.from).getDate()).toBe(1)
    expect(new Date(o.scope.from).getHours()).toBe(0)
    expect(new Date(o.scope.to).getDate()).toBe(31)
    expect(new Date(o.scope.to).getHours()).toBe(23)
  })
})

describe('the menu\'s counts in the offline demo', () => {
  it('are Needs Attention counted by module', () => {
    const stores = fresh()
    const counts = countAttention(stores, { companyId: 'big' }, admin)
    const o = buildOverview(stores, { companyId: 'big' }, admin)
    expect(o.attentionTotal).toBeLessThan(40) // under the list's cap, so the list is complete
    for (const kind of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(counts[kind], kind).toBe(o.attention.filter((a) => a.kind === kind).length)
    }
    expect(counts.incident + counts.action + counts.permit).toBeGreaterThan(0)
  })

  it('narrow to the site in view, and are refused as Home is', () => {
    const stores = fresh()
    const atSite = countAttention(stores, { companyId: 'big', siteId: 'btu' }, admin)
    expect(atSite.action).toBe(stores.incidents.listCapa('big', { bucket: 'overdue', siteId: 'btu' }, admin).length)
    expect(() => countAttention(stores, { companyId: 'big', siteId: 'pjy' }, admin)).toThrow('Site not found in this workspace.')
  })
})

describe('Site comparison in the offline demo', () => {
  it('has a row for every site in the workspace, the ones needing attention first', () => {
    const c = compareSites(fresh(), { companyId: 'big' }, admin)
    expect(c.rows.map((r) => r.siteId).sort()).toEqual(['btu', 'kch', 'mri', 'sbu', 'sen', 'twu'])
    const firstQuiet = c.rows.findIndex((r) => r.attention.length === 0)
    if (firstQuiet >= 0) expect(c.rows.slice(firstQuiet).every((r) => r.attention.length === 0)).toBe(true)
  })

  it('agrees with the tiles above it', () => {
    const stores = fresh()
    const o = buildOverview(stores, { companyId: 'big' }, admin)
    const c = compareSites(stores, { companyId: 'big' }, admin)
    const sum = (k: 'openIncidents' | 'overdueActions' | 'activePermits' | 'incidentsInRange') =>
      c.rows.reduce((n, r) => n + r[k], 0)
    expect(sum('openIncidents')).toBe(o.incidents.open)
    expect(sum('overdueActions')).toBe(o.kpis.overdueActions)
    expect(sum('activePermits')).toBe(o.kpis.activePermits)
    expect(sum('incidentsInRange')).toBe(o.kpis.incidentsInRange)
  })

  it('does not accuse a site of skipping a toolbox meeting the demo cannot record', () => {
    const c = compareSites(fresh(), { companyId: 'big' }, admin)
    expect(c.notCounted).toEqual(expect.arrayContaining(['toolbox', 'visitors']))
    expect(c.rows.some((r) => r.activePermits > 0)).toBe(true)
    for (const r of c.rows) expect(r.attention.join(' ')).not.toMatch(/toolbox/i)
  })

  it('is refused to the roles the server refuses, and limited to a member\'s own sites', () => {
    const stores = fresh()
    expect(() => compareSites(stores, { companyId: 'big' }, { ...admin, role: 'supervisor' })).toThrow('Your role does not permit comparing sites.')
    const officer = compareSites(stores, { companyId: 'big' }, { name: 'Amirul Hassan', role: 'safety_officer', siteIds: ['btu'] })
    expect(officer.rows.map((r) => r.siteId)).toEqual(['btu'])
  })
})

/*
 * The demo copies the server's definitions, so they must not drift apart. Read from the API's
 * source, as serverAgreement.test.ts does; skipped, with a reason, without the API beside it.
 */
const API = resolve(process.cwd(), '../api/src/lib')
const d = existsSync(API) ? describe : describe.skip

d('the demo counts by the server\'s definitions', () => {
  const source = (file: string) => readFileSync(resolve(API, file), 'utf8')
  const list = (file: string, name: string) => {
    const m = source(file).match(new RegExp(`const ${name}[^=]*= \\[([^\\]]*)\\]`))
    if (!m) throw new Error(`Could not find ${name} in ${file}; update this test to its new shape.`)
    return [...m[1].matchAll(/'([a-z_]+)'/gi)].map((x) => x[1])
  }

  it('ranks severity the same way', () => {
    const m = source('incidentCatalog.ts').match(/SEVERITY_RANK: Record<IncidentSeverity, number> = \{([^}]*)\}/)
    if (!m) throw new Error('Could not find SEVERITY_RANK in incidentCatalog.ts.')
    const server = Object.fromEntries([...m[1].matchAll(/(\w+): (\d+)/g)].map((x) => [x[1], Number(x[2])]))
    expect(SEVERITY_RANK).toEqual(server)
    expect(source('dashboardService.ts')).toContain('const CRITICAL_RANK = SEVERITY_RANK.Serious')
  })

  it('classifies lost time and injuries the same way', () => {
    expect(LOST_TIME_SEVERITIES).toEqual(list('incidentCatalog.ts', 'LOST_TIME_SEVERITIES'))
    expect(INJURY_SEVERITIES).toEqual(list('incidentCatalog.ts', 'INJURY_SEVERITIES'))
  })

  it('lets the same roles compare sites', () => {
    expect(COMPARE_ROLES).toEqual(list('siteComparison.ts', 'COMPARE_ROLES'))
  })
})
