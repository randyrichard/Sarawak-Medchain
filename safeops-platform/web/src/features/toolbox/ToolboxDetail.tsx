import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toolboxApi, type ToolboxMeeting } from '@/api/toolboxApi'
import { ApiError } from '@/api/types'
import { fmtDateTime } from '@/features/incidents/lib'
import { Button, Dialog } from '@/components/ui'

/** One meeting, as it would be read out to an auditor. */
export function ToolboxDetail({
  companyId, meeting, canEdit, canDelete, onClose, onEdit, onDeleted,
}: {
  companyId: string
  meeting: ToolboxMeeting
  canEdit: boolean
  canDelete: boolean
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await toolboxApi.remove(companyId, meeting.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete the meeting.')
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open
      onClose={onClose}
      title={meeting.topic}
      description={`${meeting.number} · ${meeting.site?.name ?? ''} · ${fmtDateTime(meeting.heldAt)}`}
      width="max-w-xl"
      footer={
        <>
          {canDelete && (confirming ? (
            <>
              <span className="mr-auto self-center text-xs text-critical">Delete this record permanently?</span>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Keep it</Button>
              <Button variant="danger" onClick={remove} loading={busy}>Delete</Button>
            </>
          ) : (
            <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => setConfirming(true)} className="mr-auto">
              Delete
            </Button>
          ))}
          {!confirming && canEdit && <Button variant="secondary" icon={<Pencil size={14} />} onClick={onEdit}>Edit</Button>}
          {!confirming && <Button onClick={onClose}>Close</Button>}
        </>
      }
    >
      <div className="space-y-4 text-sm">

        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">Led by</dt><dd className="text-ink">{meeting.ledBy}</dd>
          <dt className="text-muted">Recorded by</dt><dd className="text-ink">{meeting.recordedBy}</dd>
          <dt className="text-muted">Total present</dt>
          <dd className="font-semibold text-ink">{meeting.headcount.toLocaleString()}</dd>
        </dl>

        <section>
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Attendance</h3>
          <ul className="divide-y rounded-lg border">
            {meeting.groups.map((g) => (
              <li key={g.id ?? g.organisation} className="flex justify-between px-3 py-1.5">
                <span className="text-ink">{g.organisation}</span>
                <span className="font-medium tabular-nums text-ink">{g.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>

        {meeting.hazards && (
          <section>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Hazards and controls discussed</h3>
            <p className="whitespace-pre-wrap text-ink">{meeting.hazards}</p>
          </section>
        )}
        {meeting.notes && (
          <section>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Notes</h3>
            <p className="whitespace-pre-wrap text-ink">{meeting.notes}</p>
          </section>
        )}
      </div>
    </Dialog>
  )
}
