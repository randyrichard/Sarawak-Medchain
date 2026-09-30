import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * The layers depend inwards, and only inwards.
 *
 *   routes/  ->  http/  ->  lib/  ->  domain/
 *
 *   domain/  identity (Caller), the error base, access policy. Knows nothing else here.
 *   lib/     services and infrastructure: business rules, Prisma, mail, PDFs, scheduler.
 *   http/    Express concerns: auth middleware, the caller from a token, asyncRoute.
 *   routes/  one router per module: parse, call a service, answer.
 *
 * A service that imported a router, or domain code that reached into a service, would
 * compile and pass every other test while quietly re-coupling what these folders
 * separate. This reads every import and fails on any that points outwards.
 */
const SRC = resolve(__dirname)
const LAYERS = ['domain', 'lib', 'http', 'routes'] as const
type Layer = (typeof LAYERS)[number]
/** What each layer may import from, besides itself and packages. */
const ALLOWED: Record<Layer, Layer[]> = {
  domain: [],
  lib: ['domain'],
  http: ['domain', 'lib'],
  routes: ['domain', 'lib', 'http'],
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })
}

const layerOf = (file: string): Layer | null => {
  const top = relative(SRC, file).split('/')[0]
  return (LAYERS as readonly string[]).includes(top) ? (top as Layer) : null
}

describe('architecture', () => {
  it('has every layer', () => {
    for (const l of LAYERS) expect(statSync(join(SRC, l)).isDirectory()).toBe(true)
  })

  it('only depends inwards', () => {
    const violations: string[] = []
    for (const file of walk(SRC)) {
      const from = layerOf(file)
      if (!from) continue
      const text = readFileSync(file, 'utf8')
      // `from '…'`, a bare `import '…'`, and `import('…')`.
      for (const m of text.matchAll(/(?:from\s+|import\s+|import\(\s*)'(\.{1,2}\/[^']+)'/g)) {
        const target = resolve(dirname(file), m[1])
        const to = layerOf(target)
        if (!to || to === from) continue
        if (!ALLOWED[from].includes(to)) violations.push(`${relative(SRC, file)} -> ${m[1]} (${from} may not import ${to})`)
      }
    }
    expect(violations).toEqual([])
  })
})
