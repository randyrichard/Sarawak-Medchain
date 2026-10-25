import { describe, expect, it } from 'vitest'
import { headerKey, parseCsv, parseDay, parseYesNo } from './csvParse.js'

describe('reading a CSV as Excel writes it', () => {
  it('keeps a comma inside quotes in its cell', () => {
    expect(parseCsv('Name,Site\n"Lim, Grace",Bintulu\n')).toEqual([['Name', 'Site'], ['Lim, Grace', 'Bintulu']])
  })

  it('reads a doubled quote as a quote, and a line break inside quotes as part of the cell', () => {
    expect(parseCsv('Notes\n"Says ""keep out""\nat gate 2"')).toEqual([['Notes'], ['Says "keep out"\nat gate 2']])
  })

  it('strips the byte-order mark and copes with CRLF', () => {
    expect(parseCsv('\uFEFFName,Site\r\nAli,Miri\r\n')).toEqual([['Name', 'Site'], ['Ali', 'Miri']])
  })

  it('follows a semicolon file, from a laptop set to a locale that uses them', () => {
    expect(parseCsv('Name;Site;Position\nAli;Miri;Rigger, senior\n')).toEqual([['Name', 'Site', 'Position'], ['Ali', 'Miri', 'Rigger, senior']])
  })

  it('drops blank lines and trims cells', () => {
    expect(parseCsv('Name , Site\n\n  Ali , Miri \n,,\n')).toEqual([['Name', 'Site'], ['Ali', 'Miri']])
  })

  it('matches headers however they are written', () => {
    expect(headerKey('Employee No.')).toBe(headerKey('employee_no'))
  })
})

describe('dates as written in Malaysia', () => {
  it('reads day first', () => {
    expect(parseDay('05/01/2026')).toBe('2026-01-05')
    expect(parseDay('5-1-2026')).toBe('2026-01-05')
    expect(parseDay('2026-01-05')).toBe('2026-01-05')
    expect(parseDay('5 Jan 2026')).toBe('2026-01-05')
  })

  it('refuses an impossible date rather than guessing at it', () => {
    expect(parseDay('01/31/2026')).toBeNull() // a US date: there is no month 31
    expect(parseDay('31/02/2026')).toBeNull()
    expect(parseDay('next week')).toBeNull()
  })
})

describe('yes and no', () => {
  it('reads the usual ways of writing it, in English and Malay', () => {
    expect(parseYesNo('Yes')).toBe(true)
    expect(parseYesNo('tidak')).toBe(false)
    expect(parseYesNo('')).toBeUndefined()
    expect(parseYesNo('maybe')).toBeNull()
  })
})
