import { describe, expect, it } from 'vitest'
import { actionPanels, NO_DEPARTMENT, type PanelRow } from './actionPanels.js'

// Noon on 20 August 2026 in Malaysia (UTC+8).
const NOW = new Date('2026-08-20T04:00:00Z')
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`) // a due date: a whole local day
const at = (iso: string) => new Date(iso)

const row = (over: Partial<PanelRow> = {}): PanelRow => ({
  status: 'open', owner: 'Aisyah', siteId: 'btu', dueDate: day('2026-08-25'),
  createdAt: at('2026-08-01T02:00:00Z'), completedAt: null, verifiedAt: null, department: 'Maintenance',
  ...over,
})

describe('corrective action analytics', () => {
  it('counts only what it is given', () => {
    const p = actionPanels([
      row({ status: 'verified', completedAt: at('2026-08-10T02:00:00Z'), verifiedAt: at('2026-08-11T02:00:00Z') }),
      row({ status: 'open', dueDate: day('2026-08-18') }), // overdue
      row({ status: 'completed', owner: 'Ben', siteId: 'kch', completedAt: at('2026-08-19T02:00:00Z') }),
      row({ status: 'cancelled', owner: 'Ghost' }),
    ], NOW)

    // Verified of everything not cancelled.
    expect(p.completionRate).toBe(33)
    // 1 Aug 10:00 to 11 Aug 10:00 local: ten days.
    expect(p.avgCloseDays).toBe(10)
    expect(p.mostOverdueSite).toEqual({ siteId: 'btu', count: 1 })
    expect(p.byOwner.map((o) => o.name)).toEqual(['Aisyah', 'Ben'])
    expect(p.byOwner[0]).toEqual({ name: 'Aisyah', open: 1, overdue: 1, completed: 1 })
    // Being done, or done and waiting for a check: both still somebody's work.
    expect(p.bySite).toEqual([{ siteId: 'btu', open: 1 }, { siteId: 'kch', open: 1 }])
  })

  it('says nothing, rather than zero, when there is nothing to count', () => {
    const p = actionPanels([], NOW)
    expect(p.completionRate).toBeNull()
    expect(p.onTimeRate).toBeNull()
    expect(p.avgCloseDays).toBeNull()
    expect(p.mostOverdueSite).toBeNull()
    expect(p.byOwner).toEqual([])
  })

  it('leaves a record entered after the work out of the close time', () => {
    // Created on the 12th for work verified on the 11th: back-filled, so no close time.
    const p = actionPanels([
      row({ status: 'verified', createdAt: at('2026-08-12T02:00:00Z'), completedAt: at('2026-08-10T02:00:00Z'), verifiedAt: at('2026-08-11T02:00:00Z') }),
      row({ status: 'verified', completedAt: at('2026-08-03T02:00:00Z'), verifiedAt: at('2026-08-05T02:00:00Z') }),
    ], NOW)
    expect(p.avgCloseDays).toBe(4)
  })

  it('treats the due date as the whole day', () => {
    // Finished at 23:00 local on the due date: on time. At 00:30 the next day: late.
    const onTheDay = row({ status: 'verified', dueDate: day('2026-08-10'), completedAt: at('2026-08-10T15:00:00Z') })
    const nextDay = row({ status: 'verified', dueDate: day('2026-08-10'), completedAt: at('2026-08-10T16:30:00Z') })
    expect(actionPanels([onTheDay], NOW).onTimeRate).toBe(100)
    expect(actionPanels([nextDay], NOW).onTimeRate).toBe(0)
  })

  it('is not overdue on the day it is due', () => {
    const p = actionPanels([row({ dueDate: day('2026-08-20') })], NOW)
    expect(p.mostOverdueSite).toBeNull()
  })

  it('files actions from audits and inspections under their own heading, not a blank one', () => {
    const p = actionPanels([
      row({ status: 'verified', department: null, completedAt: at('2026-08-05T02:00:00Z') }),
      row({ status: 'verified', department: 'Logistics', completedAt: at('2026-08-30T02:00:00Z'), dueDate: day('2026-08-25') }),
    ], NOW)
    expect(p.byDepartment).toEqual([
      { name: NO_DEPARTMENT, onTimePct: 100, completed: 1 },
      { name: 'Logistics', onTimePct: 0, completed: 1 },
    ])
  })

  it('counts six local months, ending with this one', () => {
    const p = actionPanels([
      // 23:30 on 31 July local (15:30 UTC): July.
      row({ createdAt: at('2026-07-31T15:30:00Z') }),
      // 1 August 00:30 local is 16:30 UTC on 31 July: August, by the local calendar.
      row({ createdAt: at('2026-07-31T16:30:00Z') }),
      row({ createdAt: at('2026-01-15T02:00:00Z') }), // before the window
    ], NOW)
    expect(p.monthly).toHaveLength(6)
    expect(p.monthly.map((m) => m.month)).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'])
    expect(p.monthly.find((m) => m.month === 'Jul')?.created).toBe(1)
    expect(p.monthly.find((m) => m.month === 'Aug')?.created).toBe(1)
  })
})
