import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  LANGUAGE_LABEL, LANGUAGE_TAG, PRIVACY_NOTICE, TERMS_OF_SERVICE,
  type LegalDocument, type LegalLanguage,
} from './documents'
import { usePageTitle } from '@/app/pageTitle'

/**
 * The privacy notice and terms, readable without an account.
 *
 * Deliberately outside both route guards. A person deciding whether to accept an invitation
 * has no session yet, and a notice you can only read after agreeing to it is not a notice —
 * PDPA section 7 requires it at or before the point of collection.
 *
 * The text lives in `documents.ts` beside this file rather than being fetched, so the page
 * works on a cold load with no API, which is the state somebody following a link from an
 * email is in.
 */
export function LegalPage() {
  const { pathname } = useLocation()
  const doc: LegalDocument = pathname.startsWith('/terms') ? TERMS_OF_SERVICE : PRIVACY_NOTICE

  /*
   * Which language is showing.
   *
   * Both are equally reachable rather than one being the real notice and the other a
   * courtesy: section 7(3) of the PDPA requires the notice in both national and English
   * language, so a Malay version reachable only through a link at the bottom would be
   * meeting the letter and missing the point.
   *
   * The choice is remembered, because somebody who reads in Malay reads the terms in Malay
   * too, and being asked twice is being asked once too often.
   */
  const [lang, setLang] = useState<LegalLanguage>(() => {
    try {
      const saved = localStorage.getItem('safeops.legal.lang')
      if (saved === 'ms' || saved === 'en') return saved
    } catch { /* private mode, blocked storage - fall through to the default */ }
    // Malaysia's own language setting is a better first guess than English.
    return typeof navigator !== 'undefined' && /^ms/i.test(navigator.language || '') ? 'ms' : 'en'
  })

  const choose = (next: LegalLanguage) => {
    setLang(next)
    try { localStorage.setItem('safeops.legal.lang', next) } catch { /* nothing to do */ }
  }

  const content = doc[lang]
  usePageTitle(content.title)

  return (
    <div className="min-h-full bg-page">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-4 sm:px-5">
          <Link to="/login" className="flex items-center gap-2.5" aria-label="SafeOps home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <ShieldCheck size={17} color="#fff" strokeWidth={2.4} />
            </span>
            <span className="text-sm font-bold tracking-tight text-ink">SafeOps</span>
          </Link>
          {/* Links of text height are under half a fingertip; a touch screen gets 44px rows. */}
          <nav className="ml-auto flex items-center gap-3 text-xs font-semibold sm:gap-4 [&>a]:coarse:flex [&>a]:coarse:min-h-11 [&>a]:coarse:items-center" aria-label="Legal documents">
            <Link
              to="/privacy"
              className={pathname.startsWith('/privacy') ? 'text-accent' : 'text-ink-2 hover:text-ink'}
              aria-current={pathname.startsWith('/privacy') ? 'page' : undefined}
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className={pathname.startsWith('/terms') ? 'text-accent' : 'text-ink-2 hover:text-ink'}
              aria-current={pathname.startsWith('/terms') ? 'page' : undefined}
            >
              Terms
            </Link>
            <Link to="/login" className="text-ink-2 hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-[820px] px-5 py-8 outline-none">
        {/*
          The draft banner is not decoration and must not be quietly removed. Until a lawyer
          has reviewed this text and the placeholders are filled in, anybody reading it needs
          to know it is not yet in force — a notice presented as final is a set of statements
          a customer can hold you to.
        */}
        {doc.draft && (
          <div className="mb-6 rounded-lg border border-warning bg-warning-soft px-4 py-3" role="status">
            <p className="text-sm font-semibold text-ink">Draft — not yet in effect</p>
            <p className="mt-1 text-xs text-ink-2">
              This document has not been reviewed by a lawyer and still contains placeholders.
              It describes what the software does, accurately, but it is not a binding notice
              or agreement and should not be relied on as one.
            </p>
          </div>
        )}

        {/*
          The language switch, above the title rather than below the document.

          `lang` on the wrapper is what makes a screen reader pronounce Malay as Malay
          instead of reading it with English phonemes, which is the difference between a
          notice somebody can follow and a noise.
        */}
        <div className="mb-5 flex flex-wrap items-center gap-1" role="group" aria-label="Language / Bahasa">
          {(['en', 'ms'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => choose(code)}
              lang={LANGUAGE_TAG[code]}
              aria-pressed={lang === code}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors coarse:min-h-11',
                lang === code
                  ? 'border-accent bg-accent-soft text-ink'
                  : 'text-ink-2 hover:bg-accent-soft hover:text-ink',
              )}
            >
              {LANGUAGE_LABEL[code]}
            </button>
          ))}
        </div>

        <div lang={LANGUAGE_TAG[lang]}>
          <h1 className="text-xl font-bold tracking-tight text-ink">{content.title}</h1>
          <p className="mt-1 text-xs text-muted">
            Version {doc.version} · Last updated {doc.updated}
          </p>

          <div className="mt-6 space-y-6">
            {content.sections.map((s) => (
              <section key={s.heading}>
                <h2 className="text-sm font-bold text-ink">{s.heading}</h2>
                {s.body.map((p, i) => (
                  <p key={i} className="mt-2 text-sm leading-relaxed text-ink-2">{p}</p>
                ))}
                {s.list && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-2">
                    {s.list.map((li) => <li key={li}>{li}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>

        <p className="mt-10 border-t pt-4 text-xs text-muted">
          The full text, including the parts still to be settled, is kept with the source at{' '}
          <span className="break-all font-mono">docs/{doc.sourceFile}</span>.
        </p>
      </main>
    </div>
  )
}
