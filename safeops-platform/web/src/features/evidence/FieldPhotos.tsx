import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { isBackendConfigured } from '@/api/authApi'
import { type EvidenceKind, type FieldEvidenceRow, fieldEvidenceApi } from '@/api/fieldEvidenceApi'
import { fmtDateTime } from '@/features/incidents/lib'

/**
 * The photos and documents stored against a record, with who added them and when.
 *
 * Images are fetched with the session (a plain <img src> cannot carry it) and shown from a
 * local object URL. Tapping one opens it full size in a new tab.
 */
export function FieldPhotos({
  kind, id, itemId, refreshKey = 0, empty,
}: {
  kind: EvidenceKind
  id: string
  /** Only the photos for this audit item. */
  itemId?: string
  refreshKey?: number
  /** Said when there are none; nothing is shown when omitted. */
  empty?: string
}) {
  const [rows, setRows] = useState<FieldEvidenceRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isBackendConfigured()) { setRows([]); return }
    let cancelled = false
    setFailed(false)
    fieldEvidenceApi.list(kind, id)
      .then((r) => { if (!cancelled) setRows(itemId ? r.filter((x) => x.auditItemId === itemId) : r) })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true) } })
    return () => { cancelled = true }
  }, [kind, id, itemId, refreshKey])

  if (failed) return <p className="text-2xs text-critical">Could not load the photos for this record.</p>
  if (!rows) return null
  if (rows.length === 0) return empty ? <p className="text-2xs text-muted">{empty}</p> : null
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photos">
      {rows.map((r) => <Thumb key={r.id} row={r} />)}
    </ul>
  )
}

function Thumb({ row }: { row: FieldEvidenceRow }) {
  const [url, setUrl] = useState<string | null>(null)
  const image = row.mimeType.startsWith('image/') && row.mimeType !== 'image/heic'
  useEffect(() => {
    if (!image) return
    let made: string | null = null
    let gone = false
    fieldEvidenceApi.file(row.id)
      .then((b) => {
        // Closed before the image arrived: make nothing, or the object URL is never freed.
        if (gone) return
        made = URL.createObjectURL(b); setUrl(made)
      })
      .catch(() => { if (!gone) setUrl(null) })
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [row.id, image])

  const open = async () => {
    // Opened before the fetch so a phone's popup blocker sees a tap, then pointed at the file.
    const w = window.open('', '_blank')
    try {
      const b = await fieldEvidenceApi.file(row.id)
      const u = URL.createObjectURL(b)
      if (w) w.location.href = u
      // Kept alive long enough for a phone to load it; Safari fails if revoked at once.
      setTimeout(() => URL.revokeObjectURL(u), 60_000)
    } catch {
      w?.close()
    }
  }

  return (
    <li>
      <button
        type="button" onClick={() => void open()}
        title={`${row.name} · ${row.uploadedBy} · ${fmtDateTime(row.createdAt)}`}
        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-sunken"
      >
        {url
          ? <img src={url} alt={row.name} className="h-full w-full object-cover" />
          : <span className="flex flex-col items-center gap-1 px-1 text-center text-2xs text-ink-2"><FileText size={16} aria-hidden />{row.name}</span>}
      </button>
      <p className="mt-0.5 truncate text-2xs text-muted">{row.uploadedBy}</p>
    </li>
  )
}
