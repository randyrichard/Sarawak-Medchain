import { describe, expect, it } from 'vitest'
import { INCIDENT_TYPES } from '@/api/incidents'
import { INCIDENT_TYPE_GROUPS } from './lib'
import { MORE_STATUSES, STATUS_CHIPS } from './IncidentsListPage'
import { GROUP_NAV_ABOVE, NAV, NAV_GROUPS } from '@/components/layout/AppShell'

/*
 * Hick's law: decision time grows with the number of choices, so SafeOps keeps each choice
 * small - grouping long lists and putting rarer options one step away. Grouping has a
 * failure mode that hurts more than the slow choice it replaced: an option that falls out
 * of every group cannot be chosen at all. These tests hold both halves - small choices, and
 * nothing lost.
 */

describe('incident types are grouped, and none is lost', () => {
  const grouped = INCIDENT_TYPE_GROUPS.flatMap((g) => g.types)

  it('lists every incident type exactly once', () => {
    // A type missing here could not be reported from the form.
    expect([...grouped].sort()).toEqual([...INCIDENT_TYPES].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  it('keeps every group to seven types or fewer', () => {
    for (const g of INCIDENT_TYPE_GROUPS) expect(g.types.length).toBeLessThanOrEqual(7)
  })

  it('asks a first question with only a handful of answers', () => {
    expect(INCIDENT_TYPE_GROUPS.length).toBeLessThanOrEqual(4)
  })
})

describe('incident status filters show the common few, with the rest one step away', () => {
  it('shows at most four statuses at once', () => {
    expect(STATUS_CHIPS.length).toBeLessThanOrEqual(4)
  })

  it('keeps the default, "Open", in view', () => {
    expect(STATUS_CHIPS.map((c) => c.value)).toContain('open')
  })

  it('still reaches every status, each in one place', () => {
    const all = [...STATUS_CHIPS, ...MORE_STATUSES].map((c) => c.value)
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual(
      ['all', 'archived', 'awaiting_review', 'closed', 'high_risk', 'investigating', 'open', 'overdue'],
    )
  })
})

describe('the sidebar is chunked into small groups', () => {
  it('puts every grouped item in a known section of four or fewer', () => {
    for (const group of NAV_GROUPS) {
      const items = NAV.filter((i) => i.group === group)
      expect(items.length, group).toBeGreaterThan(0)
      expect(items.length, group).toBeLessThanOrEqual(4)
    }
    for (const item of NAV) if (item.group) expect(NAV_GROUPS).toContain(item.group)
  })

  it('keeps the everyday items ungrouped at the top, and few of them', () => {
    const top = NAV.filter((i) => !i.group)
    expect(top.length).toBeLessThanOrEqual(4)
    expect(NAV.slice(0, top.length)).toEqual(top)
    expect(top.map((i) => i.to)).toEqual(['/', '/near-miss', '/notifications'])
  })

  it('only groups once there is a list worth grouping', () => {
    expect(NAV.length).toBeGreaterThan(GROUP_NAV_ABOVE)
    expect(GROUP_NAV_ABOVE).toBeGreaterThanOrEqual(5)
  })
})
