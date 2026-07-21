import { useState } from 'react'
import { CalendarPlus, FileCheck2 } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { ObligationView } from '@/api/audits'
import type { Site } from '@/api/types'
import { useActor } from '@/features/incidents/lib'
import { Alert, Avatar, Badge, Button, Card, Dialog, Input, Skeleton, StatusPill, Textarea } from '@/components/ui'
import { cn } from '@/lib/cn'

const STATUS_KIND = { Compliant: 'good', 'Expiring Soon': 'warning', Overdue: 'critical' } as const

/** Every legal & certification obligation, sorted by urgency. */
export function ComplianceRegister({
  obligations, manage, sites, onChanged,
}: {
  obligations: ObligationView[] | null
  manage: boolean
  sites: Site[]
  onChanged: () => void
}) {
  const actor = useActor()
  const [renewFor, setRenewFor] = useState<ObligationView | null>(null)
  const [nextDue, setNextDue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const siteShort = (id: string | null) => (id ? sites.find((s) => s.id === id)?.short ?? id.toUpperCase() : 'Org-wide')

  const renew = async () => {
    if (!renewFor) return
    setBusy(true)
    setError(null)
    try {
      await api.renewObligation(renewFor.id, nextDue, note, actor)
      setRenewFor(null)
      setNote('')
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Renewal failed.')
    } finally {
      setBusy(false)
    }
  }

  if (obligations === null) {
    return <Card className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</Card>
  }

  return (
    <>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-semibold">Regulation / Requirement</th>
                <th className="px-3 py-2.5 font-semibold">Responsible</th>
                <th className="px-3 py-2.5 font-semibold">Scope</th>
                <th className="px-3 py-2.5 font-semibold">Next due</th>
                <th className="px-3 py-2.5 font-semibold">Evidence</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {obligations.map((o) => (
                <tr key={o.id} className={cn('border-b last:border-0', o.status === 'Overdue' && 'bg-critical-soft/40')}>
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold leading-snug text-ink">{o.requirement}</p>
                    <p className="mt-0.5 text-2xs text-muted">{o.regulation}{o.notes ? ` — ${o.notes}` : ''}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-ink-2">
                      <Avatar name={o.responsible} size={18} /> {o.responsible}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-2">{siteShort(o.siteId)}</td>
                  <td className={cn('px-3 py-3 text-xs font-semibold', o.status === 'Overdue' ? 'text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {o.nextDue}
                    <span className="block text-2xs font-normal">
                      {o.daysToDue < 0 ? `${Math.abs(o.daysToDue)}d overdue` : o.daysToDue === 0 ? 'due today' : `in ${o.daysToDue}d`}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {o.evidenceDoc ? (
                      <Badge tone="accent" className="gap-1"><FileCheck2 size={10} /> {o.evidenceDoc}</Badge>
                    ) : (
                      <span className="text-2xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <StatusPill kind={STATUS_KIND[o.status]} label={o.status} />
                      {manage && (
                        <Button size="sm" variant="ghost" icon={<CalendarPlus size={12} />}
                          onClick={() => { setError(null); setRenewFor(o); setNextDue(''); setNote('') }}>
                          Renew
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={renewFor !== null}
        onClose={() => setRenewFor(null)}
        title={`Renew: ${renewFor?.requirement ?? ''}`}
        description={renewFor?.regulation}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewFor(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => void renew()}>Record renewal</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="critical">{error}</Alert>}
          <Input label="New due / expiry date" required type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          <Textarea label="Note (evidence reference)" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Renewed certificate filed as PMT-4/2027 in Documents…" />
        </div>
      </Dialog>
    </>
  )
}
