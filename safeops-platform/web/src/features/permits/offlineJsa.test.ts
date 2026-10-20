// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '@/lib/fieldOutbox/store'
import { drain, read } from '@/lib/fieldOutbox/queue'
import { ApiError } from '@/api/types'
import { isLocalJsaId, newLocalJsaId, rememberJsaId, resolveJsaId } from './localJsaIds'
import { discardLocalJsaRow, queuePermitOp, sendPermitOp } from './offlineOps'

/**
 * A hazard found at the job and written down with no signal.
 *
 * This is the one piece of a permit that cannot be recorded by simply queueing a request.
 * Every cell edit on a JSA is addressed by the row's server id, and a row invented on a
 * phone has none — so the device names it, the server keeps that name beside the id it
 * generates, and every amendment queued under the local name has to find the real row as
 * the queue drains.
 *
 * What the tests below are protecting is the failure that mechanism exists to prevent: a
 * crew that corrects a control at the job and a server that never hears the correction,
 * because the row it belongs to was addressed by a name only the phone understood. The
 * control on the signed analysis would then be the one the crew rejected.
 *
 * jsdom, because the translation is kept in localStorage: it has to outlive the queue entry
 * that produced it (see localJsaIds).
 */

vi.mock('@/api/permitWorkflowApi', () => ({
  permitWorkflowApi: {
    addJsa: vi.fn(),
    updateJsa: vi.fn(),
  },
}))

// Imported after the mock so the dispatch in offlineOps gets the mocked module.
const { permitWorkflowApi } = await import('@/api/permitWorkflowApi')
const addJsa = vi.mocked(permitWorkflowApi.addJsa)
const updateJsa = vi.mocked(permitWorkflowApi.updateJsa)

const USER = 'user-1'
const permit = { permitId: 'p1', permitCode: 'PTW-0042' }

/** The row the server answers an accepted add with. */
const serverRow = (id: string, clientId: string) => ({
  id, permitId: 'p1', clientId, sequence: 4, step: '', hazard: 'New hazard', risk: '',
  control: 'Control to be described', responsible: '', residualRisk: '',
  createdBy: 'Officer', createdAt: '', updatedAt: '',
})

beforeEach(() => {
  localStorage.clear()
  addJsa.mockReset()
  updateJsa.mockReset()
})

describe('naming a row the server has never seen', () => {
  it('tells a name the device invented from an id the server gave out', () => {
    /*
     * The whole scheme rests on these two never being confused. An amendment addressed by
     * the wrong kind of id is either sent nowhere or sent to a different hazard, and the
     * second of those is worse than refusing to record anything.
     */
    const local = newLocalJsaId()
    expect(isLocalJsaId(local)).toBe(true)
    // A cuid, which is what the server hands out.
    expect(isLocalJsaId('clz8k2p7x0000qwer1234abcd')).toBe(false)
  })

  it('gives back the server id once the row has landed', () => {
    const local = newLocalJsaId()
    expect(resolveJsaId(local)).toBe(local)

    rememberJsaId(local, 'jsa-real-1')
    expect(resolveJsaId(local)).toBe('jsa-real-1')
    // A server id is nobody's business but its own.
    expect(resolveJsaId('jsa-real-1')).toBe('jsa-real-1')
  })

  it('keeps the translation where a later session can read it', () => {
    /*
     * The case that rules out fixing the queue up in place as the add drains. The add
     * lands, its entry is gone, and the table on screen still shows the row under the
     * local name — so the next cell the supervisor corrects is addressed by a name no
     * queue entry can translate any more.
     */
    const local = newLocalJsaId()
    rememberJsaId(local, 'jsa-real-2')
    expect(JSON.parse(localStorage.getItem('safechain.jsa-local-ids') ?? '{}'))
      .toMatchObject({ [local]: 'jsa-real-2' })
  })
})

