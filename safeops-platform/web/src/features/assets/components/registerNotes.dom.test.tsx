// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

/*
 * What Register Asset says when its people list is short.
 *
 * In the online demo there are no workforce or contractor registers, and the form said so
 * as its own error: red, pinned above Register & Schedule, covering "Where It Is and Who
 * Owns It", and reading as though registering had failed. Nothing failed. Now the demo
 * gets a note under "Assign to", and a register that really could not be read is named
 * there too, beside the one field it affects, not as the form's error.
 */
const holders = { result: { people: [], unavailable: [] as string[], notHere: false } }
vi.mock('@/api/equipmentHolders', () => ({ listEquipmentHolders: () => Promise.resolve(holders.result) }))
vi.mock('@/api/client', () => ({ api: { createAsset: vi.fn() } }))
const org = { company: { id: 'big' }, role: 'hse_manager', site: null, sites: [{ id: 'kch', name: 'Kuching Assembly Plant', short: 'KCH' }] }
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => org, useSiteScope: () => [] }))
vi.mock('@/features/org/departments', () => ({ useDepartments: () => ['Maintenance'] }))
vi.mock('@/features/incidents/lib', async (orig) => ({
  ...(await orig<object>()),
  usePeople: () => ['Grace Lim'],
  useActor: () => ({ name: 'Marcus Tan', role: 'hse_manager' }),
}))

const { NewAssetDialog } = await import('./NewAssetDialog')

afterEach(cleanup)

const open = () => render(<NewAssetDialog open onClose={() => {}} onCreated={() => {}} />)

describe('Register Asset, when its people list is short', () => {
  it('says calmly that the demo has no registers, and raises no error', async () => {
    holders.result = { people: [], unavailable: [], notHere: true }
    open()
    await screen.findByText(/online demo has no workforce or contractor register/)
    expect(screen.queryByText(/could not be loaded/)).toBeNull()
    expect(screen.queryAllByRole('alert')).toEqual([])
  })

  it('names a register that failed beside Assign to, not as the form’s error', async () => {
    holders.result = { people: [], unavailable: ['The workforce register could not be loaded, so employees are not listed.'], notHere: false }
    open()
    const note = await screen.findByText(/workforce register could not be loaded/)
    // A warning, not the form's alert: nothing about registering the asset has failed.
    expect(note.closest('[role="status"]')).not.toBeNull()
    await waitFor(() => expect(screen.queryAllByRole('alert')).toEqual([]))
  })
})
