/**
 * Global search across a workspace.
 *
 * What people actually type into a search box in a safety system is a reference someone
 * read to them — "INC-2604", "PTW-4410", "CERT-2026-2031" — or a few words from a title.
 * So each register is matched on its human reference and its title, and nothing else: a
 * full-text search over descriptions returns a hundred incidents that mention "ladder" and
 * buries the one whose number you were given.
 *
 * Every query is scoped by the caller's membership and by their site restrictions, using
 * the same rules the module services use. A search box that reaches further than the
 * screens it links to is a data leak with a magnifying-glass icon.
 */
import type { PrismaClient } from '@prisma/client'
import type { Caller } from './incidentService.js'

export class SearchError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

export type SearchKind =
  | 'incident' | 'action' | 'permit' | 'asset' | 'audit' | 'certificate'

export interface SearchHit {
  kind: SearchKind
  id: string
  /** The human reference — INC-2604, PTW-4410. What people search by. */
  code: string
  title: string
  /** One line of context: site, status, owner. */
  detail: string
  /** Where clicking it goes. */
  href: string
}

/** Per register, so one noisy type cannot crowd out the rest. */
const PER_KIND = 5

/** Below this a query matches almost everything and the results are noise. */
const MIN_QUERY = 2

export class SearchService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new SearchError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  /**
   * Site restriction, matching the module services: an empty `siteIds` means every site in
   * the company, anything else limits the rows to those sites.
   */
  private siteWhere(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)
    return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
  }

  async search(caller: Caller, companyId: string, rawQuery: string): Promise<SearchHit[]> {
    const q = rawQuery.trim()
    if (q.length < MIN_QUERY) return []

    const scope = { companyId, ...this.siteWhere(caller, companyId) }
    // `insensitive` so "ptw-4410" finds PTW-4410 — nobody types the case of a reference.
    const like = { contains: q, mode: 'insensitive' as const }

    const [incidents, actions, permits, assets, audits, certificates] = await Promise.all([
      this.db.incident.findMany({
        where: { ...scope, archived: false, OR: [{ number: like }, { title: like }] },
        select: { id: true, number: true, title: true, siteId: true, stage: true, severity: true },
        orderBy: { reportedAt: 'desc' },
        take: PER_KIND,
      }),
      this.db.correctiveAction.findMany({
        where: { ...scope, OR: [{ code: like }, { title: like }] },
        select: { id: true, code: true, title: true, siteId: true, status: true, owner: true },
        orderBy: { dueDate: 'asc' },
        take: PER_KIND,
      }),
      this.db.permit.findMany({
        where: { ...scope, OR: [{ code: like }, { title: like }] },
        select: { id: true, code: true, title: true, siteId: true, status: true, location: true },
        orderBy: { validTo: 'desc' },
        take: PER_KIND,
      }),
      this.db.asset.findMany({
        where: { ...scope, OR: [{ code: like }, { name: like }, { serialNumber: like }] },
        select: { id: true, code: true, name: true, siteId: true, status: true, location: true },
        orderBy: { nextDueDate: 'asc' },
        take: PER_KIND,
      }),
      this.db.audit.findMany({
        where: { ...scope, OR: [{ code: like }, { title: like }] },
        select: { id: true, code: true, title: true, siteId: true, status: true },
        orderBy: { scheduledFor: 'desc' },
        take: PER_KIND,
      }),
      // Certificates have no site column of their own — they belong to an employee, so the
      // site restriction is applied through them.
      this.db.certificate.findMany({
        where: {
          companyId,
          OR: [{ number: like }, { courseName: like }, { employee: { name: like } }],
          ...(this.membership(caller, companyId).siteIds.length > 0
            ? { employee: { siteId: { in: this.membership(caller, companyId).siteIds } } }
            : {}),
        },
        select: {
          id: true, number: true, courseName: true, expiryDate: true,
          employee: { select: { name: true, siteId: true } },
        },
        orderBy: { issueDate: 'desc' },
        take: PER_KIND,
      }),
    ])

    const hits: SearchHit[] = [
      ...incidents.map((r): SearchHit => ({
        kind: 'incident', id: r.id, code: r.number, title: r.title,
        detail: `${r.severity} · ${r.stage.replace(/_/g, ' ')} · ${r.siteId.toUpperCase()}`,
        href: `/incidents/${r.id}`,
      })),
      ...actions.map((r): SearchHit => ({
        kind: 'action', id: r.id, code: r.code, title: r.title,
        detail: `${r.status.replace(/_/g, ' ')} · ${r.owner} · ${r.siteId.toUpperCase()}`,
        href: `/actions?open=${r.id}`,
      })),
      ...permits.map((r): SearchHit => ({
        kind: 'permit', id: r.id, code: r.code, title: r.title,
        detail: `${r.status.replace(/_/g, ' ')} · ${r.location} · ${r.siteId.toUpperCase()}`,
        href: `/permits?open=${r.id}`,
      })),
      ...assets.map((r): SearchHit => ({
        kind: 'asset', id: r.id, code: r.code, title: r.name,
        detail: `${r.status.replace(/_/g, ' ')} · ${r.location} · ${r.siteId.toUpperCase()}`,
        href: `/assets?open=${r.id}`,
      })),
      ...audits.map((r): SearchHit => ({
        kind: 'audit', id: r.id, code: r.code, title: r.title,
        detail: `${r.status.replace(/_/g, ' ')} · ${r.siteId.toUpperCase()}`,
        href: `/audits?open=${r.id}`,
      })),
      ...certificates.map((r): SearchHit => ({
        kind: 'certificate', id: r.id, code: r.number, title: r.courseName,
        detail: `${r.employee?.name ?? 'Unknown'}${r.expiryDate ? ` · expires ${r.expiryDate.toISOString().slice(0, 10)}` : ''}`,
        href: `/training?cert=${r.id}`,
      })),
    ]

    // An exact reference match is almost always what was wanted, so it goes first
    // regardless of which register it came from.
    const lower = q.toLowerCase()
    return hits.sort((a, b) => {
      const aExact = a.code.toLowerCase() === lower ? 0 : a.code.toLowerCase().startsWith(lower) ? 1 : 2
      const bExact = b.code.toLowerCase() === lower ? 0 : b.code.toLowerCase().startsWith(lower) ? 1 : 2
      return aExact - bExact
    })
  }
}
