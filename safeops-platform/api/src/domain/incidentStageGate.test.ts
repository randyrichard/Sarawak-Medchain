import { describe, expect, it } from 'vitest'
import { stageGateProblem, type StageGateFacts } from './incidentStageGate.js'

const empty: StageGateFacts = { investigator: null, findings: null, note: null, causes: [], rootStatement: null, actions: [] }
const ready = (to: string, f: Partial<StageGateFacts>) => stageGateProblem(to, { ...empty, ...f })

describe('incident stage gates', () => {
  it('will not close an investigation that has nothing in it', () => {
    // The lifecycle used to run Reported → Closed with every one of these empty.
    expect(ready('investigation', {})).toMatch(/investigator/)
    expect(ready('rca', { findings: 'too short' })).toMatch(/20 characters/)
    expect(ready('actions', {})).toMatch(/contributing cause/)
    expect(ready('actions', { causes: [{}] })).toMatch(/root cause statement/)
    expect(ready('review', {})).toMatch(/at least one corrective action/)
    expect(ready('verification', {})).toMatch(/review note/)
    expect(ready('closed', { note: 'done' })).toBeNull() // no actions at all is caught at review
  })

  it('needs every action finished before review, and verified before closing', () => {
    expect(ready('review', { actions: [{ status: 'completed' }, { status: 'in_progress' }] })).toMatch(/1 corrective action/)
    expect(ready('review', { actions: [{ status: 'completed' }, { status: 'cancelled' }] })).toBeNull()
    expect(ready('review', { actions: [{ status: 'cancelled' }] })).toMatch(/at least one/)
    expect(ready('closed', { note: 'x', actions: [{ status: 'completed' }] })).toMatch(/still need verifying/)
    expect(ready('closed', { note: 'x', actions: [{ status: 'verified' }, { status: 'cancelled' }] })).toBeNull()
    expect(ready('closed', { actions: [{ status: 'verified' }] })).toMatch(/closing note/)
  })

  it('lets a properly filled investigation through each step', () => {
    expect(ready('assessment', {})).toBeNull()
    expect(ready('investigation', { investigator: 'Marcus Tan' })).toBeNull()
    expect(ready('rca', { findings: 'Coupling split under pressure; not on the inspection list.' })).toBeNull()
    expect(ready('actions', { causes: [{}], rootStatement: 'Hose couplings were never inspected.' })).toBeNull()
    expect(ready('verification', { note: 'Agreed.' })).toBeNull()
  })
})
