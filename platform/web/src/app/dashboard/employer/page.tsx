'use client';

/** Employer portal: single + bulk verification and HR API-key management. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, Input, Label, statusTone, Table, Td } from '@/components/ui';
import { api } from '@/lib/api';

interface ApiKey {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface VerificationRow {
  hash: string;
  result: string;
  mc?: { mcNumber: string; patientName: string; startDate: string; endDate: string };
}

export default function EmployerDashboard() {
  const router = useRouter();
  const [hash, setHash] = useState('');
  const [history, setHistory] = useState<VerificationRow[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = () => api<ApiKey[]>('/api/v1/api-keys').then(setKeys).catch(() => {});
  useEffect(() => {
    loadKeys();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = hash.trim();
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(clean)) {
      setError('Certificate hash must be 64 hex characters');
      return;
    }
    setError(null);
    try {
      const outcome = await api<{ result: string; mc?: VerificationRow['mc'] }>(
        `/api/v1/verify/${clean}`
      );
      setHistory((prev) => [{ hash: clean, result: outcome.result, mc: outcome.mc }, ...prev].slice(0, 20));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createKey = async () => {
    try {
      const res = await api<{ apiKey: string }>('/api/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName }),
      });
      setCreatedKey(res.apiKey);
      setNewKeyName('');
      loadKeys();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="Verify a certificate"
        description="Scan the QR on the MC with any camera (it opens the public verify page), or paste the hash here."
      >
        <form onSubmit={verify} className="flex gap-2">
          <Input
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="0x…"
            aria-label="Certificate hash"
            spellCheck={false}
          />
          <Button type="submit">Verify</Button>
        </form>
        {error && (
          <div className="mt-3">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="mt-4">
          <Table headers={['Result', 'MC No.', 'Patient', 'Period', 'Details']}>
            {history.map((h, i) => (
              <tr key={`${h.hash}-${i}`}>
                <Td>
                  <Badge tone={statusTone(h.result)}>{h.result}</Badge>
                </Td>
                <Td className="font-mono text-xs">{h.mc?.mcNumber ?? '—'}</Td>
                <Td>{h.mc?.patientName ?? '—'}</Td>
                <Td className="text-xs">
                  {h.mc ? `${h.mc.startDate.slice(0, 10)} → ${h.mc.endDate.slice(0, 10)}` : '—'}
                </Td>
                <Td>
                  <Button variant="ghost" onClick={() => router.push(`/verify/${h.hash}`)}>
                    Full report ↗
                  </Button>
                </Td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-slate-400">
                  Verifications this session will appear here
                </Td>
              </tr>
            )}
          </Table>
        </div>
      </Card>

      <Card
        title="HR system integration"
        description="Create API keys for your HR software to bulk-verify MCs (POST /api/v1/verify/bulk, up to 100 hashes per call)."
      >
        <div className="flex gap-2">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name, e.g. SAP-HR-Production"
            aria-label="API key name"
          />
          <Button onClick={createKey} disabled={newKeyName.length < 2}>
            Create key
          </Button>
        </div>
        {createdKey && (
          <div className="mt-3">
            <Alert tone="success">
              <p className="font-semibold">Copy this key now — it is shown only once:</p>
              <code className="mt-1 block break-all rounded bg-white/60 p-2 font-mono text-xs dark:bg-black/30">
                {createdKey}
              </code>
            </Alert>
          </div>
        )}
        <div className="mt-4">
          <Table headers={['Name', 'Created', 'Last used', 'Actions']}>
            {keys.map((k) => (
              <tr key={k.id}>
                <Td className="font-medium">{k.name}</Td>
                <Td className="text-xs">{new Date(k.createdAt).toLocaleDateString()}</Td>
                <Td className="text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'never'}</Td>
                <Td>
                  <Button
                    variant="danger"
                    onClick={() =>
                      api(`/api/v1/api-keys/${k.id}/revoke`, { method: 'POST' }).then(loadKeys)
                    }
                  >
                    Revoke
                  </Button>
                </Td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <Td colSpan={4} className="py-8 text-center text-slate-400">
                  No API keys yet
                </Td>
              </tr>
            )}
          </Table>
        </div>
      </Card>
    </div>
  );
}
