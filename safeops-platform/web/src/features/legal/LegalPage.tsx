import { Link, useLocation } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { PRIVACY_NOTICE, TERMS_OF_SERVICE, type LegalDocument } from './documents'
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
  usePageTitle(doc.title)

  return (
    <div className="min-h-full bg-page">
      <header className="border-b bg-surface">
        <div className="mx-auto flex max-w-[820px] items-center gap-2.5 px-5 py-4">
          <Link to="/login" className="flex items-center gap-2.5" aria-label="SafeOps home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <ShieldCheck size={17} color="#fff" strokeWidth={2.4} />
            </span>
            <span className="text-sm font-bold tracking-tight text-ink">SafeOps</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-xs font-semibold" aria-label="Legal documents">
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

        <h1 className="text-xl font-bold tracking-tight text-ink">{doc.title}</h1>
        <p className="mt-1 text-xs text-muted">
          Version {doc.version} · Last updated {doc.updated}
        </p>

        <div className="mt-6 space-y-6">
          {doc.sections.map((s) => (
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

        <p className="mt-10 border-t pt-4 text-xs text-muted">
          The full text, including the parts still to be settled, is kept with the source at{' '}
          <span className="font-mono">docs/{doc.sourceFile}</span>.
        </p>
      </main>
    </div>
  )
}
