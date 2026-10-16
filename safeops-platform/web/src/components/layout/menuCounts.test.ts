import { describe, expect, it } from 'vitest'
import type { AttentionKind } from '@/api/dashboardApi'
import { NAV } from './nav'
import { badgeText, countFor, menuTotal, type MenuCounts } from './menuCounts'

/*
 * On a phone the menu is closed, so the bell was the only sign anything was waiting. Each
 * menu row now carries how many items Home's Needs Attention holds for it.
 */
const counts: MenuCounts = {
  attention: { incident: 5, action: 2, permit: 3, equipment: 0, visitor: 0, report: 1 },
  unread: 11,
}
const row = (to: string) => NAV.find((n) => n.to === to)!

describe('the counts beside the menu', () => {
  it('gives every kind of item in Needs Attention exactly one row, so none is counted twice', () => {
    const kinds: AttentionKind[] = ['incident', 'action', 'permit', 'equipment', 'visitor', 'report']
    for (const kind of kinds) expect(NAV.filter((n) => n.count === kind), kind).toHaveLength(1)
    expect(NAV.filter((n) => n.count === 'unread').map((n) => n.to)).toEqual(['/notifications'])
    // The board is a view of the same incidents; only the register row counts them.
    expect(row('/incidents/board').count).toBeUndefined()
  })

  it('reads each row its own number', () => {
    expect(countFor(row('/actions'), counts)).toBe(2)
    expect(countFor(row('/incidents'), counts)).toBe(5)
    expect(countFor(row('/notifications'), counts)).toBe(11)
    expect(countFor(row('/training'), counts)).toBe(0)
    expect(countFor(row('/actions'), { attention: null, unread: 0 })).toBe(0)
    expect(countFor(row('/actions'), undefined)).toBe(0)
  })

  it('keeps a badge narrow', () => {
    expect(badgeText(7)).toBe('7')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(140)).toBe('99+')
  })

  it('adds up only the rows this person can see', () => {
    expect(menuTotal(counts, () => true)).toBe(5 + 2 + 3 + 1 + 11)
    expect(menuTotal(counts, (c) => c !== 'reports:view' && c !== 'incidents:view')).toBe(2 + 3 + 11)
    expect(menuTotal({ attention: null, unread: 0 }, () => true)).toBe(0)
  })
})
