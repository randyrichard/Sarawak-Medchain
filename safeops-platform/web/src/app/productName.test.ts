import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

/*
 * The product was called SafeOps until October 2026. Identifiers that running installations
 * depend on keep that spelling on purpose (README.md says which and why); nothing a person
 * reads may. This fails if the old name comes back into anything the app renders, prints,
 * downloads or sends - the web app, its static files, and the API's messages and emails.
 */
const web = process.cwd()
const ROOTS = ['src', 'public', 'index.html', '../api/src'].map((p) => resolve(web, p))

/** Spellings that are identifiers rather than the product's name. */
const IDENTIFIERS = [
  /X-SafeOps-[A-Za-z]+/g, // proxy and webhook headers
  /SafeOps-Webhooks\/\d+/g, // webhook User-Agent, which a receiver may filter on
  /SafeOpsPlatform2026/g, // the seeded demo accounts' password
  /demo\.safeops\.app/gi, // demo accounts
  /\bSAFEOPS_[A-Z_]+|ESAFEOPSBLOCKED/g, // environment variables, an internal error code
  /listed as SafeOps/g, // the sign-in hint for authenticator entries made before the rename
]
const OLD_NAME = /SafeOps|SAFEOPS|safeops-[\w${}|' -]*\.(?:csv|txt|json|zip|pdf)\b/

function sources(path: string): string[] {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || /\.test\.tsx?$/.test(name)) return []
    const child = resolve(path, name)
    return statSync(child).isDirectory() || /\.(tsx?|js|html|svg|txt|css)$/.test(name) ? sources(child) : []
  })
}

describe('the product name', () => {
  it('is SafeChain everywhere people read it', () => {
    const found: string[] = []
    for (const file of ROOTS.flatMap(sources)) {
      const text = IDENTIFIERS.reduce((t, re) => t.replace(re, ''), readFileSync(file, 'utf8'))
      text.split('\n').forEach((line, i) => {
        if (OLD_NAME.test(line)) found.push(`${relative(web, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(found).toEqual([])
  })

  it('would notice the old name', () => {
    expect(OLD_NAME.test('New to SafeOps? Start here.')).toBe(true)
    expect(OLD_NAME.test('SAFEOPS · PERMIT TO WORK')).toBe(true)
    expect(OLD_NAME.test("saveBlob(blob, 'safeops-users.csv')")).toBe(true)
    expect(OLD_NAME.test('localStorage.getItem(\'safeops.theme\')')).toBe(false)
  })
})
