'use client';

/** Security settings: enable TOTP two-factor authentication. */
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Alert, Button, Card, Input, Label } from '@/components/ui';
import { api } from '@/lib/api';

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

export default function SecurityPage() {
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setError(null);
    setBusy(true);
    try {
      setSetup(await api<SetupResponse>('/api/v1/auth/2fa/setup', { method: 'POST' }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/v1/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setEnabled(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card
        title="Two-factor authentication"
        description="Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, etc.) to every login."
      >
        {enabled ? (
          <div className="py-6 text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-green-600" aria-hidden />
            <p className="mt-3 font-semibold">Two-factor authentication is now active.</p>
            <p className="mt-1 text-sm text-slate-500">
              From your next login you will be asked for a code from your authenticator app.
            </p>
          </div>
        ) : setup ? (
          <form onSubmit={enable} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              1. Scan this QR code with your authenticator app:
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qrDataUrl}
              alt="TOTP setup QR code"
              className="mx-auto rounded-lg border border-slate-200 dark:border-slate-700"
              width={240}
              height={240}
            />
            <p className="text-center font-mono text-xs text-slate-400">
              Manual key: {setup.secret}
            </p>
            <div>
              <Label htmlFor="code">2. Enter the 6-digit code shown in the app</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? '…' : 'Verify & enable 2FA'}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Recommended for all accounts, and strongly recommended for doctors and
              administrators — a stolen password alone will no longer be enough to
              access your account.
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            <Button onClick={startSetup} disabled={busy} className="w-full">
              {busy ? '…' : 'Set up two-factor authentication'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
