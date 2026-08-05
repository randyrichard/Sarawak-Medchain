import { describe, expect, it } from 'vitest'
import {
  canManageContractors, canWorkGate, EXPIRY_KIND, gateBlockReason, relativeDays, fmtDate,
} from './lib'
import { contractorFormProblem, emptyContractorForm, toContractorPayload } from './components/ContractorForm'

describe('contractor permissions', () => {
  it('lets only admins and HSE managers change the register', () => {
    expect(canManageContractors('admin')).toBe(true)
    expect(canManageContractors('hse_manager')).toBe(true)
    expect(canManageContractors('safety_officer')).toBe(false)
    expect(canManageContractors('supervisor')).toBe(false)
    expect(canManageContractors(null)).toBe(false)
  })

  it('lets supervisors and officers work the gate but not employees', () => {
    // A gate only an admin can open is a gate nobody uses, which leaves the
    // evacuation list wrong.
    expect(canWorkGate('supervisor')).toBe(true)
    expect(canWorkGate('safety_officer')).toBe(true)
    expect(canWorkGate('hse_manager')).toBe(true)
    expect(canWorkGate('employee')).toBe(false)
    expect(canWorkGate(null)).toBe(false)
  })
})

describe('gate verdict', () => {
  const cleared = {
    active: true, contractorSuspended: false,
    medicalStatus: 'valid' as const, inductionStatus: 'valid' as const,
  }

  it('admits a compliant worker', () => {
    expect(gateBlockReason(cleared)).toBeNull()
    expect(gateBlockReason({ ...cleared, medicalStatus: 'expiring' })).toBeNull()
  })

  it('names the reason for every refusal', () => {
    expect(gateBlockReason({ ...cleared, active: false })).toBe('Deregistered')
    expect(gateBlockReason({ ...cleared, contractorSuspended: true })).toBe('Contractor suspended')
    expect(gateBlockReason({ ...cleared, medicalStatus: 'expired' })).toBe('Medical expired')
    expect(gateBlockReason({ ...cleared, medicalStatus: 'missing' })).toBe('No medical on file')
    expect(gateBlockReason({ ...cleared, inductionStatus: 'expired' })).toBe('Induction expired')
    expect(gateBlockReason({ ...cleared, inductionStatus: 'missing' })).toBe('No induction on file')
  })

  it('reports the most fundamental reason first', () => {
    // A deregistered worker of a suspended contractor with no medical is refused as
    // deregistered — telling the gate operator to chase a medical would waste their time.
    expect(gateBlockReason({
      active: false, contractorSuspended: true,
      medicalStatus: 'missing', inductionStatus: 'missing',
    })).toBe('Deregistered')
  })
})

describe('expiry presentation', () => {
  it('treats a missing contractor date as a problem, not a gap', () => {
    // Unlike an employee's, a missing contractor date bars entry exactly as an expired
    // one does, so it must not read as merely absent.
    expect(EXPIRY_KIND.missing).toBe('critical')
    expect(EXPIRY_KIND.expired).toBe('critical')
    expect(EXPIRY_KIND.expiring).toBe('warning')
    expect(EXPIRY_KIND.valid).toBe('good')
  })

  it('phrases day counts the way a gate operator reads them', () => {
    expect(relativeDays(0)).toBe('today')
    expect(relativeDays(21)).toBe('in 21d')
    expect(relativeDays(-4)).toBe('4d ago')
    expect(relativeDays(null)).toBe('—')
  })

  it('renders dates as plain ISO days', () => {
    expect(fmtDate('2026-08-05T09:15:00.000Z')).toBe('2026-08-05')
    expect(fmtDate(null)).toBe('—')
  })
})

describe('contractor form', () => {
  const valid = { ...emptyContractorForm(), name: 'Sarawak Scaffolding Sdn Bhd' }

  it('requires a name', () => {
    expect(contractorFormProblem(valid)).toBeNull()
    expect(contractorFormProblem({ ...valid, name: '  ' })).toMatch(/name/i)
  })

  it('rejects an email that cannot be one', () => {
    expect(contractorFormProblem({ ...valid, email: 'nope' })).toMatch(/email/i)
    expect(contractorFormProblem({ ...valid, email: 'ops@scaffold.test' })).toBeNull()
    expect(contractorFormProblem({ ...valid, email: '' })).toBeNull()
  })

  it('sends absent rather than empty for untouched fields', () => {
    const payload = toContractorPayload({ ...valid, phone: '  ', contactPerson: '  Lim  ' })
    expect(payload.name).toBe('Sarawak Scaffolding Sdn Bhd')
    expect(payload.contactPerson).toBe('Lim')
    expect(payload.phone).toBeUndefined()
    expect(payload.insuranceExpiry).toBeUndefined()
  })
})
