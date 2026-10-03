// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axe from 'axe-core'
import type { Indicators, PerformanceView } from '@/api/performanceApi'
import type { Role } from '@/api/types'

/*
 * The HSE Performance page against a fixed server response.
 *
 * The arithmetic is the server's and is tested there (hsePerformance.integration.test.ts).
 * What is tested here is what the reader is told: that an unknown rate is not shown as a
 * perfect one, that estimated hours are admitted to, that the worst site is first, that the
 * chart has a table behind it, and that only the people who own the figure can change it.
 */

const get = vi.fn()
const manHours = vi.fn()
const setManHours = vi.fn()
vi.mock('@/api/performanceApi', () => ({
  performanceApi: {
    get: (...a: unknown[]) => get(...a),
    manHours: (...a: unknown[]) => manHours(...a),
    setManHours: (...a: unknown[]) => setManHours(...a),
  },
}))

let role: Role = 'hse_manager'
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ company: { id: 'co1', name: 'Acme' }, project: null, role }),
}))

// recharts measures its container, which jsdom cannot. The chart is checked in the browser.
vi.mock('@/components/charts/Charts', () => ({
  ChartBlock: ({ legend, children }: { legend: React.ReactNode; children: React.ReactNode }) => <div>{legend}{children}</div>,
  ChartLegend: ({ items }: { items: { label: string }[] }) => <div>{items.map((i) => <span key={i.label}>{i.label}</span>)}</div>,
  GroupedBars: () => <svg data-testid="bars" />,
}))

const { PerformancePage } = await import('./PerformancePage')

const base: Indicators = {
  lostTime: 2, recordable: 3, fatalities: 0, injuries: 3, daysLost: 10, hours: 178_500, estimatedShare: 0.33,
  workers: 150, frequencyRate: 11.2, severityRate: 56.02, incidenceRate: 13.33, trir: 3.36,
  nearMisses: 4, nearMissRatio: 1.3, actionsClosed: 3, actionsClosedOnTime: 2, onTimeClosure: 0.667,
  overdueActions: 1, toolboxMeetings: 12,
}

function view(over: Partial<Indicators> = {}): PerformanceView {
  return {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-07-01T00:00:00.000Z',
    months: [
      { month: '2026-05', lostTime: 1, recordable: 1, nearMisses: 3, hours: 30_000, estimatedShare: 0.3, frequencyRate: 33.33 },
      { month: '2026-06', lostTime: 0, recordable: 0, nearMisses: 1, hours: 30_000, estimatedShare: 0, frequencyRate: 0 },
    ],
    total: { ...base, ...over },
    sites: [
      { ...base, siteId: 'a', siteName: 'Site A', frequencyRate: 8.33, overdueActions: 0 },
      { ...base, siteId: 'b', siteName: 'Site B', frequencyRate: 17.09, fatalities: 1 },
      { ...base, siteId: 'c', siteName: 'Site C', frequencyRate: null, hours: 0 },
    ],
    basis: { frequency: 1e6, trir: 2e5, incidence: 1e3, estimatedHoursPerWorkerMonth: 195 },
  }
}

const renderPage = () => render(<MemoryRouter><PerformancePage /></MemoryRouter>)

beforeEach(() => {
  role = 'hse_manager'
  get.mockReset().mockResolvedValue(view())
  manHours.mockReset().mockResolvedValue({
    year: new Date().getUTCFullYear(),
    sites: [
      { siteId: 'a', siteName: 'Site A', headcount: 100, estimatePerMonth: 19_500, months: [{ month: `${new Date().getUTCFullYear()}-01`, hours: 20_000, updatedBy: 'u', updatedAt: '' }] },
      { siteId: 'b', siteName: 'Site B', headcount: 50, estimatePerMonth: 9_750, months: [] },
    ],
  })
  setManHours.mockReset().mockResolvedValue({})
})
afterEach(cleanup)

const tile = (label: string) => screen.getByText(label, { selector: 'p' }).closest('li')!

