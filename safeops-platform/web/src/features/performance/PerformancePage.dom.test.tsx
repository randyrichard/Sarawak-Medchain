// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axe from 'axe-core'
import type { Indicators, PerformanceView, Target } from '@/api/performanceApi'
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
const setTarget = vi.fn()
vi.mock('@/api/performanceApi', () => ({
  performanceApi: {
    get: (...a: unknown[]) => get(...a),
    manHours: (...a: unknown[]) => manHours(...a),
    setManHours: (...a: unknown[]) => setManHours(...a),
    setTarget: (...a: unknown[]) => setTarget(...a),
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

function view(over: Partial<Indicators> = {}, targets: Target[] = []): PerformanceView {
  return {
    from: '2026-01-01',
    to: '2026-06-30',
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
    missingHours: [{ siteId: 'b', siteName: 'Site B', months: ['2026-01', '2026-02', '2026-04'] }],
    targets,
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
  setTarget.mockReset().mockResolvedValue({})
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

  it('says which sites and months still need man-hours, with a way to record them', async () => {
    renderPage()
    const note = await screen.findByText(/Not yet recorded/)
    const box = note.closest('div')!
    expect(box.textContent).toContain('Site B')
    expect(box.textContent).toContain('Jan–Feb 26, Apr 26')
    fireEvent.click(within(box).getByRole('button', { name: 'Record man-hours' }))
    expect(await screen.findByRole('dialog', { name: 'Record man-hours' })).toBeTruthy()
  })

  it('lists the gaps for people who cannot record hours, without offering to', async () => {
    role = 'ceo'
    renderPage()
    const box = (await screen.findByText(/Not yet recorded/)).closest('div')!
    expect(within(box).queryByRole('button')).toBeNull()
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

  describe('targets', () => {
    const targets: Target[] = [
      { metric: 'frequencyRate', value: 0.5, direction: 'max' },
      { metric: 'onTimeClosure', value: 0.6, direction: 'min' },
    ]

    it('marks each tile on or off its target, by icon and words', async () => {
      get.mockResolvedValue(view({}, targets))
      renderPage()
      const fr = await waitFor(() => tile('LTI frequency rate'))
      expect(fr.textContent).toContain('Target ≤ 0.50')
      expect(fr.textContent).toContain('Off target')
      expect(within(fr).getByText('Needs attention')).toBeTruthy()
      const onTime = tile('Actions closed on time')
      expect(onTime.textContent).toContain('Target ≥ 60%')
      expect(onTime.textContent).toContain('On target')
      // A target replaces the page's own rule of thumb: 67% is not a warning against a 60% goal.
      expect(within(onTime).queryByText('Needs attention')).toBeNull()
      // No target, no verdict.
      expect(tile('TRIR').textContent).not.toMatch(/Target|on target/i)
    })

    it('keeps a fatality critical whatever the target says', async () => {
      get.mockResolvedValue(view({ fatalities: 1 }, [{ metric: 'fatalities', value: 0, direction: 'max' }]))
      renderPage()
      const f = await waitFor(() => tile('Fatalities'))
      expect(within(f).getByText('Needs attention now')).toBeTruthy()
      expect(f.textContent).toContain('Off target')
    })

    it('marks sites that miss a target, and says the target in the column header', async () => {
      get.mockResolvedValue(view({}, targets))
      renderPage()
      const table = await screen.findByRole('table', { name: /HSE performance by site/ })
      expect(within(table).getByRole('columnheader', { name: /LTI freq\. rate.*target ≤ 0\.50/ })).toBeTruthy()
      // Site B (17.09) and Site A (8.33) miss 0.50; Site C has no rate and is not judged.
      expect(within(table).getAllByText('Off target (≤ 0.50)')).toHaveLength(2)
    })

    it('lets the figure owners set targets, saving a percentage as a fraction', async () => {
      get.mockResolvedValue(view({}, targets))
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Set targets' }))
      const dialog = await screen.findByRole('dialog', { name: 'Set performance targets' })
      const onTime = within(dialog).getByLabelText(/Actions closed on time/) as HTMLInputElement
      expect(onTime.value).toBe('60')
      fireEvent.change(onTime, { target: { value: '90' } })
      fireEvent.change(within(dialog).getByLabelText(/^TRIR/), { target: { value: '1.2' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save 2 targets' }))
      await waitFor(() => expect(setTarget).toHaveBeenCalledTimes(2))
      expect(setTarget).toHaveBeenCalledWith({ companyId: 'co1', metric: 'onTimeClosure', value: 0.9 })
      expect(setTarget).toHaveBeenCalledWith({ companyId: 'co1', metric: 'trir', value: 1.2 })
    })

    it('does not offer target setting to people who only read the figures', async () => {
      role = 'ceo'
      renderPage()
      await screen.findByRole('table', { name: /HSE performance by site/ })
      expect(screen.queryByRole('button', { name: 'Set targets' })).toBeNull()
    })
  })

  describe('export', () => {
    it('downloads the sites sheet as a CSV named for its period', async () => {
      const blobs: Blob[] = []
      const createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x' })
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('hse-performance-sites_2026-01_to_2026-06.csv')
      })
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Export' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: /Sites and totals/ }))
      expect(click).toHaveBeenCalledTimes(1)
      const text = await new Promise<string>((resolve) => {
        const r = new FileReader() // jsdom's Blob has no .text()
        r.onload = () => resolve(String(r.result))
        r.readAsText(blobs[0])
      })
      expect(text).toContain('All sites')
      expect(text).toContain('Site B')
      click.mockRestore()
    })

    it('prints the page as a board pack', async () => {
      const print = vi.spyOn(window, 'print').mockImplementation(() => {})
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Export' }))
      fireEvent.click(await screen.findByRole('menuitem', { name: /Print or save as PDF/ }))
      expect(print).toHaveBeenCalled()
      print.mockRestore()
    })

    it('opens the monthly table for printing and closes it again afterwards', async () => {
      renderPage()
      const region = await screen.findByRole('region', { name: 'Monthly figures' })
      const details = region.closest('details')!
      expect(details.open).toBe(false)
      window.dispatchEvent(new Event('beforeprint'))
      expect(details.open).toBe(true)
      window.dispatchEvent(new Event('afterprint'))
      expect(details.open).toBe(false)
    })
  })
})
