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
      // The track is 36x20; on a touch screen the button around it is 48x44, so a finger
      // does not have to land on the track itself.
      className="inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-50 coarse:h-11 coarse:w-12"
    >
      <span className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', checked ? 'bg-accent' : 'bg-grid')}>
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
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
