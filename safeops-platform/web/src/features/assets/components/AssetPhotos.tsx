import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Upload, Trash2, Download, X, FileText } from 'lucide-react'
import { equipmentApi, type AssetDocumentRow } from '@/api/equipmentApi'
import { ApiError } from '@/api/types'
import { Alert, Skeleton } from '@/components/ui'
import { fmtDate } from '@/features/incidents/lib'
import { cn } from '@/lib/cn'

/**
 * Photos, manuals and scanned certificates held against a piece of equipment.
 *
 * Files are fetched as blobs rather than linked: the endpoint needs an Authorization
 * header and re-checks workspace membership, so a stored filename grants nothing. The
 * thumbnails and the preview are object URLs built from those blobs, which also keeps a
 * crafted file out of the app's own origin.
 *
 * The allow-list and the size cap shown here are the server's; they are repeated in the
 * hint so somebody picking a file learns the rule before the upload fails, not after.
 */
const MAX_MB = 10
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf'

export function AssetPhotos({
  assetId, manage, onChanged,
}: {
  assetId: string
  manage: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<AssetDocumentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ row: AssetDocumentRow; url: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    equipmentApi.listDocuments(assetId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the files.')
      })
  }, [assetId])

  useEffect(() => { load() }, [load])

  const send = async (files: File[]) => {
    if (files.length === 0) return
    setError(null)

    // Checked here so the file is rejected before it goes over site wifi. The server
    // enforces the same rule; this is courtesy, not security.
    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024)
    if (tooBig) {
      setError(`${tooBig.name} is larger than ${MAX_MB} MB.`)
      return
    }

    setProgress(0)
    try {
      const kind = files.every((f) => f.type.startsWith('image/')) ? 'photo' : 'other'
      await equipmentApi.uploadDocuments(assetId, files, kind, setProgress)
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (row: AssetDocumentRow) => {
    setBusy(row.id)
    setError(null)
    try {
      await equipmentApi.deleteDocument(row.id)
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove that file.')
    } finally {
      setBusy(null)
    }
  }

  const download = async (row: AssetDocumentRow) => {
    setBusy(row.id)
    setError(null)
    try {
      const b = await equipmentApi.documentBlob(row.id)
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = row.name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not download that file.')
    } finally {
      setBusy(null)
    }
  }

  const open = async (row: AssetDocumentRow) => {
    if (!row.hasFile) return
    setBusy(row.id)
    try {
      const b = await equipmentApi.documentBlob(row.id)
      setPreview({ row, url: URL.createObjectURL(b) })
    } catch {
      setError('Could not open that file.')
    } finally {
      setBusy(null)
    }
  }

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  return (
    <section className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <ImageIcon size={12} /> Photos &amp; documents
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {rows === null ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          No photos or documents yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="overflow-hidden rounded-lg border">
              <Thumbnail row={r} onOpen={() => void open(r)} />
              <div className="px-2 py-1.5">
                <p className="truncate text-2xs text-ink" title={r.name}>{r.name}</p>
                <p className="text-2xs text-muted">
                  {fmtDate(r.createdAt)}
                  {r.sizeBytes ? ` · ${Math.max(1, Math.round(r.sizeBytes / 1024))} KB` : ''}
                </p>
                <div className="mt-1 flex gap-1">
                  {r.hasFile && (
                    <button
                      disabled={busy === r.id}
                      aria-label={`Download ${r.name}`}
                      onClick={() => void download(r)}
                      className="rounded p-1 text-muted hover:bg-accent-soft hover:text-accent"
                    >
                      <Download size={11} />
                    </button>
                  )}
                  {manage && (
                    <button
                      disabled={busy === r.id}
                      aria-label={`Delete ${r.name}`}
                      onClick={() => void remove(r)}
                      className="rounded p-1 text-muted hover:bg-accent-soft hover:text-critical"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {manage && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void send([...e.dataTransfer.files])
          }}
          className={cn(
            'mt-2 rounded-lg border border-dashed px-3 py-4 text-center transition',
            dragging && 'border-accent bg-accent-soft/40',
          )}
        >
          {progress === null ? (
            <>
              <p className="text-2xs text-muted">
                Drop photos here, or
                {' '}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="font-medium text-accent hover:underline"
                >
                  choose files
                </button>
              </p>
              <p className="mt-0.5 text-2xs text-muted">
                JPEG, PNG, WebP, HEIC or PDF · up to {MAX_MB} MB each
              </p>
            </>
          ) : (
            <div className="space-y-1">
              <p className="flex items-center justify-center gap-1.5 text-2xs text-ink">
                <Upload size={11} /> Uploading… {progress}%
              </p>
              {/* Real bytes-sent progress, not a spinner pretending. */}
              <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void send([...(e.target.files ?? [])])}
          />
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closePreview}
        >
          <div className="relative max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              aria-label="Close preview"
              onClick={closePreview}
              className="absolute -top-9 right-0 rounded-lg p-1.5 coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center coarse:-top-12 text-white hover:bg-white/20"
            >
              <X size={16} />
            </button>
            {preview.row.isImage ? (
              <img
                src={preview.url}
                alt={preview.row.name}
                className="max-h-[80vh] max-w-full rounded-lg object-contain"
              />
            ) : (
              // PDFs render from a blob URL, keeping a crafted document out of this origin.
              <iframe
                src={preview.url}
                title={preview.row.name}
                className="h-[80vh] w-[80vw] max-w-3xl rounded-lg bg-white"
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** An image thumbnail from the authorised blob, or a document glyph. */
function Thumbnail({ row, onOpen }: { row: AssetDocumentRow; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!row.isImage || !row.hasFile) return
    let objectUrl: string | null = null
    let cancelled = false
    equipmentApi.documentBlob(row.id)
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b)
        setUrl(objectUrl)
      })
      .catch(() => { /* the row still renders, without a thumbnail */ })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [row.id, row.isImage, row.hasFile])

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!row.hasFile}
      className="flex h-24 w-full items-center justify-center bg-accent-soft/40 disabled:cursor-default"
    >
      {url ? (
        <img src={url} alt={row.name} className="h-full w-full object-cover" />
      ) : row.isImage && row.hasFile ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <FileText size={20} className="text-muted" />
      )}
    </button>
  )
}
