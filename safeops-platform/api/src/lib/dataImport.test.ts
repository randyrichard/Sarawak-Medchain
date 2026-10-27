import { describe, expect, it } from 'vitest'
import { IMPORT_COLUMNS, IMPORT_KINDS, ratingOf, templateCsv } from './dataImport.js'
import { LIKELIHOOD, SEVERITY } from '../domain/hirarc.js'

describe('a HIRARC rating as spreadsheets write it', () => {
  it('reads the number, the name, or both when they agree', () => {
    expect(ratingOf('4', LIKELIHOOD)).toBe(4)
    expect(ratingOf('4 Possible', LIKELIHOOD)).toBe(4)
    expect(ratingOf('4 - Possible', LIKELIHOOD)).toBe(4)
    expect(ratingOf('5 (Catastrophic)', SEVERITY)).toBe(5)
    expect(ratingOf('most likely', LIKELIHOOD)).toBe(5)
    expect(ratingOf('', SEVERITY)).toBeNull()
  })

  it('refuses a rating off the scale, or one that names two', () => {
    expect(ratingOf('6', LIKELIHOOD)).toBeUndefined()
    expect(ratingOf('4 Remote', LIKELIHOOD)).toBeUndefined()
    expect(ratingOf('High', SEVERITY)).toBeUndefined()
  })
})

describe('the template for each register', () => {
  it.each(IMPORT_KINDS)('%s: has a header for every column the import reads', (kind) => {
    const [header] = templateCsv(kind).split('\r\n')
    expect(header.split(',').length).toBe(IMPORT_COLUMNS[kind].length)
    for (const c of IMPORT_COLUMNS[kind].filter((col) => col.required)) expect(header).toContain(c.header)
  })
})
