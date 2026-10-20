// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { CapaItem } from '@/api/capa'

/*
 * The corrective action list on a phone.
 *
 * The table needed 980px for its eight columns, so on a 390px phone it scrolled sideways:
 * titles were cut off at the card's edge, and status, owner, due date and progress sat out
 * of sight. On a phone each action is now a card with all of it in view, and the table no
 * longer insists on a width a tablet does not have. jsdom draws no layout, so these pin the
 * markup the layout depends on; the mobile audit measures the rest.
 */
vi.mock('@/api/client', () => ({ api: { updateCapa: vi.fn() } }))
vi.mock('@/features/incidents/lib', async (orig) => ({ ...(await orig<object>()), usePeople: () => [] }))

const { ActionsTable } = await import('./ActionsTable')

afterEach(cleanup)

const item = (over: Partial<CapaItem>): CapaItem => ({
  id: 'a1', code: 'CA-907', title: 'Renew hose reel annual service certificates',
  companyId: 'big', siteId: 'kch', department: 'Maintenance', incidentId: null,
  rootCause: 'Compliance schedule', owner: 'Grace Lim', priority: 'High', dueDate: '2026-10-25',
  createdAt: '2026-10-01', status: 'Open', derived: 'Assigned', overdue: false, daysToDue: 5,
  progress: 25, evidenceRequired: true, notes: [], timeline: [],
  ...over,
} as CapaItem)

const ITEMS = [
  item({}),
  item({ id: 'a2', code: 'CA-2599-1', title: 'Re-survey and reissue anchor point maps', incidentNumber: 'INC-2599', derived: 'Verified', status: 'Verified', owner: 'Ahmad Ali', priority: 'Low', progress: 100 }),
]
const show = (onOpen = vi.fn()) => {
  render(
    <ActionsTable items={ITEMS} actor={{ name: 'Marcus Tan', role: 'hse_manager' }} readOnly={false}
      sites={[{ id: 'kch', name: 'Kuching Assembly Plant', short: 'KCH' } as never]} onOpen={onOpen} onChanged={() => {}} />,
  )
  return { onOpen, cards: screen.getByRole('list', { name: 'Corrective actions' }) }
}

describe('the corrective action list on a phone', () => {
  it('puts everything the columns held on each card', () => {
    const { cards } = show()
    const first = within(cards).getByText('Renew hose reel annual service certificates').closest('li')!
    for (const shown of ['CA-907', 'Assigned', 'High', 'Grace Lim', 'Due 2026-10-25', '25%']) {
      expect(first.textContent).toContain(shown)
    }
  })

  it('opens the action from its card, but not when its box is ticked', () => {
    const { cards, onOpen } = show()
    fireEvent.click(within(cards).getByRole('button', { name: 'Renew hose reel annual service certificates' }))
    expect(onOpen).toHaveBeenCalledWith('a1')
    onOpen.mockClear()
    fireEvent.click(within(cards).getByRole('checkbox', { name: 'Select CA-907' }))
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('makes a one-line title a target of 24px or more without moving it', () => {
    const { cards } = show()
    const title = within(cards).getByRole('button', { name: 'Renew hose reel annual service certificates' })
    // 19px of text, 4px of padding above and below it, and the same taken back by the margin.
    for (const cls of ['block', 'w-full', 'py-1', '-my-1']) expect(title.className.split(' ')).toContain(cls)
  })

  it('offers no box on an action that can no longer change, and keeps its title on the same edge', () => {
    const { cards } = show()
    const verified = within(cards).getByText('Re-survey and reissue anchor point maps').closest('li')!
    expect(within(verified).queryByRole('checkbox')).toBeNull()
    // The gutter is there, empty, so this title starts where the ticked ones do.
    expect(verified.firstElementChild!.className).toMatch(/(^|\s)w-6(\s|$)/)
  })

  it('shows the table from a tablet up, without a width wider than one', () => {
    show()
    const table = screen.getByRole('table')
    expect(table.className).not.toMatch(/min-w-/)
    expect(table.parentElement!.className).toMatch(/hidden[^"]*md:block/)
    expect(screen.getByRole('list', { name: 'Corrective actions' }).className).toMatch(/md:hidden/)
  })
})
