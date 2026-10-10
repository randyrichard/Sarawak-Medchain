// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DashboardOverview } from '@/api/dashboardApi'
import { kpiCards } from './lib'
import {
  ActionsPanel, EquipmentPanel, IncidentPanel, PermitPanel, ReportPanel, VisitorPanel,
} from './components/ModulePanels'

/*
 * Every link into a page asks for something that page actually reads.
 *
 * Home linked to `/actions?due=overdue`, `/permits?status=awaiting`, `/assets?status=…`,
 * `/visitors?status=…` and `/incidents/board?status=…`; search linked to `/audits?open=…`
 * and `/assets?open=…`; reminders were stored as `/assets?asset=…` and `/training?cert=…`.
 * None of those names was read by the page it pointed at, so each opened an unfiltered
 * list - the number somebody clicked, or the record they were told about, was nowhere on
 * the screen. Nothing failed; the link just did less than it said, and nobody noticed for
 * months.
 *
 * Like serverAgreement.test.ts this reads source - the pages' and the API's - because the
 * mistake lives in the gap between two files that never import each other.
 */

const SRC = resolve(process.cwd(), 'src')
const API_LIB = resolve(process.cwd(), '../api/src/lib')

/** Where each route reads its query parameters. */
const PAGE: Record<string, string[]> = {
  '/actions': ['features/actions/ActionsPage.tsx'],
  '/permits': ['features/permits/PermitsPage.tsx'],
  '/assets': ['features/assets/AssetsPage.tsx'],
  '/visitors': ['features/visitors/VisitorsPage.tsx'],
  '/incidents': ['features/incidents/IncidentsListPage.tsx'],
  '/incidents/board': ['features/incidents/IncidentBoardPage.tsx', 'features/incidents/boardFilters.ts'],
  '/audits': ['features/audits/AuditsPage.tsx'],
  '/training': ['features/training/TrainingPage.tsx'],
  '/employees': ['features/employees/EmployeesPage.tsx'],
  '/contractors': ['features/contractors/ContractorsPage.tsx'],
  '/admin': ['features/admin/AdminPage.tsx'],
  '/reports': ['features/reports/ReportsPage.tsx'],
}

/** The query parameters a route's page reads, found in its source. */
function paramsReadBy(route: string): Set<string> {
  const files = PAGE[route]
  if (!files) throw new Error(`No page listed for ${route}. Add it to PAGE.`)
  const read = new Set<string>()
  for (const file of files) {
    const src = readFileSync(resolve(SRC, file), 'utf8')
    for (const m of src.matchAll(/params\.(?:get|has)\('([a-zA-Z]+)'\)/g)) read.add(m[1])
    for (const m of src.matchAll(/useUrlState(?:<[^>]*>)?\('([a-zA-Z]+)'/g)) read.add(m[1])
    // boardFilters.ts reads through a local `str('stage')`.
    for (const m of src.matchAll(/\bstr\('([a-zA-Z]+)'\)/g)) read.add(m[1])
    for (const m of src.matchAll(/openParam\(params((?:,\s*'[a-zA-Z]+')*)\)/g)) {
      read.add('open')
      for (const alias of m[1].matchAll(/'([a-zA-Z]+)'/g)) read.add(alias[1])
    }
  }
  if (read.size === 0) throw new Error(`Found no parameters read in ${files.join(', ')} - the patterns above need updating.`)
  return read
}

const split = (href: string) => {
  const [path, query = ''] = href.split('?')
  return { path, keys: [...new URLSearchParams(query).keys()] }
}

const overview: DashboardOverview = {
  generatedAt: '2026-08-11T00:00:00.000Z',
  scope: {
    companyName: 'Borneo Industrial Group', siteName: null, projectName: null,
    from: '2026-07-12T00:00:00.000Z', to: '2026-08-11T00:00:00.000Z', department: null,
    notes: { actionsFilteredByIncidentDepartment: false, reportsAreCompanyWide: true },
  },
  kpis: {
    activePermits: 3, permitsAwaitingReview: 2, overdueActions: 6, openInvestigations: 4,
    expiringEquipment: 1, equipmentOutOfService: 2, visitorsOnSite: 5, incidentsInRange: 7,
  },
  attention: [], attentionTotal: 0,
  incidents: { open: 4, investigating: 4, awaitingReview: 1, inRange: 7, bySeverity: [], recent: [] },
  permits: {
    byStage: ['draft', 'submitted', 'supervisor_review', 'hse_review', 'area_authority', 'approved',
      'active', 'suspended', 'closed', 'rejected'].map((stage) => ({ stage, label: stage.replace(/_/g, ' '), count: 1 })),
    active: 3, expiredOpen: 2, awaitingReview: 2, expiringSoon: 1, rejected: 1,
  },
  equipment: {
    inService: 40, outOfService: 2, inspectionOverdue: 1,
    calibrationOverdue: 1, calibrationMissing: 1, calibrationDueSoon: 1,
  },
  actions: { overdue: 6, dueToday: 1, dueThisWeek: 3, completedInRange: 8, byOwner: [] },
  visitors: { onSite: 5, expectedToday: 2, overdueCheckout: 1, current: [] },
  departments: [],
  reports: { recent: [], failed: 0, nextScheduled: null },
} as unknown as DashboardOverview

afterEach(cleanup)

describe("Home's links", () => {
  it('ask each page only for what it reads', () => {
    const { container } = render(
      <MemoryRouter>
        <IncidentPanel d={overview} />
        <PermitPanel d={overview} />
        <EquipmentPanel d={overview} />
        <ActionsPanel d={overview} />
        <VisitorPanel d={overview} />
        <ReportPanel d={overview} />
      </MemoryRouter>,
    )
    const hrefs = [
      ...[...container.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!),
      ...kpiCards(overview).map((c) => c.href),
    ]
    expect(hrefs.filter((h) => h.includes('?')).length).toBeGreaterThan(15)

    for (const href of hrefs) {
      const { path, keys } = split(href)
      if (keys.length === 0) continue
      const read = paramsReadBy(path)
      for (const key of keys) expect(read.has(key), `${href}: the page at ${path} never reads "${key}"`).toBe(true)
    }
  })
})

/*
 * The links the server writes: search results, the attention list, the records linked to
 * an incident, and reminders. The first parameter names the record; anything after it is a
 * marker the scheduler uses to tell one reminder from the next, and a page may ignore it.
 */
const hasApi = existsSync(API_LIB)
;(hasApi ? describe : describe.skip)("the server's links", () => {
  const templates = readdirSync(API_LIB)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .flatMap((f) => {
      const src = readFileSync(resolve(API_LIB, f), 'utf8')
      return [...src.matchAll(/[`'](\/[a-z/-]+(?:\/(?:\$\{[^}]+\}|[a-z0-9]+))?)\?([a-zA-Z]+)=/g)].map((m) => ({
        file: f, path: m[1], key: m[2],
      }))
    })

  it('finds them', () => {
    // A reformat that hides them from this scan must fail here, not pass by checking nothing.
    expect(templates.length).toBeGreaterThan(20)
  })

  it('name each record by a parameter its page reads', () => {
    for (const t of templates) {
      // `/actions/${id}?due=3`, the reminders' shape, is routed to the action in App.tsx.
      if (/^\/actions\/[^/]+$/.test(t.path)) continue
      const read = paramsReadBy(t.path)
      expect(read.has(t.key), `${t.file}: ${t.path}?${t.key}= is not read by the page`).toBe(true)
    }
  })
})
