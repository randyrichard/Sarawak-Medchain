// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AttentionCounts } from '@/api/dashboardApi'

/*
 * The counts in the menu, and the dot on the phone's menu button that says the closed menu
 * has something in it. Rendered through the real shell, with the data sources stubbed.
 */
const state: { attention: AttentionCounts | null; unread: number; can: (c: string) => boolean } = {
  attention: null, unread: 0, can: () => true,
}
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ allowed: (c: string) => state.can(c), company: { id: 'big', name: 'Borneo Industrial Group', plan: 'enterprise' } }),
}))
vi.mock('./useAttentionCounts', () => ({ useAttentionCounts: () => state.attention }))
vi.mock('./notificationFeed', () => ({
  NotificationFeedProvider: ({ children }: { children: unknown }) => children,
  useNotificationFeed: () => ({ items: [], unread: state.unread, markRead: () => {}, markAllRead: async () => {} }),
}))
vi.mock('./Topbar', () => ({ Topbar: ({ menuButton }: { menuButton: unknown }) => <header>{menuButton as never}</header> }))
vi.mock('./Switchers', () => ({ CompanySwitcher: () => null }))
vi.mock('./KeyboardShortcuts', () => ({ KeyboardShortcuts: () => null }))
vi.mock('@/features/platform/usePlatformAdmin', () => ({ usePlatformAdmin: () => false }))
vi.mock('@/features/incidents/components/OutboxBanner', () => ({ OutboxBanner: () => null }))

const { default: AppShell, SidebarContent } = await import('./AppShell')

afterEach(() => { cleanup(); state.attention = null; state.unread = 0; state.can = () => true })

const shell = () => render(
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<p>Home</p>} />
      </Route>
    </Routes>
  </MemoryRouter>,
)

describe('counts in the menu', () => {
  it('puts each count beside its row, and says what it counts to a screen reader', () => {
    render(
      <MemoryRouter>
        <SidebarContent counts={{ attention: { incident: 5, action: 2, permit: 3, equipment: 0, visitor: 0, report: 1 }, unread: 11 }} />
      </MemoryRouter>,
    )
    // Exact names: hidden text after the label read as "Corrective Actions , 2 overdue".
    expect(screen.getByRole('link', { name: 'Corrective Actions, 2 overdue' }).textContent).toBe('Corrective Actions2')
    expect(screen.getByRole('link', { name: 'Incidents, 5 critical and open' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Notifications, 11 unread' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Permits to Work, 3 need attention' })).toBeTruthy()
    // Nothing waiting is no badge at all, not a zero.
    expect(screen.getByRole('link', { name: 'Assets & Inspections' }).textContent).toBe('Assets & Inspections')
    expect(screen.getByRole('link', { name: 'Incident Board' }).textContent).toBe('Incident Board')
  })

  it('shows nothing before the counts have loaded', () => {
    render(<MemoryRouter><SidebarContent /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Corrective Actions' }).textContent).toBe('Corrective Actions')
  })
})

describe('the menu button on a phone', () => {
  it('carries a dot, and says how much is waiting, when the menu has a count in it', () => {
    state.attention = { incident: 5, action: 2, permit: 0, equipment: 0, visitor: 0, report: 0 }
    state.unread = 3
    shell()
    const button = screen.getByRole('button', { name: 'Open menu, 10 waiting' })
    expect(button.querySelector('span[aria-hidden]')).toBeTruthy()
  })

  it('counts only the rows this person can see', () => {
    state.attention = { incident: 0, action: 0, permit: 0, equipment: 0, visitor: 0, report: 4 }
    state.can = (c) => c !== 'reports:view'
    shell()
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button.querySelector('span[aria-hidden]')).toBeNull()
  })
})
