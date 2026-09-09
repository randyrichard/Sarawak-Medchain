import { useEffect, useState } from 'react'
import {
  TIMEZONES, WEEKDAYS, reportsApi,
  type ReportFrequency, type ReportRecipient, type ReportSchedule, type ReportType,
} from '@/api/reportsApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Button, Dialog, Input, Select, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * Creating or editing a schedule.
 *
 * Deliberately shaped as a sentence — "send the overdue actions report every Monday at
 * 08:00 Asia/Kuching to these people" — rather than as the database columns underneath it.
 * The timezone is asked for explicitly and defaults to Kuching, because a report set up by
 * somebody in Sarawak and delivered on UTC arrives eight hours early.
 */
export function ScheduleDialog({
  open, editing, onClose, onSaved,
}: {
  open: boolean
  editing: ReportSchedule | null
  onClose: () => void
  onSaved: () => void
}) {
  const { company, sites } = useOrg()

  const [name, setName] = useState('')
  const [reportType, setReportType] = useState<ReportType>('overdue_actions')
  const [frequency, setFrequency] = useState<ReportFrequency>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [timeOfDay, setTimeOfDay] = useState('08:00')
  const [timezone, setTimezone] = useState('Asia/Kuching')
  const [siteId, setSiteId] = useState('')
  const [chosen, setChosen] = useState<string[]>([])

  const [people, setPeople] = useState<ReportRecipient[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !company) return
    setError(null)

    if (editing) {
      setName(editing.name)
      setReportType(editing.reportType)
      setFrequency(editing.frequency)
      setDayOfWeek(editing.dayOfWeek)
      setTimeOfDay(editing.timeOfDay)
      setTimezone(editing.timezone)
      setSiteId(editing.siteId ?? '')
      setChosen(editing.recipientUserIds)
    } else {
      // The preset the product is actually for.
      setName('Monday morning safety report')
      setReportType('overdue_actions')
      setFrequency('weekly')
      setDayOfWeek(1)
      setTimeOfDay('08:00')
      setTimezone('Asia/Kuching')
      setSiteId('')
      setChosen([])
    }

    setPeople(null)
    reportsApi.recipients(company.id)
      .then(setPeople)
      .catch((e) => {
        setPeople([])
        // Said out loud: an empty picker otherwise reads as "nobody works here".
        setError(e instanceof ApiError ? e.message : 'Could not load the list of people.')
      })
  }, [open, company, editing])

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      if (editing) {
        await reportsApi.updateSchedule(editing.id, {
          name, frequency, dayOfWeek, timeOfDay, timezone,
          recipientUserIds: chosen, siteId: siteId || null,
        })
      } else {
        await reportsApi.createSchedule({
          companyId: company.id, name, reportType, frequency, dayOfWeek,
          timeOfDay, timezone, recipientUserIds: chosen, siteId: siteId || null,
        })
      }
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that schedule.')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (userId: string) =>
    setChosen((c) => (c.includes(userId) ? c.filter((x) => x !== userId) : [...c, userId]))

  const sentence = frequency === 'daily'
    ? `Every day at ${timeOfDay} ${timezone}`
    : frequency === 'monthly'
      ? `On the 1st of each month at ${timeOfDay} ${timezone}`
      : `Every ${WEEKDAYS.find((d) => d.value === dayOfWeek)?.label ?? 'Monday'} at ${timeOfDay} ${timezone}`

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'Schedule a report'}
      description="Generated from live data at the moment it runs."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}
            disabled={!name.trim() || chosen.length === 0}>
            {editing ? 'Save changes' : 'Create schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />

        <Select
          label="Report"
          value={reportType}
          disabled={!!editing}
          onChange={(e) => setReportType(e.target.value as ReportType)}
          hint={editing ? 'The report type cannot be changed; create a new schedule instead.' : undefined}
        >
          <option value="overdue_actions">Overdue corrective actions</option>
          <option value="open_investigations">Open investigations</option>
          <option value="monthly_summary">Monthly safety summary</option>
        </Select>

        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="How often" value={frequency}
            onChange={(e) => setFrequency(e.target.value as ReportFrequency)}>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </Select>
          <Select label="Day" value={dayOfWeek} disabled={frequency !== 'weekly'}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}>
            {WEEKDAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
          <Input label="Time" type="time" value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)} />
        </div>

        <Select label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}
          hint="The delivery time is local to this zone.">
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </Select>

        <Select label="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)}
          hint="Leave as all sites for a whole-company report.">
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>

        <div>
          <p className="mb-1 text-xs font-medium text-ink">
            Recipients <span className="text-critical">*</span>
          </p>
          {people === null ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : people.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-2xs text-muted">
              Nobody in this workspace can be addressed.
            </p>
          ) : (
            // Only members of this workspace are listed, and the server checks again on
            // save — a report is the whole safety picture and must not leave the tenant.
            <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1.5">
              {people.map((p) => (
                <li key={p.userId}>
                  <label className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-2xs hover:bg-accent-soft/40',
                    chosen.includes(p.userId) && 'bg-accent-soft/60',
                  )}>
                    <input type="checkbox" checked={chosen.includes(p.userId)}
                      onChange={() => toggle(p.userId)} />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink">{p.name}</span>
                      <span className="block truncate text-muted">{p.email}</span>
                    </span>
                    <span className="shrink-0 text-muted">{p.role.replace(/_/g, ' ')}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="rounded-lg border border-dashed px-3 py-2 text-2xs text-muted">
          <span className="font-medium text-ink">{sentence}</span>
          {chosen.length > 0 && <> to {chosen.length} recipient{chosen.length === 1 ? '' : 's'}.</>}
        </p>
      </div>
    </Dialog>
  )
}
