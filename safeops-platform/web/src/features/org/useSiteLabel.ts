import { useOrg } from './OrgContext'

/**
 * A site's name, or its short code, from its id.
 *
 * Screens printed `siteId.toUpperCase()`. The demo seeds sites with ids like "btu", so that
 * read as a code; a site created in the product has an id like "site-a1b2c3d4e5f6", and the
 * visitor pass, asset drawer and incident board printed that. Falls back to the id only
 * for a site this person cannot see.
 */
export function useSiteLabel() {
  const { sites } = useOrg()
  return (id: string | null | undefined, form: 'name' | 'short' = 'name'): string => {
    if (!id) return ''
    const s = sites.find((x) => x.id === id)
    if (!s) return id
    return form === 'short' ? s.short || s.name : s.name
  }
}
