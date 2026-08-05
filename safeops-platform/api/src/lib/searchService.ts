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
  | 'employee' | 'user' | 'company' | 'auditlog'
  | 'contractor' | 'contractorWorker'

/**
 * Registers only an administrator may search.
 *
 * The people-shaped ones are the reason: an employee directory and the admin audit trail
 * answer "who works here" and "who did what", which is exactly what someone probing a
 * tenant wants. Everyone keeps the operational registers.
 */
const ADMIN_ONLY_KINDS: SearchKind[] = ['user', 'auditlog']

/** Roles that may see the directory of colleagues. Employees see only their own records. */
const DIRECTORY_ROLES = ['admin', 'hse_manager', 'safety_officer', 'ceo', 'supervisor']

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

    const people = await this.searchPeople(caller, companyId, like, q)

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
      ...people,
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

  /**
   * The people-and-governance half of search: the employee directory, the user accounts,
   * the workspaces the caller belongs to, and the admin audit trail.
   *
   * Split out because these are gated differently from the operational registers. A
   * supervisor should be able to find a colleague to assign an action to; only an
   * administrator should be able to enumerate login accounts or read the audit trail.
   */
  private async searchPeople(
    caller: Caller, companyId: string, like: { contains: string; mode: 'insensitive' }, q: string,
  ): Promise<SearchHit[]> {
    const m = this.membership(caller, companyId)
    const isAdmin = m.role === 'admin'
    const canSeeDirectory = DIRECTORY_ROLES.includes(m.role)
    const siteScope = m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}

    const [employees, users, companies, auditLog, contractors, contractorWorkers] = await Promise.all([
      canSeeDirectory
        ? this.db.employee.findMany({
            where: {
              companyId, ...siteScope,
              OR: [{ name: like }, { employeeNo: like }, { email: like }, { position: like }],
            },
            select: {
              id: true, name: true, employeeNo: true, email: true, position: true,
              department: true, siteId: true, active: true,
            },
            orderBy: { name: 'asc' },
            take: PER_KIND,
          })
        : Promise.resolve([]),

      isAdmin
        ? this.db.user.findMany({
            // Only accounts with a membership of THIS workspace. Without that clause a
            // search box becomes a directory of every user on the installation.
            where: {
              memberships: { some: { companyId } },
              OR: [{ name: like }, { email: like }],
            },
            select: { id: true, name: true, email: true, status: true },
            orderBy: { name: 'asc' },
            take: PER_KIND,
          })
        : Promise.resolve([]),

      // Restricted to workspaces the caller is actually a member of.
      this.db.company.findMany({
        where: {
          id: { in: caller.roles.map((r) => r.companyId) },
          OR: [{ name: like }, { id: like }],
        },
        select: { id: true, name: true },
        take: PER_KIND,
      }),

      isAdmin
        ? this.db.adminAuditEntry.findMany({
            where: { companyId, OR: [{ action: like }, { target: like }, { actor: like }] },
            select: { id: true, action: true, actor: true, target: true, at: true },
            orderBy: { at: 'desc' },
            take: PER_KIND,
          })
        : Promise.resolve([]),

      // Contractors are workspace-wide rather than site-scoped: the firm is engaged by
      // the tenant, not by one site.
      this.db.contractorCompany.findMany({
        where: {
          companyId,
          OR: [{ name: like }, { code: like }, { registrationNumber: like }, { contactPerson: like }],
        },
        select: { id: true, code: true, name: true, status: true, insuranceExpiry: true },
        orderBy: { name: 'asc' },
        take: PER_KIND,
      }),

      // Their workers are site-scoped, same as anyone else standing on a site.
      canSeeDirectory
        ? this.db.contractorWorker.findMany({
            where: {
              companyId, ...siteScope,
              OR: [{ name: like }, { workerNo: like }, { icPassport: like }, { position: like }],
            },
            select: {
              id: true, workerNo: true, name: true, position: true, siteId: true,
              onSite: true, active: true,
              contractorCompany: { select: { name: true } },
            },
            orderBy: { name: 'asc' },
            take: PER_KIND,
          })
        : Promise.resolve([]),
    ])

    return [
      ...employees.map((r): SearchHit => ({
        kind: 'employee', id: r.id, code: r.employeeNo || r.email || r.name, title: r.name,
        detail: [r.position, r.department, r.siteId.toUpperCase(), r.active ? null : 'left']
          .filter(Boolean).join(' · '),
        // Opens their record in the workforce register, which is where everything about
        // them now lives.
        href: `/employees?open=${r.id}`,
      })),
      ...users.map((r): SearchHit => ({
        kind: 'user', id: r.id, code: r.email, title: r.name,
        detail: `${r.status} · account`,
        href: `/admin?s=users&open=${r.id}`,
      })),
      ...companies.map((r): SearchHit => ({
        kind: 'company', id: r.id, code: r.id.toUpperCase(), title: r.name,
        detail: 'workspace',
        href: `/admin?s=workspace`,
      })),
      ...auditLog.map((r): SearchHit => ({
        kind: 'auditlog', id: r.id, code: r.at.toISOString().slice(0, 10), title: r.action,
        detail: [r.actor, r.target].filter(Boolean).join(' → '),
        href: `/admin?s=audit&q=${encodeURIComponent(q)}`,
      })),
      ...contractors.map((r): SearchHit => ({
        kind: 'contractor', id: r.id, code: r.code, title: r.name,
        detail: [
          r.status === 'suspended' ? 'suspended' : 'active',
          r.insuranceExpiry ? `insured to ${r.insuranceExpiry.toISOString().slice(0, 10)}` : 'no insurance on file',
        ].join(' · '),
        href: `/contractors?contractor=${r.id}`,
      })),
      ...contractorWorkers.map((r): SearchHit => ({
        kind: 'contractorWorker', id: r.id, code: r.workerNo, title: r.name,
        detail: [
          r.contractorCompany.name, r.position, r.siteId.toUpperCase(),
          r.onSite ? 'on site' : null, r.active ? null : 'deregistered',
        ].filter(Boolean).join(' · '),
        href: `/contractors?worker=${r.id}`,
      })),
    ]
  }
}

export { ADMIN_ONLY_KINDS }