describe('HSE Performance page', () => {
  it('shows the industry rates with what they were calculated from', async () => {
    renderPage()
    const fr = await waitFor(() => tile('LTI frequency rate'))
    expect(fr.textContent).toContain('11.20')
    expect(fr.textContent).toContain('2 lost-time injuries · per 1M hours')
    expect(tile('TRIR').textContent).toContain('3.36')
    expect(tile('Severity rate').textContent).toContain('10 days lost')
    expect(tile('Near-miss ratio').textContent).toContain('1.3:1')
    expect(tile('Actions closed on time').textContent).toContain('67%')
    expect(get).toHaveBeenCalledWith({ companyId: 'co1', projectId: undefined, months: 12 }, expect.anything())
  })

  it('admits when the hours are estimated', async () => {
    renderPage()
    expect(await screen.findByText(/33% of hours estimated from headcount\./)).toBeTruthy()
    expect(screen.getByText(/before the figures go on a JKKP 8 return/)).toBeTruthy()
  })

  it('says nothing about estimates when every hour is recorded', async () => {
    get.mockResolvedValue(view({ estimatedShare: 0 }))
    renderPage()
    await waitFor(() => tile('Hours worked'))
    expect(tile('Hours worked').textContent).toContain('All hours recorded')
    expect(screen.queryByText(/JKKP 8 return/)).toBeNull()
  })

  it('never shows an unknown rate as zero', async () => {
    get.mockResolvedValue(view({ frequencyRate: null, hours: 0 }))
    renderPage()
    await waitFor(() => expect(tile('LTI frequency rate').textContent).toContain('—'))
    expect(tile('LTI frequency rate').textContent).not.toContain('0.00')
  })

  it('marks a fatality as the one thing on the page that needs attention now', async () => {
    get.mockResolvedValue(view({ fatalities: 1 }))
    renderPage()
    await waitFor(() => tile('Fatalities'))
    expect(within(tile('Fatalities')).getByText('Needs attention now')).toBeTruthy()
    expect(within(tile('LTI frequency rate')).queryByText(/Needs attention/)).toBeNull()
  })

  it('ranks sites worst first, with unknown rates last', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: /HSE performance by site/ })
    const names = within(table).getAllByRole('row').slice(1).map((r) => r.textContent ?? '')
    expect(names[0]).toContain('Site B')
    expect(names[1]).toContain('Site A')
    expect(names[2]).toContain('Site C')
    expect(within(table).getByText('Fatality in the period')).toBeTruthy()
  })

  it('backs the chart with a table of the same figures', async () => {
    renderPage()
    expect(await screen.findByTestId('bars')).toBeTruthy()
    const region = screen.getByRole('region', { name: 'Monthly figures' })
    const rows = within(region).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1].textContent).toContain('May 26')
    expect(rows[1].textContent).toContain('33.33')
  })

  it('asks for a different period through the URL', async () => {
    renderPage()
    await screen.findByRole('table', { name: /HSE performance by site/ })
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '24' } })
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.objectContaining({ months: 24 }), expect.anything()))
  })

  it('offers man-hours entry only to the roles that own the figure', async () => {
    for (const r of ['ceo', 'safety_officer'] as Role[]) {
      role = r
      renderPage()
      await screen.findByRole('table', { name: /HSE performance by site/ })
      expect(screen.queryByRole('button', { name: 'Record man-hours' })).toBeNull()
      cleanup()
    }
    role = 'admin'
    renderPage()
    expect(await screen.findByRole('button', { name: 'Record man-hours' })).toBeTruthy()
  })

  it('saves only the months that changed, and a cleared month as null', async () => {
    const year = new Date().getUTCFullYear()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Record man-hours' }))
    const dialog = await screen.findByRole('dialog')
    const jan = await within(dialog).findByLabelText(/^Jan /)
    expect((jan as HTMLInputElement).value).toBe('20,000')
    expect((jan as HTMLInputElement).placeholder).toBe('est. 19,500')

    fireEvent.change(jan, { target: { value: '' } })
    const save = within(dialog).getByRole('button', { name: 'Save' })
    fireEvent.click(save)
    await waitFor(() => expect(setManHours).toHaveBeenCalledTimes(1))
    expect(setManHours).toHaveBeenCalledWith({ companyId: 'co1', siteId: 'a', month: `${year}-01`, hours: null })
  })

  it('refuses a figure that is not whole hours', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Record man-hours' }))
    const dialog = await screen.findByRole('dialog')
    const jan = await within(dialog).findByLabelText(/^Jan /)
    fireEvent.change(jan, { target: { value: '12.5' } })
    expect(within(dialog).getByText(/Enter whole hours/)).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const { container } = renderPage()
    await screen.findByRole('table', { name: /HSE performance by site/ })
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })
})
