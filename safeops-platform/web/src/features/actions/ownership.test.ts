import { describe, it, expect } from 'vitest'
import { canEditItem, ownsItem } from './lib'
import type { CapaItem } from '@/api/capa'

/**
 * The edit affordance follows the server's ownership rule (api/src/lib/actionOwner.ts):
 * the owner's account when the action is linked to one, the name only when it is not.
 */
const item = (over: Partial<CapaItem>): CapaItem =>
  ({ owner: 'Muhammad Hafiz', ownerId: null, siteId: 'kch', derived: 'Assigned', ...over }) as CapaItem

describe('action ownership in the UI', () => {
  it('follows the account for a linked action, whatever the names say', () => {
    const linked = item({ ownerId: 'u-1' })
    expect(ownsItem({ name: 'Muhammad Hafiz', userId: 'u-1', role: 'employee' }, linked)).toBe(true)
    // Same name, different person.
    expect(ownsItem({ name: 'Muhammad Hafiz', userId: 'u-2', role: 'employee' }, linked)).toBe(false)
    // Renamed since the action was raised.
    expect(ownsItem({ name: 'Muhammad Hafiz bin Omar', userId: 'u-1', role: 'employee' }, linked)).toBe(true)
  })

  it('falls back to the name for an unlinked action', () => {
    expect(ownsItem({ name: 'Muhammad Hafiz', userId: 'u-9', role: 'employee' }, item({}))).toBe(true)
    expect(ownsItem({ name: 'Grace Lim', userId: 'u-9', role: 'employee' }, item({}))).toBe(false)
  })

  it('offers an employee the edit controls only on what they own', () => {
    const linked = item({ ownerId: 'u-1' })
    expect(canEditItem({ name: 'Muhammad Hafiz', userId: 'u-1', role: 'employee' }, linked)).toBe(true)
    expect(canEditItem({ name: 'Muhammad Hafiz', userId: 'u-2', role: 'employee' }, linked)).toBe(false)
  })
})
