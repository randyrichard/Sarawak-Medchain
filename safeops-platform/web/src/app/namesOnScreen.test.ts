import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { titleCase } from '@/lib/titleCase'
import { NAV } from '@/components/layout/nav'

/*
 * Names on screen are in Title Case. That covers menu items, page and dialog titles, card and
 * section headings, buttons, table headings, figure labels and status badges. Sentences stay
 * sentences: descriptions, hints, messages, and statements shown as a heading.
 *
 * This reads the source, so a new button written "Save changes" fails here before anybody
 * sees it beside "Save Changes". The rule itself, small words and all, is lib/titleCase.ts.
 */
const TEXT_IN = new Set(['Button', 'LinkButton', 'button', 'DropdownItem', 'DropdownLabel', 'NavLink', 'h1', 'h2', 'h3', 'h4', 'th', 'summary', 'legend', 'Badge'])
const PROP_OF: Record<string, Set<string>> = {
  title: new Set(['Dialog', 'CardHeader', 'PageHeader', 'Section', 'FormSection', 'AddItemDialog', 'StatementDialog', 'Breakdown', 'ReportingSummary']),
  label: new Set(['Stat', 'StatTile', 'GaugeCard', 'TileRow', 'SortHeader', 'StatusPill']),
}
/** Shown as a heading or a badge, but saying something rather than naming it. */
const STATEMENTS = new Set([
  'A new version of SafeChain is available', 'Something went wrong', 'This invitation cannot be used',
  'Checking your invitation', 'You’re all set', 'Password changed', 'Your password has expired',
  'Password updated', 'Report saved', 'Saved on this phone', 'Thank you — that was worth reporting',
  'Reset link issued', 'You are:',
])
const ENTITIES: Record<string, string> = { amp: '&', rsquo: '’', middot: '·', mdash: '—', ndash: '–', hellip: '…', nbsp: ' ' }
const sentence = (t: string) =>
  /[.?!]["'”’)]?\s*$/.test(t) || /[.?!]\s+[A-Z]/.test(t) || /^[a-z]/.test(t) || t.split(/\s+/).length > 9 || /^Tip:/.test(t) || STATEMENTS.has(t)

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name)
    if (statSync(path).isDirectory()) return name === 'mock' || name === 'node_modules' ? [] : sources(path)
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

function sentenceCaseNames(): string[] {
  const found: string[] = []
  const root = resolve(process.cwd(), 'src')
  for (const file of sources(root)) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const check = (text: string, node: ts.Node, opts?: { atStart: boolean; atEnd: boolean }) => {
      const plain = text.replace(/&(\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
      const core = plain.trim().replace(/\s+/g, ' ')
      if (!core || !/\s/.test(core) || sentence(core)) return
      if (titleCase(plain, opts) !== plain) {
        found.push(`${relative(root, file)}:${src.getLineAndCharacterOfPosition(node.getStart()).line + 1}  "${core}" → "${titleCase(core)}"`)
      }
    }
    const literals = (e: ts.Expression | undefined): void => {
      if (!e) return
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return check(e.text, e)
      if (ts.isParenthesizedExpression(e)) return literals(e.expression)
      if (ts.isConditionalExpression(e)) { literals(e.whenTrue); literals(e.whenFalse) }
    }
    const visit = (n: ts.Node): void => {
      if (ts.isJsxElement(n) && TEXT_IN.has(n.openingElement.tagName.getText())) {
        const kids = n.children
        const blank = (c: ts.JsxChild) => ts.isJsxText(c) && !c.getText().trim()
        kids.forEach((k, i) => {
          if (ts.isJsxText(k)) check(k.getText(), k, { atStart: kids.slice(0, i).every(blank), atEnd: kids.slice(i + 1).every(blank) })
          else if (ts.isJsxExpression(k)) literals(k.expression)
        })
      }
      if (ts.isJsxAttribute(n) && n.initializer && PROP_OF[n.name.getText()]?.has(n.parent.parent.tagName.getText())) {
        const i = n.initializer
        if (ts.isStringLiteral(i)) check(i.text, i)
        else if (ts.isJsxExpression(i)) literals(i.expression)
      }
      ts.forEachChild(n, visit)
    }
    visit(src)
  }
  return found
}

describe('names on screen', () => {
  it('are in Title Case wherever they are written', () => {
    expect(sentenceCaseNames()).toEqual([])
  })

  it('include every menu item', () => {
    expect(NAV.filter((n) => titleCase(n.label) !== n.label).map((n) => n.label)).toEqual([])
  })
})
