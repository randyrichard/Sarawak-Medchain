import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/*
 * Words and sentences start on the left.
 *
 * Text was centred in some places (empty states, errors, confirmations, help lines) and
 * pushed right in others (table columns, drawer values), and on a phone that read as "not
 * organised": the eye had to find where each line began. Every paragraph, label, message,
 * table column and empty state now starts on the left, as on the sites people use daily.
 *
 * Centring and right-alignment stay only where they are the convention and the text is not
 * prose. Each such place is listed here with its reason; anything else fails.
 * A button's own label is centred by the browser and is not counted.
 */

const SRC = join(__dirname, '..', '..')

const ALLOWED: Record<'text-center' | 'text-right', Record<string, { count: number; why: string }>> = {
  'text-center': {
    'features/admin/sections/RolesSection.tsx': { count: 2, why: 'a permissions matrix: ticks centred under each column' },
    'features/training/components/CompetencyMatrix.tsx': { count: 4, why: 'a competency matrix: levels centred under each course' },
    'features/org/OrganizationPage.tsx': { count: 2, why: 'a role matrix: ticks centred under each role' },
    'features/actions/components/CalendarView.tsx': { count: 1, why: 'weekday names over calendar columns' },
    'features/assets/components/InspectionCalendar.tsx': { count: 1, why: 'weekday names over calendar columns' },
    'features/training/components/AttendanceRunner.tsx': { count: 1, why: 'a three-digit score field' },
    'features/permits/components/PermitDrawer.tsx': { count: 1, why: 'gas-reading number fields' },
    'features/account/mfa/MfaEnrolment.tsx': { count: 1, why: 'recovery codes in a grid' },
    'features/assets/components/AssetPhotos.tsx': { count: 1, why: 'an upload area: one big button' },
    'features/incidents/ReportIncidentPage.tsx': { count: 1, why: 'an upload area: one big button' },
    'features/permits/components/AttachmentsPanel.tsx': { count: 1, why: 'an upload area: one big button' },
    'features/evidence/FieldPhotos.tsx': { count: 1, why: 'a file name under its icon in a thumbnail' },
  },
  'text-right': {
    'features/actions/components/ActionsTable.tsx': { count: 1, why: 'a percentage in a fixed slot beside its bar' },
    'features/assets/components/EquipmentBoard.tsx': { count: 1, why: 'a count in a fixed slot beside its bar' },
    'features/visitors/components/VisitorBoard.tsx': { count: 1, why: 'a count in a fixed slot beside its bar' },
    'features/dashboard/components/ModulePanels.tsx': { count: 1, why: 'a count in a fixed slot beside its bar' },
    'features/audits/AuditsPage.tsx': { count: 1, why: 'a score in a fixed slot beside its bar' },
  },
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(p) && !p.includes('.test.')) out.push(p)
  }
  return out
}

describe('words and sentences start on the left', () => {
  for (const cls of ['text-center', 'text-right'] as const) {
    it(`uses ${cls} only where it is the convention, not for prose`, () => {
      const found: Record<string, number> = {}
      for (const file of sources(SRC)) {
        const n = (readFileSync(file, 'utf8').match(new RegExp(`(?<![\\w-])${cls}(?![\\w-])`, 'g')) ?? []).length
        if (n) found[file.slice(SRC.length + 1).split('\\').join('/')] = n
      }
      const allowed = Object.fromEntries(Object.entries(ALLOWED[cls]).map(([f, a]) => [f, a.count]))
      expect(found).toEqual(allowed)
    })
  }

  it('uses no max-* breakpoint, which this Tailwind config does not generate', () => {
    // The custom `coarse` and `short` screens leave Tailwind without `max-sm:` and its kin:
    // such a class compiles to nothing, silently. Write phone-first and override with `sm:`.
    const offenders = sources(SRC).filter((f) => /(?<![\w-])max-(sm|md|lg|xl|2xl):/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })

  it('pushes something right only in a row that never wraps', () => {
    /*
     * An auto left margin keeps pushing right after a row wraps: on a phone the view tabs,
     * New Session, or Export sat alone at the right edge of a line of their own. In a row
     * that can wrap, RowSpacer pushes right only while the row is one line. These rows are
     * one line by design, so a value or a time at their end stays there.
     */
    const ALLOWED_PUSH: Record<string, number> = {
      'components/layout/Topbar.tsx': 1, // the top bar's own buttons, at its right end
      'components/charts/Charts.tsx': 1, // a value at the end of a chart tooltip's row
      'features/admin/sections/UsersSection.tsx': 1, // when, at the end of a sign-in row
      'features/admin/sections/DeveloperSection.tsx': 1, // what an endpoint does, at the end of its row
      'features/legal/LegalPage.tsx': 1, // the legal pages' links, at the right of their header
    }
    const found: Record<string, number> = {}
    for (const file of sources(SRC)) {
      const n = (readFileSync(file, 'utf8').match(/(?<![\w-])ml-auto(?![\w-])/g) ?? []).length
      if (n) found[file.slice(SRC.length + 1).split('\\').join('/')] = n
    }
    expect(found).toEqual(ALLOWED_PUSH)
  })

  it('lets no table column be right-aligned', () => {
    // DataTable once took `align: 'right'`; the option is gone, so a column cannot ask for it.
    const table = readFileSync(join(SRC, 'components/ui/Table.tsx'), 'utf8')
    expect(table).not.toMatch(/align\?: /)
    expect(table).not.toMatch(/text-right/)
  })

  it('starts empty states, errors and "not in this demo" on the left', () => {
    for (const f of ['components/ui/EmptyState.tsx', 'components/ui/AsyncContent.tsx']) {
      const s = readFileSync(join(SRC, f), 'utf8')
      expect(s, f).not.toMatch(/flex-col items-center/)
      expect(s, f).not.toMatch(/justify-center gap-x-3/)
    }
  })
})
