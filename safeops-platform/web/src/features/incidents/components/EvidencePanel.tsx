import { useRef, useState } from 'react'
import { FileSpreadsheet, FileText, Film, Image as ImageIcon, Paperclip, Upload } from 'lucide-react'
import { api } from '@/api/client'
import type { AttachmentKind, Incident } from '@/api/incidents'
import { Button, Card, CardHeader } from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { useActor } from '../lib'

const KIND_ICON: Record<AttachmentKind, typeof FileText> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  report: Paperclip,
}

const kindOf = (name: string): AttachmentKind => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel'
  return 'report'
}

export function EvidencePanel({ incident, onUpdate }: { incident: Incident; onUpdate: (i: Incident) => void }) {
  const actor = useActor()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const readOnly = incident.stage === 'closed'

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    let latest = incident
    for (const f of [...files]) {
      latest = await api.addIncidentAttachment(
        incident.id,
        { name: f.name, kind: kindOf(f.name), sizeKb: Math.max(1, Math.round(f.size / 1024)) },
        actor,
      )
    }
    onUpdate(latest)
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader
        title="Evidence"
        subtitle={`${incident.attachments.length} file(s)`}
        right={
          !readOnly ? (
            <Button variant="secondary" size="sm" icon={<Upload size={13} />} loading={busy} onClick={() => fileRef.current?.click()}>
              Upload
            </Button>
          ) : undefined
        }
      />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
      <div className="space-y-1.5 px-4 pb-4 pt-1">
        {incident.attachments.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted">Nothing attached yet — photos beat paragraphs.</p>
        )}
        {incident.attachments.map((a) => {
          const Icon = KIND_ICON[a.kind]
          return (
            <div key={a.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors hover:bg-accent-soft/40">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                <Icon size={14} className="text-accent" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">{a.name}</p>
                <p className="text-2xs text-muted">
                  {a.sizeKb >= 1024 ? `${(a.sizeKb / 1024).toFixed(1)} MB` : `${a.sizeKb} KB`} · {a.uploadedBy} · {timeAgo(a.at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
