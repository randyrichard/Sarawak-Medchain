// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Safari and older-browser rules, held in place.
 *
 * Only Chromium is available to the automated tests, so these pin the fixes found by
 * reading the build against what iOS Safari supports. docs/BROWSER_COMPATIBILITY.md has
 * the floor and the real-iPhone check that still has to be done by hand.
 */
const SRC = resolve(process.cwd(), 'src')
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(p) && !p.includes('.test.')) out.push(p)
  }
  return out
}

const COMPAT = read('public/compat.js')

/**
 * Runs compat.js as a browser would, with `missing` features taken away from the copy of
 * the globals it sees. jsdom itself is left alone: it uses Object.hasOwn internally.
 */
function runCompat(missing: { hasOwn?: boolean; structuredClone?: boolean } = {}) {
  const win = new Proxy(window, {
    get(t, k) {
      if (k === 'structuredClone') return missing.structuredClone ? undefined : globalThis.structuredClone
      if (k === '__safeopsUnsupported') return Reflect.get(t, k)
      const v = Reflect.get(t, k)
      return typeof v === 'function' && !/^[A-Z]/.test(String(k)) ? v.bind(t) : v
    },
    set(t, k, v) { return Reflect.set(t, k, v) },
  })
  const obj = missing.hasOwn ? { ...Object, hasOwn: undefined, prototype: Object.prototype } : Object
  // jsdom has no module loader, so its <script> lacks `noModule`; a real browser has it.
  const doc = new Proxy(document, {
    get(t, k) {
      if (k === 'createElement') return (tag: string) => Object.assign(t.createElement(tag), tag === 'script' ? { noModule: false } : {})
      const v = Reflect.get(t, k)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  new Function('window', 'document', 'Object', COMPAT)(win, doc, obj)
}

describe('Safari compatibility', () => {
  afterEach(() => {
    delete window.__safeopsUnsupported
    document.body.innerHTML = ''
  })

  it('never calls crypto.randomUUID directly: it is missing before iOS 15.4 and on plain http', () => {
    const offenders = sources(SRC)
      .filter((f) => !f.endsWith(join('lib', 'uuid.ts')))
      .filter((f) => /crypto\.randomUUID\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it('never revokes a download link straight after clicking it (Safari can cancel the download)', () => {
    const offenders = sources(SRC)
      .filter((f) => !f.endsWith(join('lib', 'saveBlob.ts')))
      .filter((f) => /\.click\(\)[\s\S]{0,120}URL\.revokeObjectURL\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
    // The one helper that does it waits first.
    expect(read('src/lib/saveBlob.ts')).toMatch(/setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/)
  })

  it('loads the browser check as a plain script before the app', () => {
    const html = read('index.html')
    const check = html.indexOf('<script src="/compat.js"></script>')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(html.indexOf('<script type="module"'))
    expect(read('src/main.tsx')).toMatch(/if \(!window\.__safeopsUnsupported\)/)
  })

  it('keeps the browser check in syntax an old browser can parse', () => {
    // No arrow functions, let/const, template strings, classes or optional chaining.
    const code = COMPAT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\]|\\.)*'/g, "''")
    expect(code).not.toMatch(/=>|\blet\b|\bconst\b|`|\bclass\b|\?\./)
  })

  it('lets a current browser through untouched', () => {
    document.body.innerHTML = '<div id="root"></div>'
    runCompat()
    expect(window.__safeopsUnsupported).toBeUndefined()
    expect(document.getElementById('root')!.innerHTML).toBe('')
  })

  it('explains, instead of a white screen, on Safari 15.0 to 15.3', () => {
    document.body.innerHTML = '<div id="root"></div>'
    runCompat({ hasOwn: true, structuredClone: true })
    expect(window.__safeopsUnsupported).toBe(true)
    const root = document.getElementById('root')!
    expect(root.querySelector('[role="alert"]')).not.toBeNull()
    expect(root.textContent).toMatch(/too old/)
    expect(root.textContent).toMatch(/iOS 15\.4/)
  })
})
