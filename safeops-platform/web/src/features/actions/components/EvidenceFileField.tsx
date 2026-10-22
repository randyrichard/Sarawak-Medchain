import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import { upload } from '@/api/http'
import { isBackendConfigured } from '@/api/authApi'

/**
 * The file an evidence-required corrective action is completed on.
 *
 * A file, not just a note, where evidence was demanded when the action was raised. The server
 * refuses the completion without one, so every place that offers "Complete" has to be able to
 * take it - a rule that can only be satisfied somewhere else is a dead end where you are.
 * It was only in the Corrective Actions drawer: the incident's Actions tab and the board
 * offered Complete with no way to attach anything, so an investigation's action, which asks
 * for evidence by default, was refused every time from there.
 *
 * An incident's action keeps its files with the incident, through the incident's own upload
 * route with the action id; any other action keeps them as field evidence. One upload
 * contract, the same allow-list and the same progress either way.
 */
export function EvidenceFileField({ actionId, incidentId, onUploaded, onError }: {
  actionId: string
  /** The incident the action was raised from, if any. Its files are kept there. */
  incidentId?: string | null
  onUploaded?: (fileName: string) => void
  /** Where the host shows problems: null clears it. */
  onError: (message: string | null) => void
}) {
  /** Files attached against this action during this completion. */
  const [uploaded, setUploaded] = useState<string[]>([])
  const [pct, setPct] = useState<number | null>(null)
  // The offline demo has nowhere to keep a file, and completes an action on its note alone.
  if (!isBackendConfigured()) return null

  const send = async (file: File) => {
    onError(null)
    setPct(0)
    try {
      const form = new FormData()
      form.append('files', file)
      if (incidentId) form.append('actionId', actionId)
      await upload<unknown>(incidentId ? `/incidents/${incidentId}/attachments` : `/evidence/actions/${actionId}`, form, setPct)
      setUploaded((u) => [...u, file.name])
      onUploaded?.(file.name)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setPct(null)
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink">
        Evidence file <span className="text-critical">*</span>
      </p>
      {uploaded.length > 0 ? (
        <ul className="mb-1.5 space-y-1">
          {uploaded.map((f) => (
            <li key={f} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs text-ink">
              <Paperclip size={11} className="text-muted" /> {f}
            </li>
          ))}
        </ul>
      ) : null}

      {pct === null ? (
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-3 text-2xs text-muted hover:border-accent hover:bg-accent-soft/30">
          <Paperclip size={12} />
          {uploaded.length > 0 ? 'Attach another file' : 'Attach a photo or document'}
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void send(file)
              e.target.value = ''
            }}
          />
        </label>
      ) : (
        <div className="space-y-1">
          <p className="text-2xs text-ink">Uploading… {pct}%</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <p className="mt-1 text-2xs text-muted">
        JPEG, PNG, WebP, HEIC or PDF, up to 10 MB. The server will not accept the
        completion until a file is attached.
      </p>
    </div>
  )
}
