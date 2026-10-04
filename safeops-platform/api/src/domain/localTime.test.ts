import { afterEach, describe, expect, it } from 'vitest'
import { localParts } from './localTime.js'

describe('localTime cost', () => {
  const Real = Intl.DateTimeFormat
  afterEach(() => { Intl.DateTimeFormat = Real })

  it('builds one formatter per zone, not one per call', () => {
    // HSE Performance places every incident in its local month. Building a formatter per
    // call made 24 months of a 30-site tenant take 8 seconds instead of under half a second.
    // Counts real constructions and passes them through, so what is kept is a real formatter.
    let built = 0
    Intl.DateTimeFormat = new Proxy(Real, { construct: (t, args) => { built++; return Reflect.construct(t, args) } })
    for (let i = 0; i < 500; i++) localParts(new Date(Date.UTC(2026, 0, 1) + i * 3_600_000), 'Asia/Kuching')
    expect(built).toBeLessThanOrEqual(1)
  })

  it('gives the same answer from the kept formatter', () => {
    // Chatham is UTC+13:45 in January (daylight saving) and UTC+12:45 in July.
    expect(localParts(new Date('2026-01-10T10:15:00Z'), 'Pacific/Chatham')).toMatchObject({ day: 11, hour: 0, minute: 0 })
    expect(localParts(new Date('2026-07-10T11:15:00Z'), 'Pacific/Chatham')).toMatchObject({ day: 11, hour: 0, minute: 0 })
  })
})
