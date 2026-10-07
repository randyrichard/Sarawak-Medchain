import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canRecordInvestigation } from './permissions'

describe('canRecordInvestigation', () => {
  it('matches the roles the server lets record an investigation', () => {
    const api = readFileSync(resolve(process.cwd(), '../api/src/lib/incidentInvestigation.ts'), 'utf8')
    const list = api.match(/const WRITE_ROLES: Role\[\] = \[([^\]]*)\]/)?.[1]
    expect(list).toBeTruthy()
    const server = [...list!.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()
    const all = ['admin', 'ceo', 'employee', 'hse_manager', 'safety_officer', 'supervisor'] as const
    expect(all.filter((r) => canRecordInvestigation(r)).sort()).toEqual(server)
  })

  it('offers nothing before the role is known', () => {
    expect(canRecordInvestigation(null)).toBe(false)
    expect(canRecordInvestigation(undefined)).toBe(false)
  })
})
