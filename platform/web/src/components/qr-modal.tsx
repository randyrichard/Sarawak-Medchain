'use client';

/** On-screen QR modal — the demo moment: scan straight off the screen with
 *  any phone camera and land on the public verification page. */
import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { api } from '@/lib/api';

interface QrResponse {
  mcNumber: string;
  verificationUrl: string;
  qrDataUrl: string;
}

export function QrModal({ mcId, onClose }: { mcId: string; onClose: () => void }) {
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<QrResponse>(`/api/v1/mcs/${mcId}/qr`).then(setQr).catch((e) => setError(e.message));
  }, [mcId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Card title={qr ? `Scan to verify ${qr.mcNumber}` : 'Loading QR…'} className="w-full max-w-sm">
          {error && <p className="py-4 text-center text-sm text-red-600">{error}</p>}
          {qr && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr.qrDataUrl}
                alt={`Verification QR code for ${qr.mcNumber}`}
                className="mx-auto rounded-lg"
                width={320}
                height={320}
              />
              <p className="mt-2 text-center text-xs text-slate-400">
                Any phone camera works — no app needed. Opens the public verification
                page with signature and blockchain checks.
              </p>
              <a
                href={qr.verificationUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block break-all text-center text-xs text-brand-700 hover:underline dark:text-brand-400"
              >
                {qr.verificationUrl}
              </a>
            </>
          )}
          <div className="mt-4 text-center">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
