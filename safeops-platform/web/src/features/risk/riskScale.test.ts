import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { LIKELIHOOD, RISK_ACTION, RISK_LEVEL_LABEL, riskLevel, SEVERITY } from '@/api/riskApi'

/**
 * The scales on screen are the server's.
 *
 * The pickers and the matrix label likelihood and severity from a copy in riskApi.ts, and
 * band a score as the dialog previews it. The server's copy (api/src/domain/hirarc.ts) is the
 * one that decides; a word changed there and not here would show a person one description
 * while the register stored another, and a band moved on one side only would preview "Medium"
 * for a row the register then files as High.
 *
 * Skipped, with a reason, when the API package is not beside this one - a web-only checkout
 * is a legitimate state (see serverAgreement.test.ts).
 */
const SERVER = resolve(process.cwd(), '../api/src/domain/hirarc.ts')
const d = existsSync(SERVER) ? describe : describe.skip

d('the HIRARC scales agree with the server', () => {
  it('names and describes every rating the same way', async () => {
    const server = await import(/* @vite-ignore */ SERVER)
    expect(LIKELIHOOD).toEqual(server.LIKELIHOOD)
    expect(SEVERITY).toEqual(server.SEVERITY)
    expect(RISK_ACTION).toEqual(server.RISK_ACTION)
    expect(RISK_LEVEL_LABEL).toEqual(server.RISK_LEVEL_LABEL)
  })

  it('bands every cell of the matrix the same way', async () => {
    const server = await import(/* @vite-ignore */ SERVER)
    for (let l = 1; l <= 5; l++) for (let s = 1; s <= 5; s++) expect(riskLevel(l * s)).toBe(server.riskLevel(l * s))
  })
})
