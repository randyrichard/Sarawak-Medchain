'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Alert, Button, Card, Input } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function VerifyEntryPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [hash, setHash] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = hash.trim();
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(clean)) {
      setError('That does not look like a certificate hash (64 hex characters).');
      return;
    }
    router.push(`/verify/${clean.startsWith('0x') ? clean : `0x${clean}`}`);
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-16">
        <div className="mb-8 text-center">
          <QrCode className="mx-auto h-12 w-12 text-brand-600" aria-hidden />
          <h1 className="mt-4 text-2xl font-bold">{t('verify.title')}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('verify.subtitle')}</p>
        </div>
        <Card>
          <form onSubmit={go} className="space-y-4">
            <Input
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder={t('verify.placeholder')}
              aria-label={t('verify.placeholder')}
              spellCheck={false}
            />
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" className="w-full">
              {t('verify.button')}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-400">
            QR codes on genuine e-MCs open this page automatically — scanning with any camera app works.
          </p>
        </Card>
      </main>
    </>
  );
}
