import { SearchX } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { useOrg } from './OrgContext'

/**
 * What a list says when its search or filters hide everything in it.
 *
 * Each page used to say something different, and some said the wrong thing. A search on
 * Audits that found nothing said "No audits in scope - plan one to get started", as though
 * there were none. Corrective Actions showed five columns each reading "Empty". Permits said
 * there were "no live permits in this scope" under a search for a contractor's name. Several
 * said "try clearing the search" and offered no way to. Somebody who has forgotten the
 * filter they set yesterday, or the site picked in the header, reads all of that as their
 * records having gone.
 *
 * So it says what is narrowing the list, quotes the search back, mentions the site when only
 * one is being shown, and puts the way back under the message.
 */
export function NoMatches({
  what, search, onClear, filtered = true, className,
}: {
  /** What the list holds, plural and lowercase: "corrective actions". */
  what: string
  /** The search as typed, quoted back to them. */
  search?: string
  /** Clears the search and every filter on the page. Omit when there is nothing to clear. */
  onClear?: () => void
  /** Whether anything other than the search is narrowing the list. */
  filtered?: boolean
  className?: string
}) {
  const { site, sites, switchSite } = useOrg()
  const query = search?.trim()
  const oneSite = Boolean(site) && sites.length > 1
  const title = query ? `No ${what} match “${query}”` : `No ${what} match these filters`
  const hiding = (searched: boolean, narrowed: boolean) =>
    searched && narrowed ? 'search and filters' : searched ? 'search' : 'filters'

  return (
    <EmptyState
      icon={SearchX}
      title={onClear || !oneSite ? title : `No ${what} at ${site!.name}`}
      className={className}
      action={(onClear || oneSite) && (
        <div className="flex flex-wrap gap-2">
          {onClear && (
            <Button variant="secondary" onClick={onClear}>{filtered ? 'Clear Filters' : 'Clear Search'}</Button>
          )}
          {oneSite && <Button variant="ghost" onClick={() => switchSite(null)}>Show All Sites</Button>}
        </div>
      )}
    >
      {onClear && `${query ? 'Check the spelling, or clear' : 'Clear'} the ${hiding(Boolean(query), filtered)} to see all ${what}.`}
      {oneSite && ` Only ${site!.name} is being shown; the site picker at the top of the page changes that.`}
    </EmptyState>
  )
}
