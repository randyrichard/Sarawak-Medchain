import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** Real, scannable QR label. Payload is the asset deep link — scanning a
 *  printed label on a phone opens the asset profile. Always dark-on-white,
 *  as a printed label would be. */
export function QrBlock({ qrKey }: { qrKey: string }) {
  const payload = `${window.location.origin}/assets?qr=${encodeURIComponent(qrKey)}`
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(payload)
    qr.make()
    return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true })
  }, [payload])

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
      <div
        className="h-24 w-24 shrink-0 [&_svg]:h-full [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
        aria-label={`QR code for ${qrKey}`}
      />
      <div className="min-w-0">
        <p className="font-mono text-sm font-bold text-black">{qrKey}</p>
        <p className="mt-0.5 break-all text-2xs leading-snug text-neutral-500">{payload}</p>
        <p className="mt-1 text-2xs text-neutral-500">Scan to open profile, history & defects.</p>
      </div>
    </div>
  )
}
