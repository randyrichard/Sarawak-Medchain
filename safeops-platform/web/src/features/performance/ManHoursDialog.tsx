import { useEffect, useMemo, useState } from 'react'
import { performanceApi } from '@/api/performanceApi'
import { ApiError } from '@/api/types'
import { useAsync } from '@/lib/useAsync'
import { Button, Dialog, Loading, Select } from '@/components/ui'
import { formatHours, monthLabel, monthsOfYear, parseHours } from './lib'

/**
 * Recording the hours worked at each site, month by month.
 *
 * Every rate on the performance page divides by this figure, so it is entered as the
 * payroll or contractor timesheet total, not guessed. A month left blank falls back to the
 * headcount estimate - shown as the placeholder, so the person can see what they are
 * replacing - and clearing a recorded month returns it to the estimate.
 */
export function ManHoursDialog({
  open, companyId, onClose, onSaved,
}: {
  open: boolean
  companyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const now = new Date()
  const thisYear = now.getUTCFullYear()
  const latest = `${thisYear}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const [year, setYear] = useState(thisYear)
  const [siteId, setSiteId] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = useAsync((signal) => performanceApi.manHours(companyId, year, signal), [companyId, year, open], { enabled: open })
  const sites = state.data?.sites ?? []
  const site = sites.find((s) => s.siteId === siteId) ?? sites[0]
  const months = useMemo(() => monthsOfYear(year, latest), [year, latest])

  const recorded = useMemo(() => {
    const out: Record<string, string> = {}
    for (const m of site?.months ?? []) out[m.month] = formatHours(m.hours)
    return out
  }, [site])

  // A different site or year starts from what is stored for it.
  useEffect(() => { setDraft(recorded); setError(null) }, [recorded])

  const changed = months.filter((m) => (draft[m] ?? '').replace(/[,\s]/g, '') !== (recorded[m] ?? '').replace(/[,\s]/g, ''))
  const invalid = months.find((m) => !parseHours(draft[m] ?? '').ok)

  const save = async () => {
    if (!site || invalid) return
    setSaving(true)
    setError(null)
    try {
      for (const m of changed) {
        const parsed = parseHours(draft[m] ?? '')
        if (!parsed.ok) continue
        await performanceApi.setManHours({ companyId, siteId: site.siteId, month: m, hours: parsed.hours })
      }
      onSaved()
      onClose()
    } catch (e) {
      // Months before the failure are saved; reload so the form shows what actually stuck.
      state.reload()
      onSaved()
      setError(e instanceof ApiError ? e.message : 'Could not save the hours. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record Man-Hours"
      description="Total hours worked at the site each month, employees and contractors together - from payroll or timesheets. Leave a month blank to use the headcount estimate."
      width="max-w-lg"
      error={error}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!site || changed.length === 0 || !!invalid} onClick={() => void save()}>
            {changed.length > 1 ? `Save ${changed.length} months` : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Select label="Site" value={site?.siteId ?? ''} onChange={(e) => setSiteId(e.target.value)} disabled={sites.length === 0}>
          {sites.map((s) => <option key={s.siteId} value={s.siteId}>{s.siteName}</option>)}
        </Select>
        <Select label="Year" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </div>

      {state.status !== 'success' && !state.data ? (
        <Loading label="Loading recorded hours" />
      ) : !site ? (
        <p className="mt-4 text-sm text-ink-2">No sites in this workspace yet.</p>
      ) : (
        <>
          <p className="mt-3 text-2xs text-muted">
            Estimate: {site.headcount} workers × 195 h = {formatHours(site.estimatePerMonth)} h a month.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            {months.map((m) => {
              const bad = parseHours(draft[m] ?? '')
              return (
                <label key={m} className="block">
                  <span className="text-2xs font-semibold text-ink-2">{monthLabel(m)}</span>
                  <input
                    inputMode="numeric"
                    value={draft[m] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [m]: e.target.value }))}
                    placeholder={`est. ${formatHours(site.estimatePerMonth)}`}
                    aria-invalid={!bad.ok || undefined}
                    className="mt-0.5 h-9 coarse:h-11 w-full rounded-lg border bg-surface px-2.5 text-sm tabular-nums text-ink outline-none placeholder:text-muted focus:border-accent aria-[invalid=true]:border-[color:var(--critical)]"
                  />
                  {!bad.ok && <span className="mt-0.5 block text-2xs text-critical">{bad.error}</span>}
                </label>
              )
            })}
          </div>
        </>
      )}
    </Dialog>
  )
}
