import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { inFlightQueue } from './inFlightQueue.js'

/** A response that can be finished or abandoned, and records a refusal. */
function fakeRes() {
  const res = Object.assign(new EventEmitter(), {
    refused: 0,
    status() { return res },
    json() { res.refused++; return res },
  })
  return res
}

function harness(perKey: number, maxWaiting: number) {
  const mw = inFlightQueue({ perKey, maxWaiting, message: {} })
  const started: number[] = []
  const send = (n: number, ip = '10.0.0.1') => {
    const res = fakeRes()
    mw({ ip } as never, res as never, () => { started.push(n) })
    return res
  }
  return { send, started }
}

describe('inFlightQueue', () => {
  it('runs at most perKey at once and the rest in arrival order', () => {
    const { send, started } = harness(2, 10)
    const r = [1, 2, 3, 4].map((n) => send(n))
    expect(started).toEqual([1, 2])
    r[0].emit('finish'); r[0].emit('close') // both fire on a normal response; counted once
    expect(started).toEqual([1, 2, 3])
    r[1].emit('close') // a client that disconnects mid-request frees its place too
    expect(started).toEqual([1, 2, 3, 4])
  })

  it('keeps addresses separate', () => {
    const { send, started } = harness(1, 10)
    send(1, 'a'); send(2, 'b'); send(3, 'a')
    expect(started).toEqual([1, 2])
  })

  it('refuses beyond maxWaiting rather than holding unlimited requests', () => {
    const { send, started } = harness(1, 2)
    const r = [1, 2, 3, 4].map((n) => send(n))
    expect(started).toEqual([1])
    expect(r.map((x) => x.refused)).toEqual([0, 0, 0, 1])
  })

  it('drops a waiting client that gives up, without losing a place', () => {
    const { send, started } = harness(1, 10)
    const r = [1, 2, 3].map((n) => send(n))
    r[1].emit('close') // left the queue before its turn
    r[0].emit('finish')
    expect(started).toEqual([1, 3])
    r[2].emit('finish')
    expect(send(4) && started).toEqual([1, 3, 4]) // the lane is free again
  })
})
