// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/*
 * "Pre-Register" stayed grey until five fields were right, with a visitor waiting at the
 * gatehouse window and nothing to say which one was not. It now says, under the field.
 */
const create = vi.fn()
vi.mock('@/api/visitorsApi', () => ({ visitorsApi: { create: (...a: unknown[]) => create(...a) } }))
vi.mock('@/api/equipmentHolders', () => ({ listEquipmentHolders: () => Promise.resolve({ people: [], unavailable: [] }) }))
// One object, as the real context gives: the dialog seeds its dates when `sites` changes.
const org = { company: { id: 'big' }, sites: [{ id: 'kch', name: 'Kuching Assembly Plant' }], role: 'hse_manager' }
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => org, useSiteScope: () => [] }))

const { NewVisitorDialog } = await import('./NewVisitorDialog')

afterEach(() => { cleanup(); create.mockReset() })

describe('pre-registering a visit', () => {
  it('says who is missing, and goes to the name first', () => {
    render(<NewVisitorDialog open onClose={() => {}} onCreated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pre-Register' }))
    expect(create).not.toHaveBeenCalled()
    expect(screen.getByText('Enter the visitor’s full name.')).toBeTruthy()
    expect(screen.getByText(/Enter their IC or passport number/)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/Full name/))
  })

  it('will not take a departure before the arrival', () => {
    render(<NewVisitorDialog open onClose={() => {}} onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Lim Wei Jie' } })
    fireEvent.change(screen.getByLabelText(/IC or passport/), { target: { value: '900101-13-5555' } })
    fireEvent.change(screen.getByLabelText(/Expected arrival/), { target: { value: '2026-10-10T15:00' } })
    fireEvent.change(screen.getByLabelText(/Expected departure/), { target: { value: '2026-10-10T09:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pre-Register' }))
    expect(screen.getByText('Departure must be after arrival.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/Expected departure/))
    expect(create).not.toHaveBeenCalled()
  })
})
