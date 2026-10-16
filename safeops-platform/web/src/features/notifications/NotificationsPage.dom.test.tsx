// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
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

/** Raised after the feed was first read: only a fresh read finds them. */
let later: AppNotification[] = []

vi.mock('@/api/client', () => ({
  api: {
    // A new list each time, as from a server: what the feed holds is never these arrays.
    listNotifications: () => Promise.resolve([...rows, ...later]),
    markNotificationRead: (...a: unknown[]) => markRead(...a),
    markAllNotificationsRead: () => Promise.resolve(),
  },
}))
let canOpenActions = true
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ company: { id: 'co1', name: 'Acme' }, allowed: (c: string) => c !== 'actions:view' || canOpenActions }),
}))

const { NotificationsPage } = await import('./NotificationsPage')
const { NotificationFeedProvider, useNotificationFeed } = await import('@/components/layout/notificationFeed')

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

/** The unread count the bell and the menu's Notifications row show. */
function MenuCount() {
  return <p data-testid="menu-count">{useNotificationFeed().unread}</p>
}

/** Inside the app's notifications feed, which the shell holds for every page. */
const withFeed = (ui: ReactNode, at = '/notifications') => render(
  <MemoryRouter initialEntries={[at]}>
    <NotificationFeedProvider>{ui}</NotificationFeedProvider>
  </MemoryRouter>,
)

afterEach(() => { cleanup(); later = [] })

describe('the notifications page', () => {
  it('opens the record a notification is about, and marks it read', async () => {
    withFeed(
      <Routes>
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Where />} />
      </Routes>,
    )
    const link = await screen.findByRole('link', { name: /Corrective action assigned: CA-419/ })
    // The reminder's stored shape has no page of its own; the link goes to the action.
    expect(link.getAttribute('href')).toBe('/actions?open=ca-419')
    fireEvent.click(link)
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/actions?open=ca-419'))
    expect(markRead).toHaveBeenCalledWith('co1', 'n1')
  })

  it('leaves a notification about nothing in particular as a button', async () => {
    withFeed(<NotificationsPage />)
    expect(await screen.findByRole('button', { name: /Backup created/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Backup created/ })).toBeNull()
  })

  it('never follows a link out of the app', async () => {
    withFeed(<NotificationsPage />)
    expect(await screen.findByRole('button', { name: /Odd link/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Odd link/ })).toBeNull()
  })

  it('does not link to a page the reader cannot open', async () => {
    // Reminders go to the whole workspace; "you don't have access" is not a destination.
    canOpenActions = false
    withFeed(<NotificationsPage />)
    expect(await screen.findByRole('button', { name: /CA-419/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /CA-419/ })).toBeNull()
    canOpenActions = true
  })

  it('says which are unread in words, not only with a dot', async () => {
    withFeed(<NotificationsPage />)
    await screen.findByRole('link', { name: /CA-419/ })
    for (const row of screen.getAllByRole('listitem')) expect(row.textContent).toContain('Unread')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})

describe('the page, the bell and the menu', () => {
  it('are one count: what is read on the page is read in the menu at once', async () => {
    // The page kept a list of its own, so after Mark All Read the menu still said 3 - and
    // the phone's menu button kept its dot - until the next poll.
    withFeed(<><MenuCount /><NotificationsPage /></>)
    await screen.findByRole('link', { name: /CA-419/ })
    expect(screen.getByTestId('menu-count').textContent).toBe('3')
    fireEvent.click(screen.getByRole('button', { name: /Backup created/ }))
    expect(screen.getByTestId('menu-count').textContent).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: /Mark All Read/ }))
    await waitFor(() => expect(screen.getByTestId('menu-count').textContent).toBe('0'))
  })

  it('reads the feed afresh on opening the page, not as the last poll left it', async () => {
    withFeed(
      <>
        <MenuCount />
        <Routes>
          <Route path="/" element={<Link to="/notifications">Notifications</Link>} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Routes>
      </>,
      '/',
    )
    await waitFor(() => expect(screen.getByTestId('menu-count').textContent).toBe('3'))
    later = [{
      id: 'n4', kind: 'incident', title: 'Incident reported: INC-77', detail: 'Slip on the stairs.',
      createdAt: new Date().toISOString(), readAt: null,
    }]
    fireEvent.click(screen.getByRole('link', { name: 'Notifications' }))
    expect(await screen.findByRole('button', { name: /INC-77/ })).toBeTruthy()
    expect(screen.getByTestId('menu-count').textContent).toBe('4')
  })
})
