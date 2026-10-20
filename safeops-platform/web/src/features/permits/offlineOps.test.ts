import { describe, it, expect } from 'vitest'
import { memoryStore } from '@/lib/fieldOutbox/store'
import { read } from '@/lib/fieldOutbox/queue'
import { ONLINE_ONLY, isOfflineSafe, labelFor, queuePermitOp, refusalFor, type PermitOp } from './offlineOps'

/**
 * The line between what a permit allows to be recorded with no signal and what it does not.
 *
 * This is the safety rule of the whole offline feature, so it is tested as a rule rather
 * than left to whichever component happens to call the queue. A future screen that queues
 * an approval would be a hole in the permit system, and it should fail here first.
 */
describe('what may be recorded offline', () => {
  it('refuses everything that grants authority', () => {
    /*
     * An approval given on a device with no signal cannot see that the area authority
     * suspended the permit twenty minutes ago, or that a simultaneous operation was raised
     * on the same equipment. The crew would enter on an authority the plant has withdrawn.
     */
    for (const kind of ['submit', 'approve', 'reject', 'activate', 'resume',
      'review-advance', 'review-return', 'extension-request', 'extension-approve']) {
      expect(isOfflineSafe(kind), `${kind} must not be queueable`).toBe(false)
      expect(refusalFor(kind)).not.toBe('')
    }
  })

  it('allows everything that records what already happened', () => {
    for (const kind of ['gas-test', 'control-confirm', 'toolbox', 'toolbox-ack', 'ppe-ack',
      'jsa-add', 'jsa-update', 'person-entry', 'isolation-add', 'isolation-release',
      'close', 'attachment']) {
      expect(isOfflineSafe(kind), `${kind} must be queueable`).toBe(true)
    }
  })

  it('allows work to be stopped offline', () => {
    /*
     * The one transition that is allowed, and deliberately. Suspension is restrictive:
     * accepting it late can only ever close work down, never open it up. A supervisor who
     * sees something wrong must never be told to go and find signal first.
     */
    expect(isOfflineSafe('suspend')).toBe(true)
    expect(refusalFor('suspend')).toBe('')
  })

  it('explains a refusal without implying anything was kept', () => {
    /*
     * The worst possible outcome of this feature would be somebody believing a permit was
     * approved because a message read like a receipt. Each refusal has to say plainly that
     * nothing was sent or that the permit is unchanged.
     */
    for (const [kind, message] of Object.entries(ONLINE_ONLY)) {
      expect(message, `${kind} is too short to explain itself`).toMatch(/.{40,}/)
      expect(message, `${kind} must not sound like a receipt`).not.toMatch(/\b(saved|queued|will sync|kept)\b/i)
    }
  })
})

describe('labels', () => {
  const base = { permitId: 'p1', permitCode: 'PTW-0042' }

  it('names the permit and what was done', () => {
    // Somebody looking at four pending records at the end of a shift has to recognise
    // their own work in them, which an endpoint name does not achieve.
    expect(labelFor({ ...base, kind: 'gas-test', reading: { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 0 } }))
      .toBe('PTW-0042: gas test')
    expect(labelFor({ ...base, kind: 'person-entry', attendeeId: 'a1', person: 'Azlan', inside: true }))
      .toBe('PTW-0042: Azlan entered the work area')
    expect(labelFor({ ...base, kind: 'person-entry', attendeeId: 'a1', person: 'Azlan', inside: false }))
      .toBe('PTW-0042: Azlan left the work area')
  })

  it('shouts about a suspension', () => {
    // A stop-work order waiting to sync is not the same as a queued acknowledgement, and
    // the list is read at a glance.
    expect(labelFor({ ...base, kind: 'suspend', reason: 'Scaffold tag missing' }))
      .toBe('PTW-0042: WORK SUSPENDED — Scaffold tag missing')
  })
})

describe('queuePermitOp', () => {
  it('stamps the time the field did it, not the time it syncs', async () => {
    /*
     * The reason this is stamped on the device at all. A gas test taken at 09:15 that
     * reaches the server at 14:00 is a 09:15 test; filed at 14:00 it becomes a re-test that
     * never happened and the hours the space went unmonitored disappear.
     */
    const store = memoryStore()
    const before = Date.now()
    await queuePermitOp('user-1', {
      permitId: 'p1', permitCode: 'PTW-0042', kind: 'gas-test',
      reading: { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 0 },
    }, undefined, store)

    const [held] = await read('user-1', store)
    const recordedAt = new Date((held.payload as { recordedAt: string }).recordedAt).getTime()
    expect(recordedAt).toBeGreaterThanOrEqual(before)
    expect(recordedAt).toBeLessThanOrEqual(Date.now())
  })

  it('carries the label and the payload the sender will need', async () => {
    const store = memoryStore()
    const op: PermitOp = {
      permitId: 'p1', permitCode: 'PTW-0042', kind: 'suspend', reason: 'Gas detector failed bump test',
    }
    await queuePermitOp('user-1', op, undefined, store)

    const [held] = await read('user-1', store)
    expect(held.kind).toBe('suspend')
    expect(held.label).toContain('WORK SUSPENDED')
    expect((held.payload as { reason: string }).reason).toBe('Gas detector failed bump test')
  })
})
