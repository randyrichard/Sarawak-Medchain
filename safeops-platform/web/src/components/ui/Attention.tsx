import { AlertTriangle, OctagonAlert } from 'lucide-react'

/**
 * Making the thing that needs attention stand out - the Von Restorff (isolation) effect.
 *
 * Among items that look alike, the one that differs is noticed and remembered (von Restorff,
 * 1933). SafeChain spends that on one thing only: a number or row that is asking for action.
 * Two rules from the research shape how:
 *
 * - **Never by colour alone.** A red number among black ones is invisible to the one man in
 *   twelve with a red-green colour vision deficiency, and to anyone on a washed-out site
 *   tablet in sunlight (WCAG 1.4.1). Here an alarming value carries an icon and a stripe -
 *   shape, not just hue - and says "needs attention" to a screen reader.
 * - **Rarely.** "If everything stands out, nothing does": the standouts must stay outnumbered
 *   by the ordinary. Tiles are only marked when the value is asking for something, never for
 *   decoration, so a page of calm numbers with one marked tile reads at a glance.
 */
export type Attention = 'critical' | 'warning' | null

/**
 * The attention level a tone colour stands for. Pages pass tones as CSS colours
 * (`var(--critical)`), so this reads the token rather than asking every caller to change.
 */
export function attentionOf(tone: string | null | undefined): Attention {
  if (!tone) return null
  if (tone.includes('--critical')) return 'critical'
  if (tone.includes('--warning') || tone.includes('--serious')) return 'warning'
  return null
}

// The card's own shadow (tailwind `shadow-card`) is repeated after the stripe, because an
// inline box-shadow replaces the class's rather than adding to it.
const CARD_SHADOW = '0 1px 2px rgba(11,11,11,0.04)'

/**
 * The edge stripe, for **critical only**.
 *
 * Warnings get the icon and nothing more. The isolation effect applies inside the alarms too:
 * when a "needs watching" tile wore the same stripe as a "needs action now" tile, a row of
 * three marked tiles had no single standout, and the one overdue mandatory course looked no
 * more urgent than an expiring certificate. Keeping the strongest mark for the strongest
 * case is what lets it be found first.
 */
export function attentionStripe(level: Attention): { boxShadow: string } | undefined {
  return level === 'critical' ? { boxShadow: `inset 3px 0 0 var(--critical), ${CARD_SHADOW}` } : undefined
}

/** The icon beside an alarming value, with words for assistive technology. */
export function AttentionIcon({ level, label }: { level: Attention; label?: string }) {
  if (!level) return null
  const Icon = level === 'critical' ? OctagonAlert : AlertTriangle
  return (
    <>
      <Icon size={16} aria-hidden className="shrink-0" style={{ color: level === 'critical' ? 'var(--critical)' : 'var(--warning)' }} />
      <span className="sr-only">{label ?? (level === 'critical' ? 'Needs attention now' : 'Needs attention')}</span>
    </>
  )
}
