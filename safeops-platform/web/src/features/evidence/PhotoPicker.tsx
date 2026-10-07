import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Alert } from '@/components/ui'
import { EVIDENCE_ACCEPT, screenEvidence } from '@/features/incidents/evidence'
import { cn } from '@/lib/cn'

/**
 * Choosing photos in the field. The files are held here and sent by the caller once the
 * record they prove has been saved. Anything the server would refuse is named up front.
 *
 * No `capture` attribute: with it, Android opens the camera directly and a photo already
 * taken cannot be chosen.
 */
export function PhotoPicker({
  files, onChange, label = 'Photos', compact = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  label?: string
  compact?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [refused, setRefused] = useState<string[]>([])
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-lg border font-semibold text-ink-2 hover:bg-accent-soft coarse:min-h-11',
          compact ? 'bg-surface px-2.5 py-1.5 text-2xs' : 'py-2 text-xs',
        )}
      >
        <Camera size={compact ? 12 : 13} /> {label}{files.length > 0 && ` (${files.length} to send)`}
      </button>
      <input
        ref={ref} type="file" accept={EVIDENCE_ACCEPT} multiple className="hidden"
        onChange={(e) => {
          const { ok, refused: no } = screenEvidence(Array.from(e.target.files ?? []))
          onChange([...files, ...ok])
          setRefused(no)
          e.target.value = ''
        }}
      />
      {refused.length > 0 && <Alert tone="warning" onDismiss={() => setRefused([])}>{refused.join(' ')}</Alert>}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex max-w-full items-center gap-1 rounded-full border bg-surface py-0.5 pl-2.5 pr-1 text-2xs text-ink-2">
              <span className="truncate">{f.name}</span>
              <button
                type="button" aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, x) => x !== i))}
                className="rounded-full p-0.5 text-muted hover:text-critical coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
