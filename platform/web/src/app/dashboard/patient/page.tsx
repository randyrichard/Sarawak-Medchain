'use client';

/** Patient portal: view MC history, download PDFs, share verification links. */
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, PageLoading, statusTone, Table, Td } from '@/components/ui';
import { QrModal } from '@/components/qr-modal';
import { api, apiBlob } from '@/lib/api';

interface MC {
  id: string;
  mcNumber: string;
  restDays: number;
  startDate: string;
  endDate: string;
  dateIssued: string;
  status: string;
  doctorName: string;
  facilityName: string;
  verificationUrl: string;
  anchored: boolean;
}

export default function PatientDashboard() {
  const [mcs, setMcs] = useState<MC[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [qrTarget, setQrTarget] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<MC[]>('/api/v1/mcs')
      .then(setMcs)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const download = async (mc: MC) => {
    try {
      const blob = await apiBlob(`/api/v1/mcs/${mc.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mc.mcNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const share = async (mc: MC) => {
    await navigator.clipboard.writeText(mc.verificationUrl);
    setCopied(mc.id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      {!loaded && !error && <PageLoading />}
      <Card
        title="My medical certificates"
        description="Certificates issued to your IC number. Share the verification link with your employer — they see validity, never your diagnosis."
      >
        <Table headers={['MC No.', 'Rest period', 'Doctor', 'Facility', 'Status', 'Actions']}>
          {mcs.map((mc) => (
            <tr key={mc.id}>
              <Td className="font-mono text-xs font-medium">{mc.mcNumber}</Td>
              <Td>
                {mc.restDays} day(s) from {mc.startDate.slice(0, 10)}
              </Td>
              <Td>{mc.doctorName}</Td>
              <Td>{mc.facilityName}</Td>
              <Td>
                <Badge tone={statusTone(mc.status)}>{mc.status}</Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setQrTarget(mc.id)}>
                    Show QR
                  </Button>
                  <Button variant="outline" onClick={() => download(mc)}>
                    Download PDF
                  </Button>
                  <Button variant="outline" onClick={() => share(mc)}>
                    {copied === mc.id ? 'Link copied ✓' : 'Share link'}
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
          {mcs.length === 0 && (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-slate-400">
                No certificates yet. MCs issued to your IC will appear here automatically.
              </Td>
            </tr>
          )}
        </Table>
      </Card>
      {qrTarget && <QrModal mcId={qrTarget} onClose={() => setQrTarget(null)} />}
    </div>
  );
}
