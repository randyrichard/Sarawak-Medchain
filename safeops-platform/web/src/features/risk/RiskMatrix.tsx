import { cn } from '@/lib/cn'
import { LIKELIHOOD, RISK_BANDS, RISK_LEVEL_LABEL, riskLevel, SEVERITY, type RiskLevel } from '@/api/riskApi'

/**
 * The 5 × 5 risk matrix of the DOSH HIRARC guidelines, with how many hazards sit in each
 * cell: likelihood up the side, most likely at the top, and severity along the bottom.
 *
 * The band of each cell is its colour, its score and its accessible name - never colour
 * alone - and the legend underneath says what each band asks for. A cell is a button: it
 * narrows the register to the hazards in it, and pressed again lets them all back.
 */
export const BAND_STYLE: Record<RiskLevel, { fill: string; edge: string }> = {
  high: { fill: 'var(--critical-soft)', edge: 'var(--critical)' },
  medium: { fill: 'var(--warning-soft)', edge: 'var(--warning)' },
  low: { fill: 'var(--good-soft)', edge: 'var(--good)' },
}

export function RiskMatrix({ counts, selected, onSelect, label }: {
  /** counts[likelihood - 1][severity - 1] */
  counts: number[][]
  selected: { likelihood: number; severity: number } | null
  onSelect: (cell: { likelihood: number; severity: number } | null) => void
  /** Names the matrix for assistive technology: "Risk now", "Risk after controls". */
  label: string
}) {
  return (
    <div>
      <div role="group" aria-label={label} className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1">
        {LIKELIHOOD.map((l) => (
          <Row key={l.value} likelihood={l.value} counts={counts} selected={selected} onSelect={onSelect} />
        ))}
        <span aria-hidden />
        {SEVERITY.slice().reverse().map((s) => (
          <span key={s.value} className="flex flex-col items-center pt-1 text-2xs leading-tight text-ink-2" aria-hidden>
            <span className="font-semibold tabular-nums text-ink">{s.value}</span>
            <span className="hyphens-auto [overflow-wrap:anywhere]" lang="en">{s.label}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 flex justify-between text-2xs font-semibold uppercase tracking-wider text-muted" aria-hidden>
        <span>Likelihood ↑</span><span>Severity →</span>
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        {(['high', 'medium', 'low'] as const).map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border" style={{ background: BAND_STYLE[band].fill, borderColor: BAND_STYLE[band].edge }} aria-hidden />
            <span><span className="font-semibold text-ink">{RISK_LEVEL_LABEL[band]}</span> {RISK_BANDS[band]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({ likelihood, counts, selected, onSelect }: {
  likelihood: number
  counts: number[][]
  selected: { likelihood: number; severity: number } | null
  onSelect: (cell: { likelihood: number; severity: number } | null) => void
}) {
  const step = LIKELIHOOD.find((l) => l.value === likelihood)!
  return (
    <>
      <span className="flex items-center gap-1.5 pr-1 text-2xs leading-tight text-ink-2" aria-hidden>
        <span className="font-semibold tabular-nums text-ink">{likelihood}</span>
        <span className="hidden sm:inline">{step.label}</span>
      </span>
      {[1, 2, 3, 4, 5].map((severity) => {
        const score = likelihood * severity
        const band = riskLevel(score)
        const n = counts[likelihood - 1]?.[severity - 1] ?? 0
        const isSelected = selected?.likelihood === likelihood && selected?.severity === severity
        const sev = SEVERITY.find((s) => s.value === severity)!
        return (
          <button
            key={severity}
            type="button"
            aria-pressed={isSelected}
            aria-label={`Likelihood ${likelihood} ${step.label}, severity ${severity} ${sev.label}: risk ${score}, ${RISK_LEVEL_LABEL[band]}. ${n} ${n === 1 ? 'hazard' : 'hazards'}.`}
            title={`${step.label} × ${sev.label} = ${score} (${RISK_LEVEL_LABEL[band]}): ${n} ${n === 1 ? 'hazard' : 'hazards'}`}
            onClick={() => onSelect(isSelected ? null : { likelihood, severity })}
            className={cn(
              'relative flex aspect-square min-h-[2.5rem] items-center justify-center rounded-md border transition-shadow',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              isSelected && 'ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--surface)]',
            )}
            style={{ background: BAND_STYLE[band].fill, borderColor: BAND_STYLE[band].edge }}
          >
            <span className="absolute left-1 top-0.5 text-[10px] tabular-nums text-ink-2">{score}</span>
            {n > 0 && <span className="text-base font-bold tabular-nums text-ink">{n}</span>}
          </button>
        )
      })}
    </>
  )
}
