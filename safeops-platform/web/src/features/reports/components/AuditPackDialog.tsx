import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { reportsApi } from '@/api/reportsApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Button, Dialog, Input } from '@/components/ui'
import { saveBlob } from '@/lib/saveBlob'

/**
 * Exports the contractor HSE evidence pack.
 *
 * The period is asked for rather than assumed, and that is the whole reason this is a
 * dialog instead of a button that downloads immediately. An audit covers a stated period —
 * "March", "since the last visit" — and a pack that quietly covered "the last 30 days"
 * would be a document whose contents depend on the day somebody clicked Export. The period
 * is printed on the pack's cover, so the two always agree.
 *
 * Who may export is decided by the server (PACK_ROLES in api/src/lib/auditPack.ts). The
 * button is hidden from roles that cannot, so nobody is offered an action that will be
 * refused, but hiding it is a courtesy and not the control.
 */
export const canExportAuditPack = (role: string | null) =>
  ['admin', 'hse_manager', 'safety_officer', 'ceo'].includes(role ?? '')

/** yyyy-mm-dd for a date input, in the browser's own zone. */
const asInputDate = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const startOfLastMonth = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 1)
}
const endOfLastMonth = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 0)
}

export function AuditPackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { company, site } = useOrg()
  /*
   * Defaults to last calendar month, which is what an audit usually asks for, but they are
   * only defaults — both fields are editable and whatever is chosen is what the cover says.
   */
  const [from, setFrom] = useState(() => asInputDate(startOfLastMonth()))
  const [to, setTo] = useState(() => asInputDate(endOfLastMonth()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    // No workspace selected yet: nothing to scope a pack to. The button that opens this
    // dialog lives on pages that already have one, so this is a guard rather than a path.
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      /*
       * Whole days, local, then sent as instants. The "to" end is the last moment of the
       * chosen day: a pack for "1 to 31 March" that stopped at 00:00 on the 31st would
       * silently drop a day's permits, and nobody reading the cover would know.
       */
      const fromAt = new Date(`${from}T00:00:00`)
      const toAt = new Date(`${to}T23:59:59.999`)
      if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) {
        setError('Choose a start and end date for the audit period.')
        return
      }
      if (fromAt > toAt) {
        setError('The period starts after it ends.')
        return
      }

      const bytes = await reportsApi.auditPackPdf(company.id, {
        from: fromAt.toISOString(),
        to: toAt.toISOString(),
        // Scoped to whichever site the person is already looking at, so the pack matches
        // the screen they exported it from.
        ...(site?.id ? { siteId: site.id } : {}),
      })
      saveBlob(bytes, `hse-evidence-pack-${from}-to-${to}.pdf`)
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The pack could not be produced.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      error={error}
      title="Export HSE Evidence Pack"
      description="Permits, gas tests, hazard assessments, competency and incidents for a stated period, as one PDF."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button icon={<FileDown size={14} />} loading={busy} onClick={() => void run()}>
            Export PDF
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="date" label="Period from" value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date" label="Period to" value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <p className="text-2xs text-muted">
          {site?.name
            ? `Covers ${site.name} only, because that is the site currently selected.`
            : 'Covers every site in this workspace. Choose a site first to narrow it.'}
        </p>

        {/*
          Said here as well as on the document itself. Somebody exporting this for a client
          audit has to know what they are handing over before they hand it over — finding
          out from the auditor that it is not the form they expected is too late.
        */}
        <Alert tone="info">
          This is SafeChain&rsquo;s own evidence pack. It is not the PETRONAS Contractor HSE
          Guidelines audit form and not a DOSH/JKKP inspection form — it organises your records
          in the order an audit asks for them, and says so on its first page.
        </Alert>
      </div>
    </Dialog>
  )
}
