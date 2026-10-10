// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { AppNotification } from '@/api/types'

/*
 * A notification opens what it is about.
 *
 * Every row was a button that only marked itself read, so "Corrective action assigned:
 * CA-419" told the person it was assigned to about the action and gave them no way to it.
 */

const markRead = vi.fn().mockResolvedValue(undefined)
const rows: AppNotification[] = [
  {
    id: 'n1', kind: 'action', title: 'Corrective action assigned: CA-419', detail: 'Replace the cracked step.',
    createdAt: new Date().toISOString(), readAt: null, href: '/actions/ca-419?due=3',
  },
  {
    id: 'n2', kind: 'system', title: 'Backup created', detail: '12 KB snapshot.',
    createdAt: new Date().toISOString(), readAt: null,
  },
  {
    id: 'n3', kind: 'system', title: 'Odd link', detail: 'Points off-site.',
    createdAt: new Date().toISOString(), readAt: null, href: 'https://example.com/phish',
  },
]

vi.mock('@/api/client', () => ({
  api: {
    listNotifications: () => Promise.resolve(rows),
    markNotificationRead: (...a: unknown[]) => markRead(...a),
    markAllNotificationsRead: () => Promise.resolve(),
  },
}))
let canOpenActions = true
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ company: { id: 'co1', name: 'Acme' }, allowed: (c: string) => c !== 'actions:view' || canOpenActions }),
}))

const { NotificationsPage } = await import('./NotificationsPage')

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

afterEach(cleanup)

describe('the notifications page', () => {
  it('opens the record a notification is about, and marks it read', async () => {
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /Corrective action assigned: CA-419/ })
    // The reminder's stored shape has no page of its own; the link goes to the action.
    expect(link.getAttribute('href')).toBe('/actions?open=ca-419')
    fireEvent.click(link)
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/actions?open=ca-419'))
    expect(markRead).toHaveBeenCalledWith('co1', 'n1')
  })

  it('leaves a notification about nothing in particular as a button', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Backup created/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Backup created/ })).toBeNull()
  })

  it('never follows a link out of the app', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Odd link/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Odd link/ })).toBeNull()
  })

  it('does not link to a page the reader cannot open', async () => {
    // Reminders go to the whole workspace; "you don't have access" is not a destination.
    canOpenActions = false
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /CA-419/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /CA-419/ })).toBeNull()
    canOpenActions = true
  })

  it('says which are unread in words, not only with a dot', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>)
    await screen.findByRole('link', { name: /CA-419/ })
    for (const row of screen.getAllByRole('listitem')) expect(row.textContent).toContain('Unread')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
