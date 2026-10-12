// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The bin beside an attendance line. The dialog opens with one line, the company's own name
 * in it, and the bin was disabled on an only line - so the first bin anybody pressed did
 * nothing, and was reported as broken.
 */
const create = vi.fn()
vi.mock('@/api/toolboxApi', () => ({
  toolboxApi: {
    organisations: () => Promise.resolve(['Kenyalang Scaffolding']),
    create: (...a: unknown[]) => create(...a),
    update: vi.fn(),
  },
}))
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({
    company: { id: 'ys', name: 'YS SDN BHD' }, site: { id: 'lmg', name: 'LMG PLANT' },
    sites: [{ id: 'lmg', name: 'LMG PLANT' }], role: 'hse_manager',
  }),
}))
vi.mock('@/features/incidents/lib', async (orig) => ({ ...(await orig<object>()), usePeople: () => ['Aziz Rahman'] }))

const { ToolboxDialog } = await import('./ToolboxDialog')

afterEach(() => { cleanup(); create.mockReset() })

function open() {
  render(<MemoryRouter><ToolboxDialog companyId="ys" meeting={null} onClose={() => {}} onSaved={() => {}} /></MemoryRouter>)
}
const organisations = () => screen.getAllByRole('combobox', { name: /^Organisation \d/ }).map((i) => (i as HTMLInputElement).value)
const headcount = (org: string) => screen.getByRole('spinbutton', { name: `Headcount for ${org}` }) as HTMLInputElement
/** A click from a pointer; one from the keyboard (Enter or Space on the button) has detail 0. */
const tap = (el: HTMLElement) => fireEvent.click(el, { detail: 1 })

function addLine(org: string, count: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add Organisation' }))
  const fields = screen.getAllByRole('combobox', { name: /^Organisation \d/ })
  fireEvent.change(fields[fields.length - 1], { target: { value: org } })
  fireEvent.change(headcount(org), { target: { value: count } })
}

describe('the bin beside an attendance line', () => {
  it('empties the only line instead of doing nothing, ready for another organisation', () => {
    open()
    fireEvent.change(headcount('YS SDN BHD'), { target: { value: '25' } })
    const bin = screen.getByRole('button', { name: 'Clear YS SDN BHD' })
    expect(bin).not.toHaveProperty('disabled', true)

    tap(bin)
    expect(organisations()).toEqual([''])
    expect(headcount('organisation 1').value).toBe('')
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Organisation 1' }))
    expect(screen.getByText(/Total present/).textContent).toMatch(/0$/)
  })

  it('offers no bin on an only line that is already empty', () => {
    open()
    tap(screen.getByRole('button', { name: 'Clear YS SDN BHD' }))
    // Hidden, not removed, so the fields keep their width.
    expect(screen.getByRole('button', { name: 'Clear this line' }).className).toMatch(/\binvisible\b/)
  })

  it('removes a line when there are others, and keeps the rest as they were', () => {
    open()
    fireEvent.change(headcount('YS SDN BHD'), { target: { value: '30' } })
    addLine('Kenyalang Scaffolding', '12')
    addLine('Borneo Lifting', '4')

    tap(screen.getByRole('button', { name: 'Remove YS SDN BHD' }))
    expect(organisations()).toEqual(['Kenyalang Scaffolding', 'Borneo Lifting'])
    expect(headcount('Kenyalang Scaffolding').value).toBe('12')
    expect(headcount('Borneo Lifting').value).toBe('4')
    expect(screen.getByText(/Total present/).textContent).toMatch(/16$/)
    // A tap does not open the phone's keyboard by putting focus in a field.
    expect(document.activeElement?.tagName).not.toBe('INPUT')
  })

  it('takes a keyboard user to the line that moved up, not back to the top of the page', () => {
    open()
    addLine('Kenyalang Scaffolding', '12')
    fireEvent.click(screen.getByRole('button', { name: 'Remove YS SDN BHD' }), { detail: 0 })
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Organisation 1' }))
    expect((document.activeElement as HTMLInputElement).value).toBe('Kenyalang Scaffolding')
  })

  it('saves the lines that are left, and nothing of how they were kept apart', async () => {
    open()
    addLine('Kenyalang Scaffolding', '12')
    tap(screen.getByRole('button', { name: 'Remove YS SDN BHD' }))
    create.mockResolvedValue({ id: 'tbm-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Record Meeting' }))
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0][1].groups).toEqual([{ organisation: 'Kenyalang Scaffolding', count: 12 }])
  })
})
