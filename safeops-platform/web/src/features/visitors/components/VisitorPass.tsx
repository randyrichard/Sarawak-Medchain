import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { Printer } from 'lucide-react'
import type { Visitor } from '@/api/visitorsApi'
import { Button, Dialog } from '@/components/ui'
import { fmtDate, fmtDateTime } from '@/features/incidents/lib'
import { useSiteLabel } from '@/features/org/useSiteLabel'

/**
 * The printed visitor pass.
 *
 * The QR carries the opaque pass key rather than the visit number, so a photographed pass
 * cannot be used to guess at neighbouring visits by incrementing a digit. Scanning it opens
 * the profile, and that still requires a session - the pass identifies the visit, it does
 * not authorise anything.
 *
 * Always dark on white: this is printed and clipped to a lanyard, and a dark-mode pass
 * comes out of the printer as a black rectangle.
 */
export function VisitorPass({
  visitor, open, onClose,
}: {
  visitor: Visitor
  open: boolean
  onClose: () => void
}) {
  const siteLabel = useSiteLabel()
  const payload = `${window.location.origin}/visitors?pass=${encodeURIComponent(visitor.passKey)}`

  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(payload)
    qr.make()
    return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true })
  }, [payload])

  return (
    <Dialog open={open} onClose={onClose} title="Visitor Pass">
      <div className="space-y-3">
        {/*
          `print-pass` is targeted by the print stylesheet so the rest of the app is left
          out of the page. Reception prints these on a badge printer all day.
        */}
        <div id="print-pass" className="rounded-xl border-2 border-black bg-white p-4 text-black">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-2xs font-bold uppercase tracking-widest text-neutral-500">
                Visitor
              </p>
              <p className="truncate text-lg font-bold leading-tight">{visitor.name}</p>
              <p className="truncate text-xs text-neutral-600">
                {visitor.visitorCompany || 'No company stated'}
              </p>
            </div>
            <div
              className="h-24 w-24 shrink-0 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
              aria-label={`QR pass for ${visitor.code}`}
            />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-neutral-300 pt-3">
            <PassRow label="Pass" value={visitor.code} mono />
            <PassRow label="Badge" value={visitor.badgeNumber ?? '—'} mono />
            <PassRow label="Host" value={visitor.hostNameAtBooking || '—'} />
            <PassRow label="Site" value={siteLabel(visitor.siteId)} />
            <PassRow label="Visit date" value={fmtDate(visitor.expectedArrival)} />
            <PassRow label="Valid until" value={fmtDateTime(visitor.expectedDeparture)} />
            <PassRow label="Vehicle" value={visitor.vehicleNumber || '—'} mono />
            <PassRow label="Status" value={visitor.statusLabel} />
          </dl>

          <p className="mt-3 border-t border-neutral-300 pt-2 text-2xs leading-snug text-neutral-600">
            This pass must be worn visibly at all times and returned at the gate on
            departure. In an emergency, proceed to the nearest muster point and report to
            the warden.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button icon={<Printer size={13} />} onClick={() => window.print()}>Print</Button>
        </div>
      </div>
    </Dialog>
  )
}

function PassRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className={`truncate text-xs font-medium ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
