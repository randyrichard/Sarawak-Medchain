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
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.34), background: PALETTE[hash % PALETTE.length] }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  )
}
