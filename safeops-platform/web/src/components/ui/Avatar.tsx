import { cn } from '@/lib/cn'

const PALETTE = ['var(--s1)', 'var(--s2)', 'var(--s5)', 'var(--s8)', 'var(--s7)']

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

/** Deterministic color per name so the same person is always the same hue. */
export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return (
    <span
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white', className)}
      style={{
        width: size, height: size, fontSize: Math.max(9, size * 0.34),
        backgroundColor: PALETTE[hash % PALETTE.length],
        /*
         * A 30% shade over the series colour, so the white initials are readable.
         *
         * The palette is the chart series, tuned to be told apart on a chart - not to carry
         * white text. Green, pink and orange under white initials measured 2.7-3.4:1 against
         * the 4.5:1 text needs, flagged on every page because the account menu shows one.
         * An overlay rather than new colours keeps each person's hue recognisable, and
         * reaches at least 5.1:1 for every palette entry in both themes.
         */
        backgroundImage: 'linear-gradient(rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.3))',
      }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  )
}
