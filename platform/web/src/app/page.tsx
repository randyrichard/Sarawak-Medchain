'use client';

import Link from 'next/link';
import { FileCheck2, Fingerprint, Landmark, LockKeyhole, QrCode, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

const pillars = [
  {
    icon: Fingerprint,
    title: 'Digitally signed',
    body: "Every MC carries the issuing doctor's Ed25519 signature. A forged signature fails verification instantly.",
  },
  {
    icon: LockKeyhole,
    title: 'Blockchain anchored',
    body: 'The certificate fingerprint is written to a public blockchain at issuance. Nobody — not even the platform — can backdate or alter it.',
  },
  {
    icon: QrCode,
    title: 'Verified in seconds',
    body: 'Employers scan the QR with any phone camera. No app, no account, no call to the clinic.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy preserving',
    body: 'The diagnosis never leaves the encrypted medical record. Verification confirms validity — never the medical reason.',
  },
  {
    icon: Landmark,
    title: 'Government-grade registry',
    body: 'Clinics and hospitals are approved by KKM. Doctors are validated against MMC registration before they can issue.',
  },
  {
    icon: FileCheck2,
    title: 'Complete audit trail',
    body: 'Every issuance, amendment and verification is recorded in a tamper-evident, hash-chained audit log.',
  },
];

export default function HomePage() {
  const { t } = useI18n();
  return (
    <>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-b from-brand-50 to-slate-50 dark:from-slate-900 dark:to-slate-950">
          <div className="mx-auto max-w-6xl px-4 py-24 text-center">
            <p className="mb-4 inline-block rounded-full bg-brand-100 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-800 dark:bg-brand-900/50 dark:text-brand-300">
              {t('app.tagline')}
            </p>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-5xl">
              {t('home.hero.title')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              {t('home.hero.subtitle')}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href="/verify">
                <Button className="px-6 py-3 text-base">{t('home.cta.verify')}</Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" className="px-6 py-3 text-base">
                  {t('home.cta.portal')}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white">
            Why fake MCs become impossible
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => (
              <div
                key={p.title}
                className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
              >
                <p.icon className="h-8 w-8 text-brand-600 dark:text-brand-400" aria-hidden />
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-800">
          Sarawak MedChain e-MC Platform — built for the Ministry of Health Malaysia (KKM) evaluation.
        </footer>
      </main>
    </>
  );
}