describe('a row added offline and described there', () => {
  it('sends the row first and then its amendments, against the real id', async () => {
    /*
     * The sequence the field actually produces: add the row, then fill it in. Every one of
     * those edits is queued under the local name, because when they were made there was
     * nothing else to call the row.
     *
     * The drain is oldest-first and sequential, which is what makes this work at all: the
     * row exists on the server before the first amendment to it is sent.
     */
    const store = memoryStore()
    const clientId = newLocalJsaId()

    await queuePermitOp(USER, {
      kind: 'jsa-add', ...permit, clientId,
      step: { hazard: 'New hazard', control: 'Control to be described' },
    }, undefined, store)
    await queuePermitOp(USER, {
      kind: 'jsa-update', ...permit, stepId: clientId,
      patch: { hazard: 'Unguarded floor opening at the east manway' },
    }, undefined, store)
    await queuePermitOp(USER, {
      kind: 'jsa-update', ...permit, stepId: clientId,
      patch: { control: 'Hard barrier and toe board before any entry' },
    }, undefined, store)

    addJsa.mockResolvedValue(serverRow('jsa-real-3', clientId))
    updateJsa.mockResolvedValue(serverRow('jsa-real-3', clientId))

    const result = await drain(USER, sendPermitOp, store)

    expect(result.sent).toBe(3)
    expect(result.remaining).toBe(0)
    // The name goes with the row, which is what lets the server recognise a replay of it.
    expect(addJsa).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ clientId, hazard: 'New hazard' }),
      expect.objectContaining({ clientRef: expect.any(String) }),
    )
    // And both amendments reach the row rather than the name.
    expect(updateJsa.mock.calls.map((c) => c[0])).toEqual(['jsa-real-3', 'jsa-real-3'])
    expect(updateJsa.mock.calls[0][1]).toMatchObject({
      hazard: 'Unguarded floor opening at the east manway',
    })
  })

  it('keeps the amendments queued when the row itself cannot be sent', async () => {
    /*
     * No signal. The add fails on transport, the drain stops there rather than working
     * through the rest, and the amendments behind it are untouched — not attempted against
     * a row that does not exist, and not marked as needing a person.
     */
    const store = memoryStore()
    const clientId = newLocalJsaId()
    await queuePermitOp(USER, {
      kind: 'jsa-add', ...permit, clientId, step: { hazard: 'H', control: 'C' },
    }, undefined, store)
    await queuePermitOp(USER, {
      kind: 'jsa-update', ...permit, stepId: clientId, patch: { hazard: 'Unguarded opening' },
    }, undefined, store)

    addJsa.mockRejectedValue(new ApiError('network', 'Offline'))

    await drain(USER, sendPermitOp, store)

    expect(updateJsa).not.toHaveBeenCalled()
    const queue = await read(USER, store)
    expect(queue).toHaveLength(2)
    expect(queue.map((q) => q.blocked)).toEqual([undefined, undefined])
  })

  it('refuses an amendment to a row the server declined to create', async () => {
    /*
     * The permit was closed from the desk while the crew was out of signal, so the add is
     * refused outright. The drain skips a blocked entry and carries on, which brings it to
     * an amendment whose row will never exist.
     *
     * Sending the local name would have the server answer "JSA step not found", which
     * reads as a bug. Refusing it as a payload no retry will fix is what puts it in front
     * of a person, with the hazard still legible in the queue, rather than retrying it on a
     * timer until it goes stale.
     */
    const store = memoryStore()
    const clientId = newLocalJsaId()
    await queuePermitOp(USER, {
      kind: 'jsa-add', ...permit, clientId, step: { hazard: 'Found late', control: 'X' },
    }, undefined, store)
    await queuePermitOp(USER, {
      kind: 'jsa-update', ...permit, stepId: clientId, patch: { control: 'Hard barrier' },
    }, undefined, store)

    addJsa.mockRejectedValue(new ApiError('validation', 'This permit is closed.'))

    await drain(USER, sendPermitOp, store)

    expect(updateJsa).not.toHaveBeenCalled()
    const queue = await read(USER, store)
    expect(queue.map((q) => q.blocked)).toEqual([true, true])
    expect(queue[1].lastError).toMatch(/never accepted/i)
  })

  it('records the same translation when the add is replayed', async () => {
    // A phone draining from two tabs sends the add twice. The server answers the second
    // with the row the first created, so the translation is reinforced, never doubled.
    const store = memoryStore()
    const clientId = newLocalJsaId()
    const queued = await queuePermitOp(USER, {
      kind: 'jsa-add', ...permit, clientId, step: { hazard: 'H', control: 'C' },
    }, undefined, store)

    addJsa.mockResolvedValue(serverRow('jsa-real-4', clientId))
    await sendPermitOp(queued)
    await sendPermitOp(queued)

    expect(resolveJsaId(clientId)).toBe('jsa-real-4')
  })
})

describe('taking a field row back before it syncs', () => {
  it('withdraws the row and the amendments made to it, and nothing else', async () => {
    /*
     * The one undo the field has: a row added at the job and then thought better of, while
     * it is still only on the device. Its amendments have to go with it — left behind they
     * would be addressed by a name no add will ever resolve, and the queue would show a
     * supervisor records that failed to send when in fact they were withdrawn.
     */
    const store = memoryStore()
    const clientId = newLocalJsaId()
    await queuePermitOp(USER, {
      kind: 'jsa-add', ...permit, clientId, step: { hazard: 'Wrong permit', control: 'C' },
    }, undefined, store)
    await queuePermitOp(USER, {
      kind: 'jsa-update', ...permit, stepId: clientId, patch: { hazard: 'Still wrong' },
    }, undefined, store)
    // Another record on the same permit, which must survive.
    await queuePermitOp(USER, {
      kind: 'gas-test', ...permit, reading: { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 0 },
    }, undefined, store)
    rememberJsaId(clientId, 'jsa-real-5')

    await discardLocalJsaRow(USER, clientId, store)

    const queue = await read(USER, store)
    expect(queue.map((q) => q.kind)).toEqual(['gas-test'])
    expect(resolveJsaId(clientId)).toBe(clientId)
  })

  it('will not withdraw a row the server already has', async () => {
    /*
     * Once the add has landed the row is on an analysis somebody may have signed, and
     * removing it is a deletion with a timeline entry behind it — not an undo. Addressed by
     * a server id, this does nothing at all.
     */
    const store = memoryStore()
    await queuePermitOp(USER, {
      kind: 'jsa-update', ...permit, stepId: 'jsa-real-6', patch: { control: 'Amended' },
    }, undefined, store)

    await discardLocalJsaRow(USER, 'jsa-real-6', store)

    expect(await read(USER, store)).toHaveLength(1)
  })
})
