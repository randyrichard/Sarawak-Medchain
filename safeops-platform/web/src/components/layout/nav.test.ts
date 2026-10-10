import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { capabilityFor, NAV } from './nav'

describe('which page a link belongs to', () => {
  it('is the longest menu path that contains it', () => {
    expect(capabilityFor('/actions?open=ca-1')).toBe('actions:view')
    expect(capabilityFor('/incidents/inc-1')).toBe('incidents:view')
    expect(capabilityFor('/training?cert=c1&expired=1')).toBe('training:view')
    expect(capabilityFor('/assets#top')).toBe('equipment:view')
  })

  it('is nobody in particular for the pages every member has', () => {
    expect(capabilityFor('/')).toBeNull()
    expect(capabilityFor('/help')).toBeNull()
    expect(capabilityFor('/account')).toBeNull()
  })

  it('asks what the route itself asks', () => {
    /*
     * Notifications use this to decide whether to be a link, so the menu and App.tsx must
     * agree. The incident board is the one deliberate difference: the menu shows it to
     * those who can see incidents, while the route only needs a signed-in member.
     */
    const app = readFileSync(resolve(process.cwd(), 'src/app/App.tsx'), 'utf8')
    const routeCap = new Map(
      [...app.matchAll(/path="([^"]+)"\s*element=\{\s*<RequireCapability capability="([^"]+)">/g)].map((m) => [m[1], m[2]]),
    )
    expect(routeCap.size).toBeGreaterThan(10)
    for (const item of NAV) {
      if (item.to === '/' || item.to === '/notifications' || item.to === '/incidents/board') continue
      expect(routeCap.get(item.to), item.to).toBe(item.capability)
    }
  })
})
