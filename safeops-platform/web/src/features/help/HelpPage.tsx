import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ROLE_LABEL } from '@/api/types'
import { Alert, Card, PageHeader } from '@/components/ui'
import { useOrg } from '@/features/org/OrgContext'
import { usePageTitle } from '@/app/pageTitle'
import { modKey } from '@/lib/shortcuts'
import { GLOSSARY, howTosFor, ROLE_GUIDE } from './guides'

/**
 * Help, for somebody in their first week.
 *
 * SafeOps was built for people who already knew the job, and it showed: a new supervisor
 * met eighteen menu items, words like CAPA and TRIR, and no page saying where to start.
 * This page answers three questions in order - what is this, what do I do in it, and what
 * do the words mean - and only ever points at pages the reader's role can open.
 *
 * Words only. Nothing here is decorated with an icon; the headings and the numbered steps
 * carry the structure.
 */

/** `**Report incident**` on the screen's own words, in bold, so they can be matched to what is in front of you. */
function Marked({ text }: { text: string }) {
  const parts = text.split('**')
  return <>{parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-ink">{p}</strong> : <Fragment key={i}>{p}</Fragment>))}</>
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="mb-4">
      <section aria-labelledby={id} className="px-5 pb-5 pt-4">
        <h2 id={id} className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
        <div className="mt-3">{children}</div>
      </section>
    </Card>
  )
}

const PARTS = [
  { name: 'Report', text: 'Anyone can report an incident or a near miss, from a phone, in about a minute.' },
  { name: 'Fix', text: 'Safety staff investigate and raise corrective actions, each with an owner and a due date.' },
  { name: 'Prevent', text: 'Permits, inspections, toolbox meetings, training and audits keep the safeguards working.' },
]

export function HelpPage() {
  const { role, allowed } = useOrg()
  usePageTitle('Help')
  const guide = role ? ROLE_GUIDE[role] : null
  const howTos = role ? howTosFor(role, allowed) : []

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Help"
        subtitle="How SafeOps works, what your role does in it, and what the safety words mean."
      />

      {/*
        First, because it is the one thing on this page that is not about software. Nobody
        should be filling in a form while somebody needs help.
      */}
      <Alert tone="warning" className="mb-4" title="In an emergency, act first and report afterwards">
        If someone is hurt or in danger, follow your site's emergency procedure and get help.
        SafeOps is where it is recorded, not how the alarm is raised.
      </Alert>

      <Section id="help-what" title="SafeOps in one minute">
        <p className="text-sm leading-relaxed text-ink-2">
          SafeOps keeps your company's safety work in one place: what went wrong, what is being done
          about it, and the checks that stop it happening again.
        </p>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {PARTS.map((p, i) => (
            <li key={p.name} className="rounded-lg border px-3.5 py-3">
              <p className="text-sm font-semibold text-ink">{i + 1}. {p.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{p.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Everything belongs to a site. The site picker at the top of every page narrows what you see
          to one site; choose <strong className="font-semibold text-ink-2">All sites</strong> to see them all.
        </p>
      </Section>

      {guide && role && (
        <Section id="help-role" title={`Your role: ${ROLE_LABEL[role]}`} subtitle={guide.summary}>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted">What you will do most</p>
          <ol className="mt-2 space-y-2">
            {guide.tasks.map((t, i) => (
              <li key={t.title} className="flex gap-3 rounded-lg border px-3.5 py-3">
                <span className="w-5 shrink-0 text-sm font-semibold text-muted" aria-hidden>{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{t.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{t.detail}</p>
                </div>
                <Link
                  to={t.to}
                  className="shrink-0 self-center rounded text-xs font-semibold text-accent hover:underline coarse:inline-flex coarse:min-h-11 coarse:items-center"
                  aria-label={`Open: ${t.title}`}
                >
                  Open
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Your menu shows the pages your role uses, and nothing else. If something you need is
            missing, ask your administrator.
          </p>
        </Section>
      )}

      {howTos.length > 0 && (
        <Section id="help-how" title="How do I…" subtitle="Step by step, with the names of the buttons you will press.">
          <div className="divide-y rounded-lg border">
            {howTos.map((h) => (
              <details key={h.id} id={`how-${h.id}`} className="group px-3.5 py-3 [&_summary::-webkit-details-marker]:text-muted">
                <summary className="cursor-pointer text-sm font-semibold text-ink coarse:min-h-11 coarse:py-2.5">
                  {h.question}
                </summary>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2 marker:text-muted">
                  {h.steps.map((s) => <li key={s}><Marked text={s} /></li>)}
                </ol>
                {h.note && <p className="mt-2 text-xs leading-relaxed text-muted"><Marked text={h.note} /></p>}
                <Link to={h.to} className="mt-2 inline-flex text-xs font-semibold text-accent hover:underline coarse:min-h-11 coarse:items-center">
                  Take me there
                </Link>
              </details>
            ))}
          </div>
        </Section>
      )}

      <Section id="help-words" title="Words you will see" subtitle="Safety work has its own vocabulary. This is what it means here.">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt className="text-sm font-semibold text-ink">{g.term}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-ink-2">{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="help-around" title="Getting around">
        <ul className="space-y-2 text-sm leading-relaxed text-ink-2">
          <li><strong className="font-semibold text-ink">Search.</strong> Press <Key>/</Key> or <Key>{modKey('K')}</Key> to find an incident, permit, person or piece of equipment by name or number.</li>
          <li><strong className="font-semibold text-ink">Notifications.</strong> The bell at the top lists what is assigned to you or due soon. Click one to open it.</li>
          <li><strong className="font-semibold text-ink">Numbers are links.</strong> A figure on Home opens the list it counts, already filtered.</li>
          <li><strong className="font-semibold text-ink">Keyboard.</strong> Press <Key>?</Key> for every shortcut.</li>
          <li><strong className="font-semibold text-ink">This page.</strong> Help is always at the bottom of the menu and in your account menu.</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Still stuck? Ask your HSE manager or your administrator. They can see what you see, and change what your role allows.
        </p>
      </Section>
    </div>
  )
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-sunken px-1.5 py-0.5 font-mono text-2xs text-ink">{children}</kbd>
}
