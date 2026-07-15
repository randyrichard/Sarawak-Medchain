import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-muted', className)} aria-label="Loading" />
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner size={22} />
      {label && <p className="text-xs text-muted">{label}</p>}
    </div>
  )
}
