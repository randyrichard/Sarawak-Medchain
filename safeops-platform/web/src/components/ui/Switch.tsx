import { cn } from '@/lib/cn'

/** Accessible on/off switch. */
export function Switch({
  checked, onChange, disabled, label, id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
}) {
  const btn = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-grid',
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
  if (!label) return btn
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
      {btn}
      {label}
    </label>
  )
}
