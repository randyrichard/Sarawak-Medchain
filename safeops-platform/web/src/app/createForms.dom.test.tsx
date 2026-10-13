// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/*
 * The forms that create things: a corrective action, an asset, an audit, a training session
 * and a course.
 *
 * Each sent whatever it had and left the checking to the reply. On a server that reply, for a
 * site left empty, was "String must contain at least 1 character(s)", shown at the foot of a
 * long scrolling form with nothing to say which field it meant. Two guessed instead: a course
 * with no duration went in as one hour, and one with no delivery mode as "physical".
 *
 * Now each says what every field needs, under the field, and goes to the first.
 */
// Pinned: which store is in use decides which fields an action form asks for, and a local
// .env must not decide it for the test.
const backend = { on: false }
vi.mock('@/api/authApi', async (orig) => ({
  ...(await orig<object>()),
  isBackendConfigured: () => backend.on,
}))
const api = {
  addStandaloneAction: vi.fn(),
  createAsset: vi.fn(),
  listAuditTemplates: vi.fn(async () => [{ id: 'tpl-1', name: 'General HSE', items: [] }]),
  createAudit: vi.fn(),
  createAuditTemplate: vi.fn(),
  listCourses: vi.fn(async () => [{ id: 'c1', code: 'TRN-101', name: 'Working at Height' }]),
  listEmployees: vi.fn(async () => []),
  createSession: vi.fn(),
  createCourse: vi.fn(),
}
vi.mock('@/api/client', () => ({ api }))
vi.mock('@/api/equipmentHolders', () => ({ listEquipmentHolders: () => Promise.resolve({ people: [], unavailable: [] }) }))
const org = {
  company: { id: 'big' }, role: 'hse_manager', site: null,
  sites: [{ id: 'kch', name: 'Kuching Assembly Plant', short: 'KCH' }],
}
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => org, useSiteScope: () => [] }))
vi.mock('@/features/org/departments', () => ({ useDepartments: () => ['Maintenance'] }))
const actor = { name: 'Marcus Tan', role: 'hse_manager' }
vi.mock('@/features/incidents/lib', async (orig) => ({
  ...(await orig<object>()),
  usePeople: () => ['Ahmad Ali', 'Grace Lim'],
  useActor: () => actor,
}))

const { NewActionDialog } = await import('@/features/actions/components/NewActionDialog')
const { NewAssetDialog } = await import('@/features/assets/components/NewAssetDialog')
const { PlanAuditDialog } = await import('@/features/audits/components/PlanAuditDialog')
const { NewSessionDialog } = await import('@/features/training/components/NewSessionDialog')
const { NewCourseDialog } = await import('@/features/training/components/NewCourseDialog')

afterEach(() => { cleanup(); for (const f of Object.values(api)) f.mockClear() })

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const said = () => screen.getAllByRole('alert').map((a) => a.textContent)

describe('forms that create things say what is missing, under the field', () => {
  it('a corrective action', () => {
    render(<NewActionDialog open onClose={() => {}} onCreated={() => {}} />)
    press('Create & Assign')
    expect(api.addStandaloneAction).not.toHaveBeenCalled()
    expect(said()).toEqual([
      'Say what must be done.', 'Choose the site.', 'Choose the department.', 'Choose who will do it.', 'Set the date it is due.',
    ])
    expect(document.activeElement).toBe(screen.getByLabelText(/What must be done/))
  })

  it('an asset, going to the first missing field however far down it is', () => {
    render(<NewAssetDialog open onClose={() => {}} onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Asset name/), { target: { value: 'CO₂ extinguisher, dock 2' } })
    fireEvent.change(screen.getByLabelText(/Serial number/), { target: { value: 'EX-2231' } })
    press('Register & Schedule')
    expect(api.createAsset).not.toHaveBeenCalled()
    expect(said()).toEqual(['Choose the site.', 'Choose the department.', 'Choose who owns it.'])
    expect(document.activeElement).toBe(screen.getByLabelText(/^Site/))
  })

  it('an audit, and a checklist of its own', async () => {
    render(<PlanAuditDialog open onClose={() => {}} onCreated={() => {}} />)
    await screen.findByRole('option', { name: 'General HSE' })
    press('Create Audit')
    expect(api.createAudit).not.toHaveBeenCalled()
    expect(said()).toEqual(['Give the audit a title.', 'Choose the site.', 'Choose who leads it.', 'Choose the date.'])

    press('+ Create a Custom Template')
    fireEvent.change(screen.getByLabelText(/Checklist items/), { target: { value: 'Racking undamaged\n\nSignage legible' } })
    press('Save Template')
    expect(api.createAuditTemplate).not.toHaveBeenCalled()
    expect(said()).toEqual(['Name the template.', 'List at least 3 items, one per line (2 so far).'])
  })

  it('a training session, including more people than seats', async () => {
    render(<NewSessionDialog open onClose={() => {}} onCreated={() => {}} />)
    await screen.findByRole('option', { name: /Working at Height/ })
    fireEvent.change(screen.getByLabelText(/Max seats/), { target: { value: '' } })
    press('Schedule Session')
    expect(api.createSession).not.toHaveBeenCalled()
    expect(said()).toEqual([
      'Choose the trainer.', 'Say where it is held.', 'Choose the site.', 'Choose the date.', 'Enter the number of seats.',
    ])
    // Named in full: "KCH" is only obvious to somebody who already knows.
    expect(screen.getByRole('option', { name: 'Kuching Assembly Plant' })).toBeTruthy()
  })

  it('a course, asking rather than guessing its length and how it is delivered', () => {
    render(<NewCourseDialog open onClose={() => {}} onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Course name/), { target: { value: 'Overhead Crane Operation' } })
    fireEvent.change(screen.getByLabelText(/Duration/), { target: { value: '' } })
    fireEvent.click(screen.getByLabelText('Physical'))
    press('Add Course')
    expect(api.createCourse).not.toHaveBeenCalled()
    expect(said()).toEqual(['Enter how many hours it takes.', 'Choose at least one way it is delivered.'])
    expect(document.activeElement).toBe(screen.getByLabelText(/Duration/))
  })

  it('a corrective action on a server, which asks only for what the server keeps', async () => {
    backend.on = true
    vi.resetModules()
    const { NewActionDialog: OnServer } = await import('@/features/actions/components/NewActionDialog')
    backend.on = false
    render(<OnServer open onClose={() => {}} onCreated={() => {}} />)
    for (const gone of [/Department/, /Reviewer/, /Source/]) expect(screen.queryByLabelText(gone)).toBeNull()
    press('Create & Assign')
    expect(said()).toEqual(['Say what must be done.', 'Choose the site.', 'Choose who will do it.', 'Set the date it is due.'])
  })

  it('sends a course once it is complete, with what was entered', async () => {
    api.createCourse.mockResolvedValue({})
    render(<NewCourseDialog open onClose={() => {}} onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Course name/), { target: { value: 'Overhead Crane Operation' } })
    fireEvent.change(screen.getByLabelText(/Duration/), { target: { value: '16' } })
    press('Add Course')
    await vi.waitFor(() => expect(api.createCourse).toHaveBeenCalledTimes(1))
    expect(api.createCourse.mock.calls[0][1]).toMatchObject({ durationHours: 16, deliveryModes: ['physical'] })
  })
})
