import { describe, it, expect } from 'vitest'
import type { AttentionItem, DashboardOverview } from '@/api/dashboardApi'
import {
  filterAttention, headline, kindLabel, kpiCards, overdueLabel, priorityRank,
  priorityTone, reportStatusLabel, scopeCaveats, scopeSummary, severityBars,
  sortAttention, visiblePermitStages,
} from './lib'

/**
 * The dashboard's decisions.
 *
 * The page calls these directly - there is no second copy - so what is asserted here is
 * what an operator sees. The web suite has no DOM renderer, which keeps these at the same
 * level as the incident board's filters and the reports page's badges.
 */
const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
  id: 'a1', kind: 'action', priority: 'overdue', reference: 'CA-0001',
  title: 'Fit a machine guard', owner: 'Marcus Tan', status: 'open',
  overdueDays: 4, detail: 'High priority', href: '/actions', ...over,
})

const overview = (over: Partial<DashboardOverview> = {}): DashboardOverview => ({
  generatedAt: '2026-08-11T00:00:00.000Z',
  scope: {
    companyName: 'Borneo Industrial Group', siteName: null,
    from: '2026-07-12T00:00:00.000Z', to: '2026-08-11T00:00:00.000Z',
    department: null,
    notes: { actionsFilteredByIncidentDepartment: false, reportsAreCompanyWide: true },
  },
  kpis: {
    activePermits: 3, permitsAwaitingReview: 2, overdueActions: 6, openInvestigations: 4,
    expiringEquipment: 1, equipmentOutOfService: 2, visitorsOnSite: 5, incidentsInRange: 7,
  },
  attention: [], attentionTotal: 0,
  incidents: {
    open: 4, investigating: 4, awaitingReview: 1, inRange: 7,
    bySeverity: [], recent: [],
  },
  permits: {
    byStage: [
      { stage: 'draft', label: 'draft', count: 0 },
      { stage: 'submitted', label: 'submitted', count: 1 },
      { stage: 'supervisor_review', label: 'supervisor review', count: 0 },
      { stage: 'hse_review', label: 'hse review', count: 1 },
      { stage: 'area_authority', label: 'area authority', count: 0 },
      { stage: 'approved', label: 'approved', count: 0 },
      { stage: 'active', label: 'active', count: 3 },
      { stage: 'suspended', label: 'suspended', count: 0 },
      { stage: 'closed', label: 'closed', count: 9 },
      { stage: 'rejected', label: 'rejected', count: 0 },
    ],
    active: 3, expiredOpen: 2, awaitingReview: 2, expiringSoon: 1, rejected: 0,
  },
  equipment: {
    inService: 40, outOfService: 2, inspectionOverdue: 1,
    calibrationOverdue: 1, calibrationMissing: 0, calibrationDueSoon: 0,
  },
  actions: { overdue: 6, dueToday: 1, dueThisWeek: 3, completedInRange: 8, byOwner: [] },
  visitors: { onSite: 5, expectedToday: 2, overdueCheckout: 1, current: [] },
  departments: ['Logistics', 'Maintenance'],
  reports: { recent: [], failed: 0, nextScheduled: null },
  ...over,
})

describe('kpiCards', () => {
  it('shows all eight cards with their real values', () => {
    const cards = kpiCards(overview())
    expect(cards).toHaveLength(8)
    expect(cards.find((c) => c.id === 'overdueActions')?.value).toBe(6)
    expect(cards.find((c) => c.id === 'visitorsOnSite')?.value).toBe(5)
  })

  it('sends every card somewhere in the app', () => {
    for (const c of kpiCards(overview())) {
      expect(c.href).toMatch(/^\/[a-z]/)
      expect(c.label).toBeTruthy()
    }
  })

  it('colours a card only when it is asking for something', () => {
    /*
     * Ten active permits is a Tuesday, not a problem. Colouring by magnitude turns the
     * grid into wallpaper and the one number that matters stops standing out.
     */
    const busy = kpiCards(overview())
    expect(busy.find((c) => c.id === 'overdueActions')?.tone).toBe('critical')
    expect(busy.find((c) => c.id === 'activePermits')?.tone).toBe('neutral')

    const calm = kpiCards(overview({
      kpis: { ...overview().kpis, overdueActions: 0, openInvestigations: 0 },
    }))
    expect(calm.find((c) => c.id === 'overdueActions')?.tone).toBe('good')
    expect(calm.find((c) => c.id === 'openInvestigations')?.tone).toBe('good')
  })

  it('gives every card something to say when it is zero', () => {
    // A grid of bare zeroes reads as broken rather than as calm.
    for (const c of kpiCards(overview())) {
      expect(c.quiet.length).toBeGreaterThan(3)
      expect(c.quiet).not.toMatch(/^0/)
    }
  })
})

