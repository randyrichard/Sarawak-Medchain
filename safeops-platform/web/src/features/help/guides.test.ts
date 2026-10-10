import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ROLE_LABEL, type Role } from '@/api/types'
import { can, type Capability } from '@/features/permissions/permissions'
import { GLOSSARY, HOW_TO, howTosFor, ROLE_GUIDE } from './guides'

/*
 * The Help page is the first thing a new starter trusts, so it is checked like code.
 *
 * A guide that links to a page the reader's role cannot open, or names a button that has
 * since been renamed, sends somebody new the wrong way at exactly the moment they are
 * trying to learn the right one.
 */

const ROLES = Object.keys(ROLE_LABEL) as Role[]
const SRC = resolve(process.cwd(), 'src')

/** Each route in App.tsx and the capability it asks for (none: any signed-in member). */
function routes(): Map<string, Capability | null> {
  const app = readFileSync(resolve(SRC, 'app/App.tsx'), 'utf8')
  const found = new Map<string, Capability | null>()
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"([\s\S]*?)\/>\s*$/gm)) {
    const cap = m[2].match(/capability="([^"]+)"/)
    found.set(m[1], (cap?.[1] as Capability) ?? null)
  }
  // Multi-line routes: path, then a RequireCapability a few lines below.
  for (const m of app.matchAll(/path="([^"]+)"\s*element=\{\s*<RequireCapability capability="([^"]+)">/g)) {
    found.set(m[1], m[2] as Capability)
  }
  if (found.size < 15) throw new Error('Read too few routes from App.tsx; the patterns above need updating.')
  return found
}

const ROUTES = routes()
const pathOf = (to: string) => to.split('?')[0]

/** Can this role open this link without being told it has no access? */
function opens(role: Role, to: string) {
  const path = pathOf(to)
  expect(ROUTES.has(path), `${to}: no such route in App.tsx`).toBe(true)
  const cap = ROUTES.get(path)
  return cap === null || cap === undefined || can(role, cap)
}

describe('the guide for each role', () => {
  it.each(ROLES)('%s: has a few tasks, each a page that role can open', (role) => {
    const guide = ROLE_GUIDE[role]
    expect(guide.tasks.length).toBeGreaterThanOrEqual(3)
    expect(guide.tasks.length).toBeLessThanOrEqual(5)
    for (const t of guide.tasks) {
      expect(can(role, t.capability), `${role}: "${t.title}" needs ${t.capability}`).toBe(true)
      expect(opens(role, t.to), `${role}: "${t.title}" links to ${t.to}, which ${role} cannot open`).toBe(true)
    }
  })
})

describe('the step-by-step guides', () => {
  it.each(ROLES)('%s: are only the ones that role can follow', (role) => {
    const mine = howTosFor(role, (c) => can(role, c))
    expect(mine.length).toBeGreaterThan(0)
    for (const h of mine) expect(opens(role, h.to), `${role}: "${h.question}" links to ${h.to}`).toBe(true)
  })

  it('do not tell an employee how to approve a permit or investigate', () => {
    const ids = howTosFor('employee', (c) => can('employee', c)).map((h) => h.id)
    expect(ids).toContain('near-miss')
    expect(ids).toContain('action')
    expect(ids).not.toContain('permit-approve')
    expect(ids).not.toContain('investigate')
  })

  const API_REVIEW = resolve(process.cwd(), '../api/src/lib/permitReview.ts')
  ;(existsSync(API_REVIEW) ? it : it.skip)('offer permit approval to exactly the roles that sign a stage', () => {
    const src = readFileSync(API_REVIEW, 'utf8')
    const block = src.match(/const STAGE_ROLES[^{]*\{([\s\S]*?)\n\}/)
    expect(block, 'STAGE_ROLES not found in permitReview.ts').toBeTruthy()
    const signers = new Set([...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((r) => ROLES.includes(r as Role)))
    const approve = HOW_TO.find((h) => h.id === 'permit-approve')!
    expect(new Set(approve.forRoles)).toEqual(signers)
  })
})

/**
 * Every screen of the app as text: comments removed, so a name mentioned only in a note
 * does not count, and `&amp;` read as `&` the way the browser shows it.
 */
function corpus(): string {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !p.includes(`${join('features', 'help')}`)) {
        out.push(readFileSync(p, 'utf8'))
      }
    }
  }
  walk(SRC)
  return out.join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/&amp;/g, '&')
}

describe('the names the guides tell you to look for', () => {
  const text = corpus()
  const named = [
    ...Object.values(ROLE_GUIDE).flatMap((g) => g.tasks.flatMap((t) => [t.title, t.detail])),
    ...HOW_TO.flatMap((h) => [...h.steps, h.note ?? '']),
  ].flatMap((s) => [...s.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]))

  it('are found', () => expect(named.length).toBeGreaterThan(40))

  it.each([...new Set(named)])('"%s" is on a screen', (name) => {
    expect(text.includes(name), `"${name}" no longer appears anywhere in the app - was it renamed?`).toBe(true)
  })
})

describe('the glossary', () => {
  it('is in alphabetical order, each term once', () => {
    const terms = GLOSSARY.map((g) => g.term)
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
    expect(new Set(terms).size).toBe(terms.length)
  })

  it('explains the abbreviations the product uses', () => {
    const terms = GLOSSARY.map((g) => g.term).join(' ')
    for (const word of ['HSE', 'DOSH', 'TRIR', 'LTI', 'PPE']) expect(terms).toContain(word)
  })
})
