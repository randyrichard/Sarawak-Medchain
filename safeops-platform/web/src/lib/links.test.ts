import { describe, it, expect } from 'vitest'
import { assetStatusFromParam, linkTo, notificationTarget, openParam } from './links'

describe('following a notification', () => {
  it('goes to the record it names', () => {
    expect(notificationTarget('/permits?permit=p1&awaiting=submitted')).toBe('/permits?permit=p1&awaiting=submitted')
    expect(notificationTarget('/incidents/inc-1')).toBe('/incidents/inc-1')
  })

  it('sends the stored action reminders to the action', () => {
    // The scheduler keeps this shape - it is how one reminder is told from the next - and
    // no page answers it.
    expect(notificationTarget('/actions/ca-1?due=3')).toBe('/actions?open=ca-1')
    expect(notificationTarget('/actions/ca-1?escalated=7')).toBe('/actions?open=ca-1')
    expect(notificationTarget('/actions/ca%201')).toBe('/actions?open=ca+1')
  })

  it('stays put when there is nowhere to go', () => {
    expect(notificationTarget(undefined)).toBeNull()
    expect(notificationTarget(null)).toBeNull()
    expect(notificationTarget('')).toBeNull()
  })

  it('never leaves the app', () => {
    // A stored link is data. It must not turn the bell into a way off-site.
    for (const href of ['https://example.com', '//example.com/x', '/\\example.com', 'javascript:alert(1)', 'actions?open=1']) {
      expect(notificationTarget(href), href).toBeNull()
    }
  })
})

describe('the record a page is asked to open', () => {
  it('prefers `open`, then each older name in turn', () => {
    expect(openParam(new URLSearchParams('open=a&qr=b'), 'qr')).toBe('a')
    expect(openParam(new URLSearchParams('qr=b'), 'qr', 'asset')).toBe('b')
    expect(openParam(new URLSearchParams('asset=c&overdue=1'), 'qr', 'asset')).toBe('c')
    expect(openParam(new URLSearchParams('view=board'), 'qr', 'asset')).toBeNull()
  })
})

describe('links into a page', () => {
  it('say what the page reads', () => {
    expect(linkTo.actions('overdue')).toBe('/actions?bucket=overdue')
    expect(linkTo.actions('all')).toBe('/actions')
    expect(linkTo.action('ca-1')).toBe('/actions?open=ca-1')
    expect(linkTo.permits('awaiting')).toBe('/permits?status=awaiting')
    expect(linkTo.permit('p 1')).toBe('/permits?open=p+1')
    expect(linkTo.incidents('investigating')).toBe('/incidents?status=investigating')
    expect(linkTo.assets({ status: 'Out of Service' })).toBe('/assets?status=out_of_service')
    expect(linkTo.assets({ bucket: 'all' })).toBe('/assets')
    expect(linkTo.equipmentBoard()).toBe('/assets?view=board')
    // The register is the visitor view with a status filter; the board has none.
    expect(linkTo.visitors('today')).toBe('/visitors?view=register&status=today')
    expect(linkTo.visitors('all')).toBe('/visitors')
  })

  it('read asset statuses back the way they were written', () => {
    expect(assetStatusFromParam('in_service')).toBe('In Service')
    expect(assetStatusFromParam('under_maintenance')).toBe('Under Maintenance')
    expect(assetStatusFromParam('In Service')).toBe('')
    expect(assetStatusFromParam(null)).toBe('')
  })
})
