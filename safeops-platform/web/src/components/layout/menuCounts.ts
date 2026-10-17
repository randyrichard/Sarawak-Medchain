import type { AttentionCounts } from '@/api/dashboardApi'
import type { Capability } from '@/features/permissions/permissions'
import { NAV, type NavItem } from './nav'

/**
 * The counts beside the menu, and what each one means.
 *
 * A phone shows the menu only when somebody opens it, so before these the only sign that
 * anything was waiting was the bell. Each row now carries the number of items Home's Needs
 * Attention holds for it (`attention`), and Notifications its unread count (`unread`); the
 * menu button carries a dot when any row has a number.
 */
export interface MenuCounts {
  /** Null until the first answer, and kept as it was when a refresh fails. */
  attention: AttentionCounts | null
  unread: number
}

/** What each count is a number of, said after it: "2 overdue", "11 unread". */
export const COUNT_MEANS: Record<NonNullable<NavItem['count']>, string> = {
  unread: 'unread',
  incident: 'critical and open',
  action: 'overdue',
  permit: 'need attention',
  equipment: 'not fit for use',
  visitor: 'past their time out',
  report: 'not delivered',
}

/** The number beside a menu row; 0 for none. */
export function countFor(item: Pick<NavItem, 'count'>, counts: MenuCounts | undefined): number {
  if (!item.count || !counts) return 0
  return item.count === 'unread' ? counts.unread : counts.attention?.[item.count] ?? 0
}

/** A badge stays two digits wide: "99+" rather than a number that pushes the label aside. */
export const badgeText = (n: number) => (n > 99 ? '99+' : String(n))

/** Everything waiting behind the menu button, across the rows this person can see. */
export function menuTotal(counts: MenuCounts | undefined, allowed: (c: Capability) => boolean): number {
  return NAV
    .filter((item) => item.count && allowed(item.capability))
    .reduce((n, item) => n + countFor(item, counts), 0)
}
