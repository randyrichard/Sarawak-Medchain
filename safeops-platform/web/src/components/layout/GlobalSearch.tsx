import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Loader2, ClipboardList, ListChecks, HardHat, Wrench, CalendarClock, GraduationCap,
  UserRound, ShieldCheck, Building2, ScrollText, HardHat as HardHatIcon, Truck, UserCheck,
} from 'lucide-react'
import { searchApi, type SearchHit, type SearchKind } from '@/api/accountApi'
import { useOrg } from '@/features/org/OrgContext'
import { isBackendConfigured } from '@/api/authApi'
import { cn } from '@/lib/cn'
import { isTypingTarget, modKey } from '@/lib/shortcuts'

const KIND_ICON: Record<SearchKind, typeof ClipboardList> = {
  incident: ClipboardList,
  action: ListChecks,
  permit: HardHat,
  asset: Wrench,
  audit: CalendarClock,
  certificate: GraduationCap,
  employee: UserRound,
  user: ShieldCheck,
  company: Building2,
  auditlog: ScrollText,
  contractor: Truck,
  contractorWorker: HardHatIcon,
  visitor: UserCheck,
}

const KIND_LABEL: Record<SearchKind, string> = {
  incident: 'Incident',
  action: 'Action',
  permit: 'Permit',
  asset: 'Asset',
  audit: 'Audit',
  certificate: 'Certificate',
  employee: 'Employee',
  user: 'User account',
  company: 'Workspace',
  auditlog: 'Audit log',
  contractor: 'Contractor',
  contractorWorker: 'Contractor worker',
  visitor: 'Visitor',
}

/**
 * Marks the matched span so the eye lands on why a row came back.
 *
 * The query is used as a literal, never as a pattern: a user typing "INC-2604 (draft)"
 * would otherwise blow up `RegExp` on the bracket.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-accent-soft px-0.5 text-ink">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

/** Below this the server returns nothing, so there is no point asking. */
const MIN_QUERY = 2

/**
 * Search across every register in the current workspace.
 *
 * Debounced rather than searched per keystroke: a reference is around ten characters, and
 * without this every one of them is a database round trip across six tables.
 *
 * Results are keyed to the workspace in the switcher, so what the box can reach is exactly
 * what the screens behind it can reach.
 */
export function GlobalSearch() {
  const { company } = useOrg()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl-K focuses the box, which is what the badge beside it promises. So does "/",
  // the search key on GitHub, Gmail, YouTube and Slack - unless the person is typing, when a
  // slash is just a slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const commandK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)
      if (commandK || slash) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!company || q.length < MIN_QUERY) {
      setHits(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    // `cancelled` guards against a slow early response overwriting a fast later one —
    // otherwise typing quickly leaves the results showing an earlier query's matches.
    let cancelled = false
    const timer = setTimeout(() => {
      searchApi.search(company.id, q)
        .then((rows) => {
          if (cancelled) return
          setHits(rows)
          setActive(0)
        })
        .catch(() => {
          if (cancelled) return
          setHits(null)
          setError('Search is unavailable right now.')
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, company])

  const go = (hit: SearchHit) => {
    setOpen(false)
    setQuery('')
    setHits(null)
    navigate(hit.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hits || hits.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % hits.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + hits.length) % hits.length) }
    if (e.key === 'Enter') { e.preventDefault(); go(hits[active]) }
  }

  // Without a backend there is nothing to search; saying so beats an input that silently
  // never returns anything.
  const disabled = !isBackendConfigured() || !company
  const showPanel = open && query.trim().length >= MIN_QUERY

  return (
    <div ref={boxRef} className="relative hidden xl:block">
      <div className="flex items-center gap-2 rounded-lg border bg-page px-3 py-1.5">
        {loading
          ? <Loader2 size={14} className="animate-spin text-muted" />
          : <Search size={14} className="text-muted" />}
        <input
          ref={inputRef}
          aria-keyshortcuts="Control+K Meta+K /"
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? 'Search unavailable' : 'Search incidents, permits, assets…'}
          aria-label="Search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          className="w-56 bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        <kbd className="rounded border px-1.5 text-2xs text-muted" aria-hidden>{modKey('K')}</kbd>
      </div>

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute right-0 z-50 mt-1.5 max-h-96 w-[26rem] overflow-y-auto rounded-xl border bg-surface shadow-lg"
        >
          {error ? (
            <p className="px-3.5 py-3 text-sm text-critical">{error}</p>
          ) : loading && !hits ? (
            <p className="px-3.5 py-3 text-sm text-muted">Searching…</p>
          ) : hits && hits.length === 0 ? (
            <div className="px-3.5 py-3">
              <p className="text-sm text-ink-2">No matches for “{query.trim()}”.</p>
              <p className="mt-0.5 text-2xs text-muted">
                Try a reference like INC-2604 or PTW-4410, or a word from the title.
              </p>
            </div>
          ) : hits ? (
            <ul className="py-1">
              {hits.map((hit, i) => {
                const Icon = KIND_ICON[hit.kind]
                return (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-3.5 py-2 text-left',
                        i === active ? 'bg-accent-soft' : 'hover:bg-accent-soft/50',
                      )}
                    >
                      <Icon size={14} className="mt-0.5 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-2xs text-muted">
                            <Highlight text={hit.code} query={query} />
                          </span>
                          <span className="text-2xs text-muted">{KIND_LABEL[hit.kind]}</span>
                        </span>
                        <span className="block truncate text-sm text-ink">
                          <Highlight text={hit.title} query={query} />
                        </span>
                        <span className="block truncate text-2xs text-muted">{hit.detail}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  )
}
