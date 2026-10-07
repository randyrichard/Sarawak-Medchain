import { useState } from 'react'
import { Upload } from 'lucide-react'
import { type EvidenceKind, fieldEvidenceApi } from '@/api/fieldEvidenceApi'
import { isBackendConfigured } from '@/api/authApi'
import { Alert, Button } from '@/components/ui'
import { PhotoPicker } from './PhotoPicker'

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
      await fieldEvidenceApi.upload(kind, id, files, itemId)
      setFiles([])
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
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
