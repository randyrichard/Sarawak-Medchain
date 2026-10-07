import { useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, Trash2, Download, FileText, Image as ImageIcon } from 'lucide-react'
import {
  permitWorkflowApi, ATTACHMENT_KIND_LABEL, type AttachmentKind, type PermitAttachment,
} from '@/api/permitWorkflowApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Dialog, Select, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { saveBlob } from '@/lib/saveBlob'

/**
 * The permit's document pack: method statement, JSA, gas test sheet, isolation
 * certificate and site photos.
 *
 * Files are fetched as blobs rather than linked directly, because the endpoint requires
 * an Authorization header and re-checks membership on every request — a stored filename
 * grants nothing on its own. That also means previews and downloads both come from one
 * fetch, and object URLs are revoked when the preview closes.
 */

const KINDS: AttachmentKind[] = [
  'method_statement', 'jsa', 'gas_test_sheet', 'isolation_certificate', 'photo', 'other',
]

const MAX_BYTES = 10 * 1024 * 1024

const prettySize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

export function AttachmentsPanel({
  permitId, canEdit, canRemove, onChanged,
}: {
  permitId: string
  canEdit: boolean
  /** Removing a document is a safety step (see canOperatePermits); adding one is not. */
  canRemove: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<PermitAttachment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<AttachmentKind>('method_statement')
  const [progress, setProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<{ att: PermitAttachment; url: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    permitWorkflowApi.listAttachments(permitId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the documents.')
      })
  }, [permitId])

  useEffect(() => { load() }, [load])

  // An object URL is a live handle on a blob; leaving them behind leaks the file's memory
  // for as long as the tab is open.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])

  const send = async (files: File[]) => {
    if (files.length === 0) return
    const tooBig = files.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      setError(`${tooBig.name} is ${prettySize(tooBig.size)}. The limit is 10 MB per file.`)
      return
    }

    setError(null)
    setProgress(0)
    try {
      await permitWorkflowApi.upload(permitId, files, kind, setProgress)
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const open = async (att: PermitAttachment) => {
    setError(null)
    try {
      const blob = await permitWorkflowApi.fetchBlob(att.id)
      setPreview({ att, url: URL.createObjectURL(blob) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that file.')
    }
  }

  const download = async (att: PermitAttachment) => {
    setError(null)
    try {
      const blob = await permitWorkflowApi.fetchBlob(att.id)
      saveBlob(blob, att.originalName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download that file.')
    }
  }

  const remove = async (att: PermitAttachment) => {
    const previous = rows
    setRows((rs) => rs?.filter((r) => r.id !== att.id) ?? rs)
    try {
      await permitWorkflowApi.removeAttachment(att.id)
      onChanged?.()
    } catch (e) {
      setRows(previous)
      setError(e instanceof ApiError ? e.message : 'Could not remove that document.')
    }
  }

  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <Paperclip size={12} /> Documents
        {rows && rows.length > 0 && <span className="text-muted">({rows.length})</span>}
      </p>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

      {canEdit && (
        <div className="mb-2.5 space-y-2">
          <Select
            aria-label="Document type" value={kind}
            onChange={(e) => setKind(e.target.value as AttachmentKind)}
          >
            {KINDS.map((k) => <option key={k} value={k}>{ATTACHMENT_KIND_LABEL[k]}</option>)}
          </Select>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void send([...e.dataTransfer.files])
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-grid hover:border-accent/60',
            )}
          >
            <Upload size={17} className={cn('mx-auto mb-1.5', dragging ? 'text-accent' : 'text-muted')} />
            <p className="text-sm text-ink-2">
              Drop files here, or <span className="font-semibold text-accent">browse</span>
            </p>
            <p className="mt-0.5 text-2xs text-muted">JPEG, PNG, WebP, HEIC or PDF · up to 10 MB · 5 at a time</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="hidden"
              onChange={(e) => void send([...(e.target.files ?? [])])}
            />
          </div>

          {progress !== null && (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-2xs text-muted">Uploading… {progress}%</p>
            </div>
          )}
        </div>
      )}

      {rows === null ? (
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
          No documents attached. A permit pack usually carries the method statement and the
          risk assessment at minimum.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((a) => {
            const isImage = a.mimeType.startsWith('image/')
            const Icon = isImage ? ImageIcon : FileText
            return (
              <li key={a.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                <Icon size={15} className="shrink-0 text-muted" />
                <button
                  onClick={() => void open(a)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm text-ink hover:underline">{a.originalName}</p>
                  <p className="truncate text-2xs text-muted">
                    {ATTACHMENT_KIND_LABEL[a.kind]} · {prettySize(a.sizeBytes)} · {a.uploadedBy}
                    {' · '}{new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </button>
                <button
                  onClick={() => void download(a)}
                  aria-label={`Download ${a.originalName}`}
                  className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink"
                >
                  <Download size={13} />
                </button>
                {canRemove && (
                  <button
                    onClick={() => void remove(a)}
                    aria-label={`Remove ${a.originalName}`}
                    className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.att.originalName ?? ''}
        description={preview ? `${ATTACHMENT_KIND_LABEL[preview.att.kind]} · uploaded by ${preview.att.uploadedBy}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>
            {preview && (
              <Button icon={<Download size={13} />} onClick={() => void download(preview.att)}>
                Download
              </Button>
            )}
          </>
        }
      >
        {preview && (
          preview.att.mimeType.startsWith('image/') ? (
            <img
              src={preview.url}
              alt={preview.att.originalName}
              className="mx-auto max-h-[60vh] w-auto rounded-lg border"
            />
          ) : (
            // A blob: URL keeps the PDF out of the app's own origin, so a crafted document
            // cannot script against the session.
            <iframe
              src={preview.url}
              title={preview.att.originalName}
              className="h-[60vh] w-full rounded-lg border"
            />
          )
        )}
      </Dialog>
    </section>
  )
}
