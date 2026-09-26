import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { blob, request } from '@/api/http'
import type { ReportData } from '@/api/reportsApi'
import { ApiError } from '@/api/types'
import { ReportSectionView } from '@/features/reports/components/ReportSectionView'
import { Alert, Button, Dialog, Skeleton } from '@/components/ui'

/**
 * The one-page incident summary: the facts, people, investigation and actions, written from
 * the record for a client or management. The same page downloads as a PDF.
 */
export function IncidentSummaryDialog({ incidentId, number, onClose }: {
  incidentId: string
  number: string
  onClose: () => void
}) {
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    request<ReportData>(`/incidents/${incidentId}/summary`)
      .then((d) => { if (live) setData(d) })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not build the summary.') })
    return () => { live = false }
  }, [incidentId])

  const download = async () => {
    try {
      const b = await blob(`/incidents/${incidentId}/summary.pdf`)
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = `incident-summary-${number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not download the summary.')
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Incident summary - ${number}`}
      description="Written from the record: every line comes from a field on this incident."
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" icon={<Download size={13} />} onClick={() => void download()} disabled={!data}>Download PDF</Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {error && <Alert tone="critical">{error}</Alert>}
      {!data && !error && <Skeleton className="h-64" />}
      {data && (
        <div>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.summary.map((s) => (
              <div key={s.label}>
                <p className="text-2xs uppercase tracking-wide text-muted">{s.label}</p>
                <p className={`text-xl font-bold ${/overdue/i.test(s.label) && s.value !== '0' ? 'text-critical' : 'text-ink'}`}>{s.value}</p>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs">
            {data.rows.map((r) => (
              <div key={r.k} className="contents">
                <dt className="text-muted">{r.k}</dt>
                <dd className="text-ink">{r.v}</dd>
              </div>
            ))}
          </dl>
          {data.sections?.filter((s) => !s.writeIn).map((s) => <ReportSectionView key={s.title} section={s} />)}
        </div>
      )}
    </Dialog>
  )
}
