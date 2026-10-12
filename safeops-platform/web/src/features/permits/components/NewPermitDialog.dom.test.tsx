// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/*
 * "Create Draft" stayed grey until the work description and the location were filled in,
 * and nothing said so: the location is half a screen down a long form. It can now always be
 * pressed, and pressing it says which field is missing and goes to it.
 */
const createPermit = vi.fn()
vi.mock('@/api/client', () => ({ api: { createPermit: (...a: unknown[]) => createPermit(...a) } }))
vi.mock('@/features/org/OrgContext', () => ({
  useOrg: () => ({ company: { id: 'big' }, site: null, sites: [{ id: 'kch', name: 'Kuching Assembly Plant' }], role: 'hse_manager' }),
  useSiteScope: () => [],
}))
vi.mock('@/features/org/departments', () => ({ useDepartments: () => ['Maintenance'] }))
vi.mock('@/features/org/registers', () => ({ useContractorCompanies: () => [] }))
vi.mock('@/features/incidents/lib', async (orig) => ({ ...(await orig<object>()), usePeople: () => ['Aziz Rahman'] }))

const { NewPermitDialog } = await import('./NewPermitDialog')

afterEach(() => { cleanup(); createPermit.mockReset() })

const actor = { name: 'Aziz Rahman', role: 'hse_manager' } as const
const open = () => render(<NewPermitDialog open actor={actor} onClose={() => {}} onCreated={() => {}} />)

describe('requesting a permit', () => {
  it('can be sent at any time, and says what is missing instead of greying out', () => {
    open()
    const create = screen.getByRole('button', { name: 'Create Draft' }) as HTMLButtonElement
    expect(create.disabled).toBe(false)

    fireEvent.click(create)
    expect(createPermit).not.toHaveBeenCalled()
    expect(screen.getByText('Describe the work, in a line.')).toBeTruthy()
    expect(screen.getByText('Say exactly where the work will be done.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/Work description/))
  })

  it('goes to the location when that is all that is missing', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Work description/), { target: { value: 'Weld repair on jetty pipe support' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Draft' }))
    expect(screen.queryByText('Describe the work, in a line.')).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText(/Exact location/))
  })

  it('says an end before the start is wrong, under the end', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Work description/), { target: { value: 'Weld repair' } })
    fireEvent.change(screen.getByLabelText(/Exact location/), { target: { value: 'Jetty 2' } })
    fireEvent.change(screen.getByLabelText(/Valid from/), { target: { value: '2026-10-10T10:00' } })
    fireEvent.change(screen.getByLabelText(/Valid to/), { target: { value: '2026-10-10T09:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Draft' }))
    expect(screen.getByText('The end must be after the start.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/Valid to/))
    expect(createPermit).not.toHaveBeenCalled()
  })

  it('sends once everything is there', async () => {
    createPermit.mockResolvedValue({ id: 'p-1' })
    open()
    fireEvent.change(screen.getByLabelText(/Work description/), { target: { value: 'Weld repair' } })
    fireEvent.change(screen.getByLabelText(/Exact location/), { target: { value: 'Jetty 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Draft' }))
    await vi.waitFor(() => expect(createPermit).toHaveBeenCalledTimes(1))
    expect(createPermit.mock.calls[0][0]).toMatchObject({ title: 'Weld repair', location: 'Jetty 2', siteId: 'kch' })
  })
})
