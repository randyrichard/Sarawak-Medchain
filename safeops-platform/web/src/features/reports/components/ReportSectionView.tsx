import type { ReportSection } from '@/api/reportsApi'
import { cn } from '@/lib/cn'

/**
 * One section of a multi-section report.
 *
 * `unavailable` is styled unlike every figure on the page, on purpose. It is a statement
 * about what this deployment does not record, and a reader who skims it as a number has
 * been told something untrue.
 */
export function ReportSectionView({ section }: { section: ReportSection }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h3 className="border-b pb-1 text-sm font-semibold text-ink">{section.title}</h3>

      {section.note && (
        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink-2">{section.note}</p>
      )}

      {section.unavailable && (
        <p className="mt-2 border-l-2 pl-3 text-xs italic leading-relaxed text-muted">
          {section.unavailable}
        </p>
      )}

      {section.stats && section.stats.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {section.stats.map((s) => (
            <div key={s.label}>
              <p className="text-2xs uppercase tracking-wide text-muted">{s.label}</p>
              <p className={cn(
                'text-lg font-bold',
                // Same rule as everywhere else: red only where a non-zero value is a
                // problem. Near misses are never red.
                /overdue|lost time/i.test(s.label) && s.value !== '0' && s.value !== 'N/A'
                  ? 'text-critical' : 'text-ink',
              )}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {section.columns && section.rows && section.rows.length > 0 && (
        <div className="mt-2.5 relative overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr className="border-b text-left text-muted">
                {section.columns.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 font-medium uppercase tracking-wide">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {section.columns!.map((c) => (
                    <td key={c.key} className="px-2 py-1.5 text-ink">{r[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.writeIn && (
        // Ruled lines, because a printed management report is written on and an unruled
        // gap invites a paragraph squeezed into the margin.
        <div className="mt-2.5 space-y-4">
          {Array.from({ length: section.writeIn }).map((_, i) => (
            <div key={i} className="border-b" />
          ))}
        </div>
      )}
    </section>
  )
}
