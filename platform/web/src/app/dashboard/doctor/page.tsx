'use client';

/** Doctor portal: issue digitally signed MCs, view history, revoke/amend. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Label, statusTone, Table, Td } from '@/components/ui';
import { QrModal } from '@/components/qr-modal';
import { api, apiBlob } from '@/lib/api';

interface MC {
  id: string;
  mcNumber: string;
  patientName: string;
  restDays: number;
  startDate: string;
  endDate: string;
  dateIssued: string;
  status: string;
  canonicalHash: string;
  anchored: boolean;
  chainTxHash: string | null;
  verificationUrl: string;
}

const emptyForm = {
  patientName: '',
  patientIc: '',
  diagnosis: '',
  restDays: 1,
  startDate: new Date().toISOString().slice(0, 10),
};

interface McPage {
  items: MC[];
  nextCursor: string | null;
}

export default function DoctorDashboard() {
  const [mcs, setMcs] = useState<MC[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<MC | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [qrTarget, setQrTarget] = useState<MC | null>(null);

  const load = useCallback(() => {
    api<McPage>('/api/v1/mcs?take=25')
      .then((p) => {
        setMcs(p.items);
        setNextCursor(p.nextCursor);
      })
      .catch((e) => setError(e.message));
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    api<McPage>(`/api/v1/mcs?take=25&cursor=${nextCursor}`)
      .then((p) => {
        setMcs((prev) => [...prev, ...p.items]);
        setNextCursor(p.nextCursor);
      })
      .catch((e) => setError(e.message));
  }, [nextCursor]);

  useEffect(load, [load]);

  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const mc = await api<MC>('/api/v1/mcs', {
        method: 'POST',
        body: JSON.stringify({
          patientName: form.patientName,
          patientIc: form.patientIc,
          diagnosis: form.diagnosis || undefined,
          restDays: Number(form.restDays),
          startDate: form.startDate,
        }),
      });
      setSuccess(
        `${mc.mcNumber} issued and digitally signed${mc.anchored ? ' — fingerprint anchored on-chain' : ''}.`
      );
      setForm(emptyForm);
      load();
    } catch (err) {
      const apiErr = err as Error & { details?: string[] };
      setError(apiErr.details?.length ? `${apiErr.message}: ${apiErr.details.join('; ')}` : apiErr.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    try {
      await api(`/api/v1/mcs/${revokeTarget.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: revokeReason }),
      });
      setRevokeTarget(null);
      setRevokeReason('');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const download = async (mc: MC) => {
    const blob = await apiBlob(`/api/v1/mcs/${mc.id}/pdf`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mc.mcNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card
        title="Issue a medical certificate"
        description="Signed with your registered key and anchored on-chain at issuance."
        className="lg:col-span-1"
      >
        <form onSubmit={issue} className="space-y-4">
          <div>
            <Label htmlFor="patientName">Patient full name (as per IC)</Label>
            <Input
              id="patientName"
              value={form.patientName}
              onChange={(e) => setForm({ ...form, patientName: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="patientIc">IC / Passport number</Label>
            <Input
              id="patientIc"
              value={form.patientIc}
              onChange={(e) => setForm({ ...form, patientIc: e.target.value })}
              placeholder="990101-13-5678"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="restDays">Rest days</Label>
              <Input
                id="restDays"
                type="number"
                min={1}
                max={60}
                value={form.restDays}
                onChange={(e) => setForm({ ...form, restDays: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="diagnosis">Diagnosis (confidential — never shown at verification)</Label>
            <Input
              id="diagnosis"
              value={form.diagnosis}
              onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              placeholder="Optional"
            />
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing & anchoring…' : 'Issue & digitally sign'}
          </Button>
        </form>
      </Card>

      <Card title="Issued certificates" className="lg:col-span-2">
        <Table headers={['MC No.', 'Patient', 'Rest', 'Issued', 'Status', 'Anchor', 'Actions']}>
          {mcs.map((mc) => (
            <tr key={mc.id}>
              <Td className="font-mono text-xs font-medium">{mc.mcNumber}</Td>
              <Td>{mc.patientName}</Td>
              <Td>
                {mc.restDays}d ({mc.startDate.slice(0, 10)})
              </Td>
              <Td className="text-xs">{new Date(mc.dateIssued).toLocaleDateString()}</Td>
              <Td>
                <Badge tone={statusTone(mc.status)}>{mc.status}</Badge>
              </Td>
              <Td>
                <Badge tone={mc.anchored ? 'teal' : 'amber'}>{mc.anchored ? 'ON-CHAIN' : 'DEMO'}</Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setQrTarget(mc)}>
                    QR
                  </Button>
                  <Button variant="outline" onClick={() => download(mc)}>
                    PDF
                  </Button>
                  <a href={mc.verificationUrl} target="_blank" rel="noreferrer">
                    <Button variant="ghost">Verify ↗</Button>
                  </a>
                  {mc.status === 'ACTIVE' && (
                    <Button variant="danger" onClick={() => setRevokeTarget(mc)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
          {mcs.length === 0 && (
            <tr>
              <Td colSpan={7} className="py-8 text-center text-slate-400">
                No certificates issued yet
              </Td>
            </tr>
          )}
        </Table>
        {nextCursor && (
          <div className="mt-4 text-center">
            <Button variant="outline" onClick={loadMore}>
              Load more
            </Button>
          </div>
        )}
      </Card>

      {qrTarget && <QrModal mcId={qrTarget.id} onClose={() => setQrTarget(null)} />}

      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal>
          <Card title={`Revoke ${revokeTarget.mcNumber}`} className="w-full max-w-md">
            <p className="mb-3 text-sm text-slate-500">
              Revocation is permanent and immediately visible to anyone verifying this MC.
            </p>
            <Label htmlFor="revokeReason">Reason (recorded in the audit trail)</Label>
            <Input
              id="revokeReason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. Issued in error"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRevokeTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={revoke} disabled={revokeReason.length < 3}>
                Revoke certificate
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
