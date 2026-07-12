'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** English / Bahasa Malaysia dictionary. Keys are grouped by screen. */
const dict = {
  en: {
    'app.name': 'Sarawak MedChain',
    'app.tagline': 'National Digital Medical Certificate (e-MC) Platform',
    'nav.verify': 'Verify an MC',
    'nav.login': 'Log in',
    'nav.register': 'Register',
    'nav.logout': 'Log out',
    'nav.dashboard': 'Dashboard',
    'home.hero.title': 'Every medical certificate. Cryptographically verifiable.',
    'home.hero.subtitle':
      'Digitally signed by the issuing doctor, fingerprinted on a public blockchain, and verifiable by any employer in seconds. Fake MCs become mathematically impossible.',
    'home.cta.verify': 'Verify a certificate',
    'home.cta.portal': 'Access your portal',
    'home.pillars.title': 'Why fake MCs become impossible',
    'home.pillar1.title': 'Digitally signed',
    'home.pillar1.body': "Every MC carries the issuing doctor's Ed25519 signature. A forged signature fails verification instantly.",
    'home.pillar2.title': 'Blockchain anchored',
    'home.pillar2.body': 'The certificate fingerprint is written to a public blockchain at issuance. Nobody — not even the platform — can backdate or alter it.',
    'home.pillar3.title': 'Verified in seconds',
    'home.pillar3.body': 'Employers scan the QR with any phone camera. No app, no account, no call to the clinic.',
    'home.pillar4.title': 'Privacy preserving',
    'home.pillar4.body': 'The diagnosis never leaves the encrypted medical record. Verification confirms validity — never the medical reason.',
    'home.pillar5.title': 'Government-grade registry',
    'home.pillar5.body': 'Clinics and hospitals are approved by KKM. Doctors are validated against MMC registration before they can issue.',
    'home.pillar6.title': 'Complete audit trail',
    'home.pillar6.body': 'Every issuance, amendment and verification is recorded in a tamper-evident, hash-chained audit log.',
    'home.footer': 'Sarawak MedChain e-MC Platform — built for the Ministry of Health Malaysia (KKM) evaluation.',
    'verify.title': 'Verify a Medical Certificate',
    'verify.subtitle': 'Scan the QR code on the MC with any phone camera, or paste the certificate hash below.',
    'verify.placeholder': 'Certificate hash (0x…)',
    'verify.button': 'Verify now',
    'verify.result.VALID': 'VALID',
    'verify.result.INVALID': 'INVALID',
    'verify.result.REVOKED': 'REVOKED',
    'verify.result.EXPIRED': 'EXPIRED',
    'verify.result.TAMPERED': 'TAMPERED — SECURITY ALERT',
    'login.title': 'Sign in to your portal',
    'login.email': 'Email address',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.2fa': 'Enter the 6-digit code from your authenticator app',
    'dash.issue': 'Issue MC',
    'dash.myMcs': 'My certificates',
    'common.loading': 'Loading…',
    'common.download': 'Download PDF',
    'common.share': 'Share',
    'common.status': 'Status',
    'common.actions': 'Actions',
  },
  ms: {
    'app.name': 'Sarawak MedChain',
    'app.tagline': 'Platform Sijil Cuti Sakit Digital (e-MC) Kebangsaan',
    'nav.verify': 'Sahkan MC',
    'nav.login': 'Log masuk',
    'nav.register': 'Daftar',
    'nav.logout': 'Log keluar',
    'nav.dashboard': 'Papan Pemuka',
    'home.hero.title': 'Setiap sijil cuti sakit. Boleh disahkan secara kriptografi.',
    'home.hero.subtitle':
      'Ditandatangani secara digital oleh doktor, dicap jari pada blockchain awam, dan boleh disahkan oleh mana-mana majikan dalam beberapa saat. MC palsu menjadi mustahil secara matematik.',
    'home.cta.verify': 'Sahkan sijil',
    'home.cta.portal': 'Akses portal anda',
    'home.pillars.title': 'Mengapa MC palsu menjadi mustahil',
    'home.pillar1.title': 'Ditandatangani secara digital',
    'home.pillar1.body': 'Setiap MC membawa tandatangan Ed25519 doktor pengeluar. Tandatangan palsu gagal pengesahan serta-merta.',
    'home.pillar2.title': 'Berlabuh pada blockchain',
    'home.pillar2.body': 'Cap jari sijil ditulis ke blockchain awam semasa pengeluaran. Tiada sesiapa — termasuk platform ini — boleh mengubah atau menetapkan tarikh lampau.',
    'home.pillar3.title': 'Disahkan dalam beberapa saat',
    'home.pillar3.body': 'Majikan mengimbas QR dengan mana-mana kamera telefon. Tiada aplikasi, tiada akaun, tiada panggilan ke klinik.',
    'home.pillar4.title': 'Memelihara privasi',
    'home.pillar4.body': 'Diagnosis tidak pernah keluar daripada rekod perubatan yang disulitkan. Pengesahan mengesahkan kesahihan — bukan sebab perubatan.',
    'home.pillar5.title': 'Pendaftaran gred kerajaan',
    'home.pillar5.body': 'Klinik dan hospital diluluskan oleh KKM. Doktor disahkan terhadap pendaftaran MMC sebelum boleh mengeluarkan MC.',
    'home.pillar6.title': 'Jejak audit lengkap',
    'home.pillar6.body': 'Setiap pengeluaran, pindaan dan pengesahan direkodkan dalam log audit berantai cincang yang kalis usikan.',
    'home.footer': 'Platform e-MC Sarawak MedChain — dibina untuk penilaian Kementerian Kesihatan Malaysia (KKM).',
    'verify.title': 'Sahkan Sijil Cuti Sakit',
    'verify.subtitle': 'Imbas kod QR pada MC dengan kamera telefon, atau tampal hash sijil di bawah.',
    'verify.placeholder': 'Hash sijil (0x…)',
    'verify.button': 'Sahkan sekarang',
    'verify.result.VALID': 'SAH',
    'verify.result.INVALID': 'TIDAK SAH',
    'verify.result.REVOKED': 'DIBATALKAN',
    'verify.result.EXPIRED': 'TAMAT TEMPOH',
    'verify.result.TAMPERED': 'DIUBAH SUAI — AMARAN KESELAMATAN',
    'login.title': 'Log masuk ke portal anda',
    'login.email': 'Alamat e-mel',
    'login.password': 'Kata laluan',
    'login.submit': 'Log masuk',
    'login.2fa': 'Masukkan kod 6 digit daripada aplikasi pengesah anda',
    'dash.issue': 'Keluarkan MC',
    'dash.myMcs': 'Sijil saya',
    'common.loading': 'Memuatkan…',
    'common.download': 'Muat turun PDF',
    'common.share': 'Kongsi',
    'common.status': 'Status',
    'common.actions': 'Tindakan',
  },
} as const;

export type Locale = keyof typeof dict;
type Key = keyof (typeof dict)['en'];

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key) => string;
}>({ locale: 'en', setLocale: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('emc_locale');
    if (saved === 'ms' || saved === 'en') setLocaleState(saved);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('emc_locale', l);
  };

  const t = (key: Key) => dict[locale][key] ?? dict.en[key] ?? key;
  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
