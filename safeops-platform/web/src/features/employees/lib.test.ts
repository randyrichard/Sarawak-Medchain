import { describe, expect, it } from 'vitest'
import { canManageEmployees, MEDICAL_KIND, relativeDays, fmtDate } from './lib'
import {
  employeeFormProblem, emptyEmployeeForm, toEmployeePayload,
} from './components/EmployeeForm'

describe('employee permissions', () => {
  it('lets only admins and HSE managers manage the register', () => {
    expect(canManageEmployees('admin')).toBe(true)
    expect(canManageEmployees('hse_manager')).toBe(true)
    // Mirrors WRITE_ROLES on the server; the server refuses these regardless.
    expect(canManageEmployees('safety_officer')).toBe(false)
    expect(canManageEmployees('supervisor')).toBe(false)
    expect(canManageEmployees('employee')).toBe(false)
    expect(canManageEmployees(null)).toBe(false)
  })
})

describe('medical presentation', () => {
  it('maps each status to a tone, with a missing medical shown as a gap not an alarm', () => {
    expect(MEDICAL_KIND.valid).toBe('good')
    expect(MEDICAL_KIND.expiring).toBe('warning')
    expect(MEDICAL_KIND.expired).toBe('critical')
    expect(MEDICAL_KIND.missing).toBe('info')
  })

  it('phrases day counts the way a supervisor reads them', () => {
    expect(relativeDays(0)).toBe('today')
    expect(relativeDays(34)).toBe('in 34d')
    expect(relativeDays(-12)).toBe('12d ago')
    expect(relativeDays(null)).toBe('—')
  })

  it('renders dates as plain ISO days', () => {
    expect(fmtDate('2026-08-04T09:15:00.000Z')).toBe('2026-08-04')
    expect(fmtDate(null)).toBe('—')
  })
})

describe('employee form', () => {
  const valid = { ...emptyEmployeeForm('site-a'), name: 'Grace Lim' }

  it('requires a name and a site', () => {
    expect(employeeFormProblem(valid)).toBeNull()
    expect(employeeFormProblem({ ...valid, name: '   ' })).toMatch(/name/i)
    expect(employeeFormProblem({ ...valid, siteId: '' })).toMatch(/site/i)
  })

  it('rejects an email that cannot be one', () => {
    expect(employeeFormProblem({ ...valid, email: 'not-an-email' })).toMatch(/email/i)
    expect(employeeFormProblem({ ...valid, email: 'grace@site.test' })).toBeNull()
    // Blank is fine — an email is optional, it just has to be real when given.
    expect(employeeFormProblem({ ...valid, email: '' })).toBeNull()
  })

  it('sends absent rather than empty for untouched fields', () => {
    const payload = toEmployeePayload({ ...valid, position: '  Fitter  ', phone: '   ' })
    expect(payload.name).toBe('Grace Lim')
    expect(payload.position).toBe('Fitter')
    expect(payload.phone).toBeUndefined()
    expect(payload.medicalExpiry).toBeUndefined()
  })
})
