'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, Ban, Clock, HelpCircle, ShieldAlert } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Badge, Card, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface VerifyOutcome {
  result: 'VALID' | 'INVALID' | 'REVOKED' | 'EXPIRED' | 'TAMPERED';
  mc?: {
    mcNumber: string;
    patientName: string;
    patientIcMasked: string;
    restDays: number;
    startDate: string;
    endDate: string;
    dateIssued: string;
    doctorName: string;
    mmcNumber: string;
    facilityName: string;
    facilityState: string;
    revokedReason?: string;
  };
  integrity: {
    signatureValid: boolean | null;
    hashIntact: boolean | null;
    blockchain: {
      checked: boolean;
      anchored: boolean;
      txHash?: string;
      explorerUrl?: string;
      anchoredAt?: string;
      issuerVerifiedOnChain?: boolean;
    };
  };
  checkedAt: string;
}

const resultStyles = {
  VALID: {
    icon: BadgeCheck,
    band: 'bg-green-600',
    text: 'This medical certificate is authentic and currently valid.',
  },
  EXPIRED: {
    icon: Clock,
    band: 'bg-amber-500',
    text: 'This certificate is authentic, but its rest period has ended.',
  },
  REVOKED: {
    icon: Ban,
    band: 'bg-red-600',
    text: 'This certificate was revoked or superseded by the issuing doctor.',
  },
  TAMPERED: {
    icon: ShieldAlert,
    band: 'bg-red-700',
    text: 'SECURITY ALERT: the certificate data does not match its cryptographic fingerprint. This document has been altered.',
  },
  INVALID: {
    icon: HelpCircle,
    band: 'bg-slate-600',
    text: 'No certificate with this fingerprint exists in the national registry.',
  },
} as const;

function CheckRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  return (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>
      <Badge tone={ok === null ? 'slate' : ok ? 'green' : 'red'}>
        {ok === null ? 'N/A' : ok ? 'PASS' : 'FAIL'}
      </Badge>
    </li>
  );
}

export default function VerifyResultPage() {
  const { hash } = useParams<{ hash: string }>();
  const { t } = useI18n();
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setError(null);
    setOutcome(null);
    try {
      setOutcome(await api<VerifyOutcome>(`/api/v1/verify/${hash}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [hash]);

  useEffect(() => {
    run();
  }, [run]);

  if (error) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="text-slate-700 dark:text-slate-300">{error}</p>
          <button
            onClick={run}
            className="mt-6 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            Try again
          </button>
        </main>
      </>
    );
  }
  if (!outcome) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center text-slate-400">
          {t('common.loading')}
        </main>
      </>
    );
  }

  const style = resultStyles[outcome.result];
  const Icon = style.icon;
  const chain = outcome.integrity.blockchain;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        {/* Verdict band */}
        <div className={cn('rounded-2xl p-8 text-center text-white shadow-lg', style.band)} role="status">
          <Icon className="mx-auto h-14 w-14" aria-hidden />
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
            {t(`verify.result.${outcome.result}`)}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/90">{style.text}</p>
        </div>

        {outcome.mc && (
          <Card className="mt-6" title="Certificate details">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {(
                [
                  ['Certificate No.', outcome.mc.mcNumber],
                  ['Patient', outcome.mc.patientName],
                  ['IC / Passport', outcome.mc.patientIcMasked],
                  ['Rest period', `${outcome.mc.restDays} day(s): ${outcome.mc.startDate} → ${outcome.mc.endDate}`],
                  ['Issued on', outcome.mc.dateIssued],
                  ['Doctor', `${outcome.mc.doctorName} (${outcome.mc.mmcNumber})`],
                  ['Facility', `${outcome.mc.facilityName}, ${outcome.mc.facilityState}`],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {outcome.mc.revokedReason && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                Revocation reason: {outcome.mc.revokedReason}
              </p>
            )}
            <p className="mt-4 text-xs text-slate-400">
              The medical reason is confidential and is never disclosed during verification.
            </p>
          </Card>
        )}

        <Card className="mt-6" title="Cryptographic checks" description={`Checked at ${new Date(outcome.checkedAt).toLocaleString()}`}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            <CheckRow
              label="Data integrity"
              ok={outcome.integrity.hashIntact}
              detail="Certificate data matches its keccak-256 fingerprint"
            />
            <CheckRow
              label="Doctor's digital signature"
              ok={outcome.integrity.signatureValid}
              detail="Ed25519 signature verified against the doctor's registered public key"
            />
            <CheckRow
              label="Blockchain anchor"
              ok={chain.checked ? chain.anchored : null}
              detail={
                chain.anchoredAt
                  ? `Anchored on Ethereum Sepolia at ${new Date(chain.anchoredAt).toLocaleString()}`
                  : chain.checked
                    ? 'On-chain record lookup'
                    : 'Not anchored (demo record) or chain check unavailable'
              }
            />
          </ul>
          {chain.explorerUrl && (
            <a
              href={chain.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
            >
              View blockchain transaction ↗
            </a>
          )}
        </Card>

        <p className="mt-6 break-all text-center font-mono text-xs text-slate-400">{hash}</p>
      </main>
    </>
  );
}