describe('headline', () => {
  it('leads with critical items when there are any', () => {
    const h = headline(overview({
      attention: [item({ priority: 'critical' }), item({ id: 'b', priority: 'overdue' })],
      attentionTotal: 2,
    }))
    expect(h.text).toMatch(/1 critical item needs attention now/)
    expect(h.tone).toBe('critical')
  })

  it('falls back to overdue when nothing is critical', () => {
    const h = headline(overview({
      attention: [item({ priority: 'overdue' }), item({ id: 'b', priority: 'overdue' })],
      attentionTotal: 2,
    }))
    expect(h.text).toMatch(/2 overdue items to clear/)
    expect(h.tone).toBe('warning')
  })

  it('says all clear rather than showing an empty panel', () => {
    const h = headline(overview({ attention: [], attentionTotal: 0 }))
    expect(h.text).toMatch(/All clear/)
    expect(h.tone).toBe('good')
  })

  it('does not call a queue of pending reviews a crisis', () => {
    const h = headline(overview({
      attention: [item({ priority: 'review' })], attentionTotal: 1,
    }))
    expect(h.tone).toBe('accent')
    expect(h.text).toMatch(/none overdue/)
  })
})

describe('attention ordering', () => {
  it('puts a critical item above an older overdue one', () => {
    // The failure this guards: sorting by age alone buries a fatality under routine work.
    const sorted = sortAttention([
      item({ id: 'old', priority: 'overdue', overdueDays: 90 }),
      item({ id: 'crit', priority: 'critical', overdueDays: 1, kind: 'incident' }),
    ])
    expect(sorted[0].id).toBe('crit')
  })

  it('orders the bands the way an operator works down them', () => {
    expect(priorityRank('critical')).toBeLessThan(priorityRank('overdue'))
    expect(priorityRank('overdue')).toBeLessThan(priorityRank('today'))
    expect(priorityRank('today')).toBeLessThan(priorityRank('soon'))
    expect(priorityRank('soon')).toBeLessThan(priorityRank('review'))
  })

  it('sorts the most overdue first inside a band', () => {
    const sorted = sortAttention([
      item({ id: 'a', overdueDays: 2 }),
      item({ id: 'b', overdueDays: 30 }),
      item({ id: 'c', overdueDays: 9 }),
    ])
    expect(sorted.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not lose undated items, but does not float them to the top', () => {
    const sorted = sortAttention([
      item({ id: 'none', overdueDays: null }),
      item({ id: 'late', overdueDays: 3 }),
    ])
    expect(sorted.map((s) => s.id)).toEqual(['late', 'none'])
  })

  it('gives critical and overdue the same alarming colour', () => {
    expect(priorityTone('critical')).toBe('critical')
    expect(priorityTone('overdue')).toBe('critical')
    expect(priorityTone('review')).toBe('accent')
  })

  it('narrows to one kind without reordering the rest', () => {
    const items = [
      item({ id: 'i', kind: 'incident', priority: 'critical' }),
      item({ id: 'a', kind: 'action' }),
      item({ id: 'p', kind: 'permit', priority: 'review' }),
    ]
    expect(filterAttention(items, 'all')).toHaveLength(3)
    expect(filterAttention(items, 'action').map((x) => x.id)).toEqual(['a'])
    expect(filterAttention(items, 'equipment')).toEqual([])
  })

  it('names every kind it can show', () => {
    for (const k of ['incident', 'action', 'permit', 'equipment', 'visitor', 'report'] as const) {
      expect(kindLabel(k)).toBeTruthy()
    }
  })
})

describe('overdueLabel', () => {
  it('says nothing when nothing is late', () => {
    expect(overdueLabel(null)).toBeNull()
  })

  it('calls zero days due today rather than nought days late', () => {
    expect(overdueLabel(0)).toBe('due today')
    expect(overdueLabel(-2)).toBe('due today')
  })

  it('gets the singular right', () => {
    expect(overdueLabel(1)).toBe('1 day overdue')
    expect(overdueLabel(5)).toBe('5 days overdue')
  })

  it('rounds long delays into something readable', () => {
    // "97 days" is a number to decode; "over 3 months" is a fact.
    expect(overdueLabel(31)).toBe('over a month overdue')
    expect(overdueLabel(97)).toBe('over 3 months overdue')
  })
})

describe('severityBars', () => {
  it('orders the most serious band first, by rank not by name', () => {
    const bars = severityBars(overview({
      incidents: {
        ...overview().incidents,
        bySeverity: [
          { severity: 'fatality', label: 'Fatality', rank: 7, count: 1 },
          { severity: 'Minor', label: 'Minor', rank: 1, count: 9 },
        ],
      },
    }))
    expect(bars[0].severity).toBe('fatality')
    expect(bars[0].tone).toBe('critical')
    expect(bars[1].tone).toBe('neutral')
  })

  it('keeps a single incident visible against a large band', () => {
    const bars = severityBars(overview({
      incidents: {
        ...overview().incidents,
        bySeverity: [
          { severity: 'Minor', label: 'Minor', rank: 1, count: 200 },
          { severity: 'fatality', label: 'Fatality', rank: 7, count: 1 },
        ],
      },
    }))
    // One in two hundred still has to be visible; a hairline bar hides the worst row.
    expect(bars.find((b) => b.severity === 'fatality')!.percent).toBeGreaterThanOrEqual(6)
  })

  it('handles an empty breakdown without dividing by zero', () => {
    expect(severityBars(overview())).toEqual([])
  })
})

describe('visiblePermitStages', () => {
  it('always shows the approval chain even when it is empty', () => {
    const stages = visiblePermitStages(overview()).map((s) => s.stage)
    expect(stages).toContain('supervisor_review')
    expect(stages).toContain('area_authority')
    expect(stages).toContain('active')
  })

  it('hides empty stages nobody is waiting on', () => {
    const stages = visiblePermitStages(overview()).map((s) => s.stage)
    expect(stages).not.toContain('draft')
    expect(stages).not.toContain('rejected')
  })

  it('shows an unusual stage as soon as something is in it', () => {
    const d = overview()
    d.permits.byStage = d.permits.byStage.map((s) =>
      (s.stage === 'suspended' ? { ...s, count: 2 } : s))
    expect(visiblePermitStages(d).map((s) => s.stage)).toContain('suspended')
  })
})

describe('reportStatusLabel', () => {
  it('uses the same words as the Reports page', () => {
    expect(reportStatusLabel('sent')).toEqual({ label: 'Sent', tone: 'good' })
    expect(reportStatusLabel('failed')).toEqual({ label: 'Failed', tone: 'critical' })
    expect(reportStatusLabel('email_pending')).toEqual({ label: 'Sending', tone: 'warning' })
    expect(reportStatusLabel('generated')).toEqual({ label: 'Generated', tone: 'neutral' })
  })

  it('never reports sent for anything else', () => {
    for (const s of ['generated', 'email_pending', 'failed']) {
      expect(reportStatusLabel(s).label).not.toBe('Sent')
    }
  })
})

describe('scope', () => {
  it('says what the page is currently counting', () => {
    const s = scopeSummary(overview())
    expect(s).toMatch(/All sites/)
    expect(s).toMatch(/2026-07-12 to 2026-08-11/)
  })

  it('names the site and department when they are set', () => {
    const s = scopeSummary(overview({
      scope: { ...overview().scope, siteName: 'Bintulu', department: 'Maintenance' },
    }))
    expect(s).toMatch(/Bintulu/)
    expect(s).toMatch(/Maintenance/)
  })

  it('stays quiet when there is nothing to caveat', () => {
    expect(scopeCaveats(overview())).toEqual([])
  })

  it('admits that a department filter reached actions through their incident', () => {
    /*
     * Silence would be the dishonest option: the total will not reconcile against the
     * Actions register, and the operator deserves to know why before they go looking.
     */
    const c = scopeCaveats(overview({
      scope: {
        ...overview().scope, department: 'Maintenance',
        notes: { actionsFilteredByIncidentDepartment: true, reportsAreCompanyWide: true },
      },
    }))
    expect(c.some((x) => /Standalone actions are excluded/.test(x))).toBe(true)
  })

  it('admits that the site filter does not reach scheduled reports', () => {
    const c = scopeCaveats(overview({
      scope: { ...overview().scope, siteName: 'Bintulu' },
    }))
    expect(c.some((x) => /company-wide/.test(x))).toBe(true)
  })
})
