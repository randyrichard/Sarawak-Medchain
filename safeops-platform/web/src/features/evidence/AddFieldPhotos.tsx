import { useState } from 'react'
import { Upload } from 'lucide-react'
import type { EvidenceKind } from '@/api/fieldEvidenceApi'
import { isBackendConfigured } from '@/api/authApi'
import { Alert, Button } from '@/components/ui'
import { PhotoPicker } from './PhotoPicker'
import { sendFieldPhotos } from './fieldEvidence'

/** Choose photos and send them straight away, to a record that already exists. */
export function AddFieldPhotos({
  kind, id, itemId, label = 'Add photos', onAdded,
}: {
  kind: EvidenceKind
  id: string
  itemId?: string
  label?: string
  onAdded: () => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!isBackendConfigured()) return null
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await sendFieldPhotos(kind, id, files, itemId)
      // Only what did not arrive stays selected, so trying again cannot send a photo twice.
      setFiles(r.failed)
      if (r.stored > 0) onAdded()
      if (r.failed.length > 0) {
        const n = r.failed.length === 1 ? 'One photo' : `${r.failed.length} photos`
        setError(`${n} did not upload${r.stored > 0 ? `; the other ${r.stored} did` : ''}. ${r.error ?? 'Check the connection and try again.'}`)
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-1.5">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      <PhotoPicker files={files} onChange={setFiles} label={label} />
      {files.length > 0 && (
        <Button size="sm" className="w-full" icon={<Upload size={13} />} loading={busy} onClick={() => void send()}>
          Upload {files.length === 1 ? 'photo' : `${files.length} photos`}
        </Button>
      )}
    </div>
  )
}
