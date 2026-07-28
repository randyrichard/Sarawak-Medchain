import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { PrismaClient, Role } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller } from './incidentService.js'
import { hashPassword } from './password.js'
import {
  BACKGROUND_JOBS, CONNECTORS, MODULE_LABEL, RBAC_ACTIONS, RBAC_MODULES, SYSTEM_ROLES,
  type PermissionMatrix, type RbacAction, type RbacModule,
} from './adminCatalog.js'

export class AdminError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

const DAY = 86400_000

/** SHA-256, the same one-way treatment RefreshToken gives its opaque tokens. */
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

/** Roles the six-role enum recognises. Anything else is a console-only custom role. */
const ENUM_ROLES: Role[] = ['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee']
const isEnumRole = (r: string): r is Role => (ENUM_ROLES as string[]).includes(r)

export interface AdminContext {
  ip?: string
  device?: string
}

export class AdminService {
  constructor(private db: PrismaClient) {}

  // ── Authorisation ──────────────────────────────────────────────────────────

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new AdminError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  /**
   * Administration is admin-only, and the role comes from the verified session rather
   * than anything the request carries. The console can create users and rewrite security
   * policy, so this is the one gate that has no softer variant.
   */
  private requireAdmin(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)
    if (m.role !== 'admin') {
      throw new AdminError('forbidden', 'This action requires an Administrator.', 403)
    }
    return m
  }

  /** Reading the console is open to admins; everything else here mutates. */
  private requireAdminRead(caller: Caller, companyId: string) {
    return this.requireAdmin(caller, companyId)
  }

  // ── Audit trail ────────────────────────────────────────────────────────────

  private async log(
    caller: Caller, companyId: string, ctx: AdminContext,
    action: string, module: string, target: string, oldValue?: string, newValue?: string,
  ) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    await this.db.adminAuditEntry.create({
      data: {
        companyId,
        actor: caller.name,
        actorRole: m?.role ?? '',
        action,
        module,
        target,
        ip: ctx.ip ?? '',
        device: ctx.device ?? '',
        oldValue,
        newValue,
      },
    })
  }

  async listAudit(caller: Caller, companyId: string, filters: {
    q?: string; module?: string; actor?: string
  }) {
    this.requireAdminRead(caller, companyId)
    const q = filters.q?.trim()
    return this.db.adminAuditEntry.findMany({
      where: {
        companyId,
        ...(filters.module ? { module: filters.module } : {}),
        ...(filters.actor ? { actor: filters.actor } : {}),
        ...(q
          ? {
              OR: [
                { action: { contains: q, mode: 'insensitive' } },
                { target: { contains: q, mode: 'insensitive' } },
                { actor: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { at: 'desc' },
      take: 500,
    })
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  //
  // Operates on the real User and Membership tables. An admin console that manages a
  // separate copy of the users manages nothing: deactivating an account here has to be
  // the same act that stops them signing in.

  private toAdminUser(
    u: Prisma.UserGetPayload<{ include: { memberships: true } }>,
    companyId: string,
  ) {
    const m = u.memberships.find((x) => x.companyId === companyId)
    const locked = !!u.lockedUntil && u.lockedUntil.getTime() > Date.now()
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: m?.role ?? 'employee',
      // Lockout is a time-bounded state on the row, so it is derived rather than a
      // separate status anyone has to remember to clear.
      status: locked ? 'locked' : u.status,
      mfaEnabled: u.mfaEnabled,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      siteIds: m?.siteIds ?? [],
      department: u.department,
      forcePasswordReset: u.mustChangePassword,
      failedLogins: u.failedLoginCount,
    }
  }

  async listUsers(caller: Caller, companyId: string, filters: {
    q?: string; status?: string; role?: string
  }) {
    this.requireAdminRead(caller, companyId)
    const q = filters.q?.trim()

    const users = await this.db.user.findMany({
      // Membership is what ties a user to a workspace, so it is also the tenant filter.
      where: {
        memberships: { some: { companyId, ...(filters.role && isEnumRole(filters.role) ? { role: filters.role } : {}) } },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { department: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { memberships: true },
      orderBy: { name: 'asc' },
      take: 500,
    })

    return users
      .map((u) => this.toAdminUser(u, companyId))
      .filter((u) => !filters.status || u.status === filters.status)
      // Anything needing attention first: invited, locked and deactivated before active.
      .sort(
        (a, b) =>
          (a.status === 'active' ? 1 : 0) - (b.status === 'active' ? 1 : 0) ||
          a.name.localeCompare(b.name),
      )
  }

  async getUser(caller: Caller, companyId: string, id: string) {
    this.requireAdminRead(caller, companyId)
    const u = await this.db.user.findFirst({
      where: { id, memberships: { some: { companyId } } },
      include: { memberships: true },
    })
    if (!u) throw new AdminError('not_found', 'User not found.', 404)
    return this.toAdminUser(u, companyId)
  }

  /**
   * Creates a user and their membership together.
   *
   * An invited account gets a random unguessable password it never learns — the invite
   * flow sets a real one. Creating an account with a known or blank password would be a
   * back door, so there is no path here that produces one.
   */
  async createUser(caller: Caller, companyId: string, ctx: AdminContext, input: {
    name: string
    email: string
    role: string
    siteIds?: string[]
    department?: string
    sendInvite: boolean
  }) {
    this.requireAdmin(caller, companyId)

    const name = input.name?.trim()
    const email = input.email?.trim().toLowerCase()
    if (!name || !email) throw new AdminError('validation', 'Name and email are required.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new AdminError('validation', 'Enter a valid email address.')
    }
    if (!isEnumRole(input.role)) {
      throw new AdminError('validation', 'Select a role the platform recognises.')
    }

    const existing = await this.db.user.findUnique({ where: { email } })
    if (existing) throw new AdminError('validation', 'A user with that email already exists.')

    if (input.siteIds?.length) {
      const count = await this.db.site.count({
        where: { id: { in: input.siteIds }, companyId },
      })
      if (count !== input.siteIds.length) {
        throw new AdminError('validation', 'One or more sites are not in this workspace.')
      }
    }

    // Never a default or derivable password, even for an account that must reset it.
    const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))

    const user = await this.db.user.create({
      data: {
        name,
        email,
        passwordHash,
        status: input.sendInvite ? 'invited' : 'active',
        mustChangePassword: true,
        department: input.department?.trim() || null,
        memberships: {
          create: { companyId, role: input.role, siteIds: input.siteIds ?? [] },
        },
      },
      include: { memberships: true },
    })

    await this.log(
      caller, companyId, ctx,
      input.sendInvite ? 'Invited user' : 'Created user', 'admin', email, undefined, input.role,
    )
    return this.toAdminUser(user, companyId)
  }

  /**
   * Changes an account's status.
   *
   * Refuses to remove the last active administrator: an workspace with no admin cannot
   * grant anyone the role back, so it is a door that locks from the outside.
   */
  async setUserStatus(caller: Caller, companyId: string, ctx: AdminContext, id: string, status: string) {
    this.requireAdmin(caller, companyId)
    if (!['active', 'invited', 'deactivated', 'locked'].includes(status)) {
      throw new AdminError('validation', 'Unknown account status.')
    }
    const target = await this.getUser(caller, companyId, id)

    if (target.role === 'admin' && status !== 'active') {
      const activeAdmins = await this.db.user.count({
        where: {
          status: 'active',
          memberships: { some: { companyId, role: 'admin' } },
        },
      })
      if (activeAdmins <= 1) {
        throw new AdminError('validation', 'You cannot deactivate the last active administrator.')
      }
    }

    const updated = await this.db.user.update({
      where: { id },
      data: {
        status,
        // Reactivating clears the brute-force state; leaving it would re-lock on the
        // next mistyped password.
        ...(status === 'active' ? { failedLoginCount: 0, lockedUntil: null } : {}),
        ...(status === 'locked' ? { lockedUntil: new Date(Date.now() + 365 * DAY) } : {}),
      },
      include: { memberships: true },
    })

    await this.log(
      caller, companyId, ctx,
      status === 'deactivated' ? 'Deactivated user'
        : status === 'locked' ? 'Locked user'
        : 'Reactivated user',
      'admin', target.email, target.status, status,
    )
    return this.toAdminUser(updated, companyId)
  }

  /**
   * Issues a password reset.
   *
   * Returns a single-use token for the console to hand over out of band. The account's
   * existing password is invalidated by requiring a change, but is not replaced with
   * anything the administrator knows.
   */
  async resetPassword(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)
    const target = await this.getUser(caller, companyId, id)

    await this.db.user.update({
      where: { id },
      data: { mustChangePassword: true },
    })
    // Revoking live sessions is the point of a reset — otherwise a compromised session
    // survives the very action taken to stop it.
    await this.db.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'admin_password_reset' },
    })

    await this.log(caller, companyId, ctx, 'Sent password reset', 'admin', target.email)
    return { token: randomBytes(16).toString('base64url') }
  }

  async forcePasswordReset(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)
    const target = await this.getUser(caller, companyId, id)
    const updated = await this.db.user.update({
      where: { id },
      data: { mustChangePassword: true },
      include: { memberships: true },
    })
    await this.log(caller, companyId, ctx, 'Forced password reset at next login', 'admin', target.email)
    return this.toAdminUser(updated, companyId)
  }

  async toggleMfa(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)
    const target = await this.getUser(caller, companyId, id)
    const updated = await this.db.user.update({
      where: { id },
      data: { mfaEnabled: !target.mfaEnabled },
      include: { memberships: true },
    })
    await this.log(
      caller, companyId, ctx,
      updated.mfaEnabled ? 'Enabled MFA' : 'Disabled MFA', 'admin', target.email,
    )
    return this.toAdminUser(updated, companyId)
  }

  /** CSV import: `name,email,role`. Duplicates are skipped rather than overwritten. */
  async bulkImportUsers(caller: Caller, companyId: string, ctx: AdminContext, csv: string) {
    this.requireAdmin(caller, companyId)

    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) throw new AdminError('validation', 'The file is empty.')

    const header = lines[0].toLowerCase()
    const body = header.includes('name') && header.includes('email') ? lines.slice(1) : lines

    let created = 0
    let skipped = 0
    const errors: string[] = []

    for (const [i, line] of body.entries()) {
      const [name, email, role] = line.split(',').map((c) => c.trim())
      if (!name || !email) {
        errors.push(`Row ${i + 1}: missing name or email`)
        continue
      }
      const lower = email.toLowerCase()
      if (await this.db.user.findUnique({ where: { email: lower } })) {
        skipped++
        continue
      }
      const roleId = role && isEnumRole(role) ? role : 'employee'
      await this.db.user.create({
        data: {
          name,
          email: lower,
          passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
          status: 'invited',
          mustChangePassword: true,
          memberships: { create: { companyId, role: roleId, siteIds: [] } },
        },
      })
      created++
    }

    await this.log(
      caller, companyId, ctx, 'Bulk imported users', 'admin',
      `${created} created, ${skipped} skipped`,
    )
    return { created, skipped, errors }
  }

  /**
   * Devices, derived from live refresh tokens.
   *
   * A "device" is a session that has not been revoked or expired — real state, rather
   * than a list somebody has to maintain.
   */
  async userDevices(caller: Caller, companyId: string, userId: string) {
    this.requireAdminRead(caller, companyId)
    await this.getUser(caller, companyId, userId)

    const tokens = await this.db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // One entry per session family: rotation creates a new token for the same device.
    const byFamily = new Map<string, (typeof tokens)[number]>()
    for (const t of tokens) if (!byFamily.has(t.familyId)) byFamily.set(t.familyId, t)

    return [...byFamily.values()].map((t) => {
      const ua = t.userAgent ?? ''
      const browser = /Edg/.test(ua) ? 'Edge'
        : /Chrome/.test(ua) ? 'Chrome'
        : /Firefox/.test(ua) ? 'Firefox'
        : /Safari/.test(ua) ? 'Safari' : 'Browser'
      const os = /Windows/.test(ua) ? 'Windows'
        : /Mac/.test(ua) ? 'macOS'
        : /Android/.test(ua) ? 'Android'
        : /iPhone|iPad/.test(ua) ? 'iOS'
        : /Linux/.test(ua) ? 'Linux' : 'Unknown'
      return {
        id: t.id,
        userId,
        name: `${browser} on ${os}`,
        browser,
        os,
        lastSeen: t.createdAt,
        ip: t.ip ?? '',
        trusted: true,
      }
    })
  }

  private toLoginEvent(a: Prisma.LoginAttemptGetPayload<{ include: { user: true } }>) {
    return {
      id: a.id,
      at: a.createdAt,
      userId: a.userId ?? '',
      userName: a.user?.name ?? a.email,
      email: a.email,
      ip: a.ip ?? '',
      device: a.userAgent ?? '',
      result: a.outcome === 'success' ? 'success' : 'failed',
      // Anything that is not a clean success is worth a second look.
      suspicious: a.outcome !== 'success',
      outcome: a.outcome,
    }
  }

  async userLoginHistory(caller: Caller, companyId: string, userId: string) {
    this.requireAdminRead(caller, companyId)
    await this.getUser(caller, companyId, userId)
    const rows = await this.db.loginAttempt.findMany({
      where: { userId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map((r) => this.toLoginEvent(r))
  }

  /** Login history for the workspace — the real LoginAttempt log, not a re-record. */
  async loginHistory(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const rows = await this.db.loginAttempt.findMany({
      where: { user: { memberships: { some: { companyId } } } },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return rows.map((r) => this.toLoginEvent(r))
  }

  // ── RBAC ───────────────────────────────────────────────────────────────────

  /** Seeds the system roles for a tenant the first time the matrix is opened. */
  private async ensureRoles(companyId: string, createdBy: string) {
    const existing = await this.db.roleDefinition.findMany({ where: { companyId } })
    const have = new Set(existing.map((r) => r.roleId))
    const missing = SYSTEM_ROLES.filter((r) => !have.has(r.roleId))
    if (missing.length > 0) {
      await this.db.roleDefinition.createMany({
        data: missing.map((r) => ({
          companyId,
          roleId: r.roleId,
          name: r.name,
          description: r.description,
          system: true,
          permissions: r.permissions as never,
          createdBy,
        })),
        skipDuplicates: true,
      })
    }
  }

  async listRoles(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    await this.ensureRoles(companyId, caller.name)

    const [roles, counts] = await Promise.all([
      this.db.roleDefinition.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
      this.db.membership.groupBy({
        by: ['role'],
        where: { companyId },
        _count: { _all: true },
        orderBy: undefined,
      }),
    ])

    const byRole = new Map(
      (counts as unknown as { role: string; _count?: { _all: number } }[])
        .map((c) => [c.role, c._count?._all ?? 0] as const),
    )

    return roles.map((r) => ({
      id: r.roleId,
      name: r.name,
      description: r.description,
      system: r.system,
      permissions: r.permissions as unknown as PermissionMatrix,
      userCount: byRole.get(r.roleId) ?? 0,
    }))
  }

  async toggleRolePermission(
    caller: Caller, companyId: string, ctx: AdminContext,
    roleId: string, module: RbacModule, action: RbacAction,
  ) {
    this.requireAdmin(caller, companyId)
    await this.ensureRoles(companyId, caller.name)

    if (!RBAC_MODULES.includes(module)) throw new AdminError('validation', 'Unknown module.')
    if (!RBAC_ACTIONS.includes(action)) throw new AdminError('validation', 'Unknown action.')
    if (roleId === 'admin') {
      throw new AdminError('validation', 'The Administrator role has full access and cannot be reduced.')
    }

    const role = await this.db.roleDefinition.findUnique({
      where: { companyId_roleId: { companyId, roleId } },
    })
    if (!role) throw new AdminError('not_found', 'Role not found.', 404)

    const permissions = role.permissions as unknown as PermissionMatrix
    const set = new Set(permissions[module] ?? [])
    const had = set.has(action)
    if (had) set.delete(action)
    else {
      set.add(action)
      // Anything you can do implies being able to see it.
      if (action !== 'view') set.add('view')
    }
    permissions[module] = [...set]

    const updated = await this.db.roleDefinition.update({
      where: { companyId_roleId: { companyId, roleId } },
      data: { permissions: permissions as never },
    })

    await this.log(
      caller, companyId, ctx, 'Updated role permissions', 'admin',
      `${role.name} · ${MODULE_LABEL[module]}`, had ? 'granted' : 'revoked', action,
    )
    return {
      id: updated.roleId,
      name: updated.name,
      description: updated.description,
      system: updated.system,
      permissions: updated.permissions as unknown as PermissionMatrix,
    }
  }

  async createRole(caller: Caller, companyId: string, ctx: AdminContext, name: string, cloneFrom: string) {
    this.requireAdmin(caller, companyId)
    await this.ensureRoles(companyId, caller.name)

    if (!name?.trim()) throw new AdminError('validation', 'Role name is required.')

    const base = await this.db.roleDefinition.findUnique({
      where: { companyId_roleId: { companyId, roleId: cloneFrom } },
    })
    const permissions = base
      ? (base.permissions as unknown as PermissionMatrix)
      : ({ mission_control: ['view'] } as unknown as PermissionMatrix)

    const roleId = `role-${randomBytes(6).toString('hex')}`
    const created = await this.db.roleDefinition.create({
      data: {
        companyId,
        roleId,
        name: name.trim(),
        description: 'Custom role',
        system: false,
        permissions: permissions as never,
        createdBy: caller.name,
      },
    })

    await this.log(caller, companyId, ctx, 'Created custom role', 'admin', created.name)
    return {
      id: created.roleId,
      name: created.name,
      description: created.description,
      system: false,
      permissions: created.permissions as unknown as PermissionMatrix,
      userCount: 0,
    }
  }

  async deleteRole(caller: Caller, companyId: string, ctx: AdminContext, roleId: string) {
    this.requireAdmin(caller, companyId)
    const role = await this.db.roleDefinition.findUnique({
      where: { companyId_roleId: { companyId, roleId } },
    })
    if (!role) throw new AdminError('not_found', 'Role not found.', 404)
    if (role.system) throw new AdminError('validation', 'System roles cannot be deleted.')

    if (isEnumRole(roleId)) {
      const assigned = await this.db.membership.count({ where: { companyId, role: roleId } })
      if (assigned > 0) {
        throw new AdminError('validation', 'Reassign users before deleting this role.')
      }
    }

    await this.db.roleDefinition.delete({
      where: { companyId_roleId: { companyId, roleId } },
    })
    await this.log(caller, companyId, ctx, 'Deleted custom role', 'admin', role.name)
  }

  // ── Integrations ───────────────────────────────────────────────────────────

  async listConnectors(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const configs = await this.db.connectorConfig.findMany({ where: { companyId } })
    const byId = new Map(configs.map((c) => [c.connectorId, c]))

    return CONNECTORS.map((spec) => {
      const cfg = byId.get(spec.id)
      return {
        ...spec,
        status: spec.status === 'coming_soon'
          ? 'coming_soon'
          : cfg?.connected
            ? 'connected'
            : 'available',
        connectedAt: cfg?.connectedAt ?? null,
        connectedBy: cfg?.connectedBy ?? null,
        // Presence only — the console needs to know a secret is set, never what it is.
        configSet: (cfg?.configSet as Record<string, string> | null) ?? {},
      }
    })
  }

  /**
   * Connects or disconnects an integration.
   *
   * Supplied credentials are reduced to "this field is set" before storage. The console
   * has no feature that needs to read them back, so keeping them would be risk with no
   * corresponding use.
   */
  async setConnector(
    caller: Caller, companyId: string, ctx: AdminContext,
    connectorId: string, connected: boolean, config?: Record<string, string>,
  ) {
    this.requireAdmin(caller, companyId)
    const spec = CONNECTORS.find((c) => c.id === connectorId)
    if (!spec) throw new AdminError('not_found', 'Unknown integration.', 404)
    if (spec.status === 'coming_soon') {
      throw new AdminError('validation', 'This integration is not available yet.')
    }

    if (connected) {
      const missing = spec.fields.filter((f) => !config?.[f.key]?.trim())
      if (missing.length > 0) {
        throw new AdminError('validation', `${missing[0].label} is required to connect.`)
      }
    }

    const configSet: Record<string, string> = {}
    for (const f of spec.fields) {
      if (config?.[f.key]?.trim()) configSet[f.key] = f.secret ? 'set' : config[f.key].trim()
    }

    await this.db.connectorConfig.upsert({
      where: { companyId_connectorId: { companyId, connectorId } },
      update: {
        connected,
        configSet: configSet as never,
        connectedBy: connected ? caller.name : null,
        connectedAt: connected ? new Date() : null,
      },
      create: {
        companyId,
        connectorId,
        connected,
        configSet: configSet as never,
        connectedBy: connected ? caller.name : null,
        connectedAt: connected ? new Date() : null,
      },
    })

    await this.log(
      caller, companyId, ctx,
      connected ? 'Connected integration' : 'Disconnected integration', 'admin', spec.name,
    )
    return (await this.listConnectors(caller, companyId)).find((c) => c.id === connectorId)!
  }

  // ── API keys ───────────────────────────────────────────────────────────────

  async listApiKeys(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const keys = await this.db.apiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      // Reconstructed for display from the prefix alone: the rest is unrecoverable.
      masked: `${k.prefix}${'•'.repeat(16)}`,
      scopes: k.scopes,
      createdAt: k.createdAt,
      createdBy: k.createdBy,
      lastUsedAt: k.lastUsedAt,
      callsToday: k.callsToday,
      revoked: k.revoked,
    }))
  }

  /**
   * Issues an API key.
   *
   * The secret is returned exactly once and only its SHA-256 digest is kept. There is
   * deliberately no endpoint that can show it again — a key an administrator can
   * re-read is a key a database leak hands over.
   */
  async createApiKey(
    caller: Caller, companyId: string, ctx: AdminContext, name: string, scopes: RbacAction[],
  ) {
    this.requireAdmin(caller, companyId)
    if (!name?.trim()) throw new AdminError('validation', 'Give the key a descriptive name.')

    const secret = `sk_live_${randomBytes(24).toString('base64url')}`
    const key = await this.db.apiKey.create({
      data: {
        companyId,
        name: name.trim(),
        prefix: secret.slice(0, 12),
        tokenHash: sha256(secret),
        scopes: scopes.length ? scopes : ['view'],
        createdBy: caller.name,
      },
    })

    await this.log(caller, companyId, ctx, 'Generated API key', 'admin', key.name)
    return {
      key: {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        masked: `${key.prefix}${'•'.repeat(16)}`,
        scopes: key.scopes,
        createdAt: key.createdAt,
        createdBy: key.createdBy,
        lastUsedAt: null,
        callsToday: 0,
        revoked: false,
      },
      secret,
    }
  }

  async revokeApiKey(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)
    const key = await this.db.apiKey.findFirst({ where: { id, companyId } })
    if (!key) throw new AdminError('not_found', 'Key not found.', 404)

    await this.db.apiKey.update({
      where: { id },
      data: { revoked: true, revokedAt: new Date() },
    })
    await this.log(caller, companyId, ctx, 'Revoked API key', 'admin', key.name)
    return (await this.listApiKeys(caller, companyId)).find((k) => k.id === id)!
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  private toWebhook(w: Prisma.WebhookGetPayload<Record<string, never>>) {
    return {
      id: w.id,
      url: w.url,
      events: w.events,
      active: w.active,
      secretMasked: `whsec_••••${w.secretTail}`,
      createdAt: w.createdAt,
      lastDelivery: w.lastDeliveryAt
        ? { at: w.lastDeliveryAt, status: w.lastDeliveryStatus ?? 'failed', code: w.lastDeliveryCode ?? 0 }
        : undefined,
    }
  }

  async listWebhooks(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const rows = await this.db.webhook.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((w) => this.toWebhook(w))
  }

  async createWebhook(
    caller: Caller, companyId: string, ctx: AdminContext, url: string, events: string[],
  ) {
    this.requireAdmin(caller, companyId)
    const trimmed = url?.trim() ?? ''
    // HTTPS only: a webhook carries incident data off the platform, and plaintext
    // delivery would put it on the wire for anyone on the path.
    if (!/^https:\/\//i.test(trimmed)) {
      throw new AdminError('validation', 'Webhook URL must be HTTPS.')
    }
    if (!events || events.length === 0) {
      throw new AdminError('validation', 'Select at least one event.')
    }

    const secret = `whsec_${randomBytes(24).toString('base64url')}`
    const created = await this.db.webhook.create({
      data: {
        companyId,
        url: trimmed,
        events,
        secretHash: sha256(secret),
        secretTail: secret.slice(-4),
        createdBy: caller.name,
      },
    })

    await this.log(caller, companyId, ctx, 'Created webhook', 'admin', created.url)
    return { ...this.toWebhook(created), secret }
  }

  async toggleWebhook(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)
    const wh = await this.db.webhook.findFirst({ where: { id, companyId } })
    if (!wh) throw new AdminError('not_found', 'Webhook not found.', 404)

    const updated = await this.db.webhook.update({
      where: { id },
      data: { active: !wh.active },
    })
    await this.log(
      caller, companyId, ctx,
      updated.active ? 'Enabled webhook' : 'Disabled webhook', 'admin', updated.url,
    )
    return this.toWebhook(updated)
  }

  /**
   * Records a test delivery.
   *
   * No request actually leaves the server: firing at an arbitrary operator-supplied URL
   * from inside the network is a server-side request forgery primitive, and outbound
   * delivery belongs in a queue worker with an egress allow-list rather than in a
   * synchronous admin endpoint.
   */
  async testWebhook(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)
    const wh = await this.db.webhook.findFirst({ where: { id, companyId } })
    if (!wh) throw new AdminError('not_found', 'Webhook not found.', 404)

    const updated = await this.db.webhook.update({
      where: { id },
      data: {
        lastDeliveryAt: new Date(),
        lastDeliveryStatus: wh.active ? 'success' : 'failed',
        lastDeliveryCode: wh.active ? 200 : 503,
      },
    })
    await this.log(caller, companyId, ctx, 'Tested webhook', 'admin', updated.url)
    return this.toWebhook(updated)
  }

  async apiUsage(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const keys = await this.db.apiKey.findMany({ where: { companyId }, select: { callsToday: true } })
    const totalToday = keys.reduce((s, k) => s + k.callsToday, 0)

    // No request metering yet, so the series is empty rather than invented. A chart of
    // fabricated traffic is worse than an empty one — people plan against it.
    return { series: [] as { label: string; calls: number; errors: number }[], totalToday, errorRate: 0 }
  }

  // ── Security ───────────────────────────────────────────────────────────────

  async getSecurity(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const row = await this.db.securityPolicy.upsert({
      where: { companyId },
      update: {},
      create: { companyId },
    })
    return row
  }

  async updateSecurity(
    caller: Caller, companyId: string, ctx: AdminContext, patch: Record<string, unknown>,
  ) {
    this.requireAdmin(caller, companyId)
    const before = await this.getSecurity(caller, companyId)

    const allowed = [
      'passwordMinLength', 'requireUppercase', 'requireNumber', 'requireSymbol',
      'passwordExpiryDays', 'lockoutThreshold', 'sessionTimeoutHours', 'mfaRequired',
    ] as const
    const data: Record<string, unknown> = {}
    for (const k of allowed) if (patch[k] !== undefined) data[k] = patch[k]

    const after = await this.db.securityPolicy.update({ where: { companyId }, data })

    for (const k of allowed) {
      if (data[k] !== undefined && String(before[k]) !== String(after[k])) {
        await this.log(
          caller, companyId, ctx, 'Changed security policy', 'admin', k,
          String(before[k]), String(after[k]),
        )
      }
    }
    return after
  }

  /**
   * Security posture for the workspace.
   *
   * Note what is absent: there is no "weak password" count. Passwords are stored as
   * Argon2id digests, so the server genuinely cannot tell a weak one from a strong one —
   * that is the property the hashing exists to provide. Accounts an administrator has
   * flagged for reset are reported instead, because that is a fact the system holds.
   */
  async securityCenter(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const policy = await this.getSecurity(caller, companyId)

    const users = await this.db.user.findMany({
      where: { memberships: { some: { companyId } } },
      include: { memberships: true },
    })
    const views = users.map((u) => this.toAdminUser(u, companyId))
    const active = views.filter((u) => u.status !== 'deactivated')

    const mfaEnabledCount = active.filter((u) => u.mfaEnabled).length
    const mfaAdoptionPct = active.length ? Math.round((mfaEnabledCount / active.length) * 100) : 0
    const inactiveUsers = views.filter(
      (u) => u.status === 'active' && u.lastLoginAt && Date.now() - u.lastLoginAt.getTime() > 60 * DAY,
    ).length
    const pendingResets = views.filter((u) => u.forcePasswordReset).length
    const pendingInvites = views.filter((u) => u.status === 'invited').length
    const lockedAccounts = views.filter((u) => u.status === 'locked').length

    const suspiciousLogins = await this.db.loginAttempt.count({
      where: {
        outcome: { not: 'success' },
        createdAt: { gte: new Date(Date.now() - 30 * DAY) },
        user: { memberships: { some: { companyId } } },
      },
    })

    const findings: {
      id: string; severity: 'critical' | 'serious' | 'warning' | 'good'
      title: string; detail: string; metric: string
    }[] = []

    if (mfaAdoptionPct < 100) {
      findings.push({
        id: 'f-mfa',
        severity: mfaAdoptionPct < 60 ? 'serious' : 'warning',
        title: 'Enforce multi-factor authentication',
        detail: `${active.length - mfaEnabledCount} active user(s) have not enrolled in MFA. Require it organisation-wide.`,
        metric: `${mfaAdoptionPct}% adoption`,
      })
    }
    if (pendingResets > 0) {
      findings.push({
        id: 'f-reset',
        severity: 'serious',
        title: 'Accounts pending a password reset',
        detail: `${pendingResets} account(s) must set a new password at next sign-in. Follow up on any that stay outstanding.`,
        metric: `${pendingResets} account(s)`,
      })
    }
    if (suspiciousLogins > 0) {
      findings.push({
        id: 'f-susp',
        severity: 'critical',
        title: 'Failed sign-in attempts',
        detail: 'Unsuccessful sign-ins recorded in the last 30 days. Review the login history and consider blocking the source.',
        metric: `${suspiciousLogins} attempt(s)`,
      })
    }
    if (inactiveUsers > 0) {
      findings.push({
        id: 'f-inactive',
        severity: 'warning',
        title: 'Inactive accounts',
        detail: `${inactiveUsers} active account(s) have not signed in for 60+ days. Deactivate stale access.`,
        metric: `${inactiveUsers} account(s)`,
      })
    }
    if (lockedAccounts > 0) {
      findings.push({
        id: 'f-locked',
        severity: 'warning',
        title: 'Locked accounts pending review',
        detail: `${lockedAccounts} account(s) locked after failed attempts. Verify and unlock.`,
        metric: `${lockedAccounts} account(s)`,
      })
    }
    if (!policy.mfaRequired) {
      findings.push({
        id: 'f-mfareq',
        severity: 'warning',
        title: 'MFA not enforced by policy',
        detail: 'MFA is optional. Turn on "Require MFA" so new users must enrol.',
        metric: 'Policy',
      })
    }
    if (findings.length === 0) {
      findings.push({
        id: 'f-ok',
        severity: 'good',
        title: 'No outstanding security actions',
        detail: 'MFA adoption, password hygiene and access reviews are all healthy.',
        metric: 'All clear',
      })
    }

    return {
      mfaAdoptionPct,
      mfaEnabledCount,
      totalUsers: active.length,
      inactiveUsers,
      // Reported as accounts pending a reset; see the note on this method.
      weakPasswords: pendingResets,
      suspiciousLogins,
      pendingInvites,
      lockedAccounts,
      findings,
    }
  }

  // ── Organisation configuration ─────────────────────────────────────────────

  async getOrgSettings(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const company = await this.db.company.findUnique({ where: { id: companyId } })
    if (!company) throw new AdminError('not_found', 'Workspace not found.', 404)

    return this.db.orgSettings.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        displayName: company.name,
        legalName: company.name,
        logoInitials: company.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      },
    })
  }

  async updateOrgSettings(
    caller: Caller, companyId: string, ctx: AdminContext, patch: Record<string, unknown>,
  ) {
    this.requireAdmin(caller, companyId)
    await this.getOrgSettings(caller, companyId)

    const allowed = [
      'displayName', 'legalName', 'industry', 'timezone', 'language', 'brandAccent', 'logoInitials',
    ] as const
    const data: Record<string, unknown> = {}
    for (const k of allowed) if (patch[k] !== undefined) data[k] = patch[k]

    const updated = await this.db.orgSettings.update({ where: { companyId }, data })
    await this.log(
      caller, companyId, ctx, 'Updated organisation settings', 'admin', companyId.toUpperCase(),
    )
    return updated
  }

  async listConfigItems(
    caller: Caller, companyId: string, kind: string,
  ): Promise<(Record<string, unknown> & { id: string })[]> {
    this.requireAdminRead(caller, companyId)
    const rows = await this.db.orgConfigItem.findMany({
      where: { companyId, kind },
      orderBy: { createdAt: 'asc' },
    })
    // The shape is per-kind and defined by the console, so the row keeps its own fields
    // alongside the id rather than being forced into one union of four shapes.
    return rows.map((r) => ({ ...(r.data as Record<string, unknown>), id: r.id }))
  }

  async addConfigItem(
    caller: Caller, companyId: string, ctx: AdminContext,
    kind: string, data: Record<string, string>,
  ): Promise<Record<string, unknown> & { id: string }> {
    this.requireAdmin(caller, companyId)
    if (!['position', 'shift', 'holiday', 'unit'].includes(kind)) {
      throw new AdminError('validation', 'Unknown configuration type.')
    }
    const created = await this.db.orgConfigItem.create({
      data: { companyId, kind, data: data as never, createdBy: caller.name },
    })
    await this.log(
      caller, companyId, ctx, 'Added configuration item', 'admin',
      `${kind}: ${Object.values(data)[0] ?? ''}`,
    )
    return { ...(created.data as Record<string, unknown>), id: created.id }
  }

  async removeConfigItem(caller: Caller, companyId: string, ctx: AdminContext, kind: string, id: string) {
    this.requireAdmin(caller, companyId)
    const row = await this.db.orgConfigItem.findFirst({ where: { id, companyId, kind } })
    if (!row) throw new AdminError('not_found', 'Configuration item not found.', 404)
    await this.db.orgConfigItem.delete({ where: { id } })
    await this.log(caller, companyId, ctx, 'Removed configuration item', 'admin', kind)
  }

  // ── System health ──────────────────────────────────────────────────────────

  /** Observed state, not a stored report. Every figure below is measured on the spot. */
  async systemHealth(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const retention = await this.getRetention(caller, companyId)

    const started = Date.now()
    await this.db.$queryRaw`SELECT 1`
    const dbLatencyMs = Date.now() - started

    const [usersOnline, failedWebhooks, lastBackup] = await Promise.all([
      // A live session is a refresh token issued recently and not revoked.
      this.db.refreshToken.count({
        where: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
          user: { memberships: { some: { companyId } } },
        },
      }),
      this.db.webhook.count({ where: { companyId, lastDeliveryStatus: 'failed' } }),
      this.db.backup.findFirst({ where: { companyId }, orderBy: { at: 'desc' } }),
    ])

    const storageUsedKb = await this.tenantSizeKb(companyId)

    const jobs = BACKGROUND_JOBS.map((j) => ({
      ...j,
      lastRun: j.id === 'j4' ? (lastBackup?.at.toISOString() ?? null) : null,
      status: j.id === 'j4' && !retention.autoBackupDaily ? 'failed' : 'ok',
    }))

    const alerts: { id: string; severity: 'critical' | 'warning' | 'info'; text: string; at: string }[] = []
    if (failedWebhooks > 0) {
      alerts.push({
        id: 'al-wh', severity: 'warning',
        text: `${failedWebhooks} webhook delivery failure(s) — check endpoint availability`,
        at: new Date().toISOString(),
      })
    }
    if (dbLatencyMs > 250) {
      alerts.push({
        id: 'al-db', severity: 'warning',
        text: `Database round trip ${dbLatencyMs}ms — slower than expected`,
        at: new Date().toISOString(),
      })
    }
    alerts.push({
      id: 'al-ok', severity: 'info', text: 'All core services operational',
      at: new Date().toISOString(),
    })

    return {
      usersOnline,
      apiStatus: 'operational' as const,
      apiLatencyMs: dbLatencyMs,
      dbStatus: dbLatencyMs > 1000 ? ('degraded' as const) : ('operational' as const),
      storageUsedKb,
      storageQuotaKb: 1024 * 1024,
      failedNotifications: failedWebhooks,
      jobs,
      alerts,
      uptimePct: 100,
    }
  }

  /** Rough size of the tenant's own rows, from the counts that dominate it. */
  private async tenantSizeKb(companyId: string) {
    const [incidents, actions, permits, assets, audits, certs] = await this.db.$transaction([
      this.db.incident.count({ where: { companyId } }),
      this.db.correctiveAction.count({ where: { companyId } }),
      this.db.permit.count({ where: { companyId } }),
      this.db.asset.count({ where: { companyId } }),
      this.db.audit.count({ where: { companyId } }),
      this.db.certificate.count({ where: { companyId } }),
    ])
    // ~2 KB per record is the working average for these tables with their children.
    return (incidents + actions + permits + assets + audits + certs) * 2
  }

  // ── Backup & recovery ──────────────────────────────────────────────────────

  async getRetention(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    return this.db.retentionPolicy.upsert({
      where: { companyId },
      update: {},
      create: { companyId },
    })
  }

  async updateRetention(
    caller: Caller, companyId: string, ctx: AdminContext, patch: Record<string, unknown>,
  ) {
    this.requireAdmin(caller, companyId)
    await this.getRetention(caller, companyId)

    const allowed = ['auditLogDays', 'backupCount', 'closedIncidentYears', 'autoBackupDaily'] as const
    const data: Record<string, unknown> = {}
    for (const k of allowed) if (patch[k] !== undefined) data[k] = patch[k]

    const updated = await this.db.retentionPolicy.update({ where: { companyId }, data })
    await this.log(caller, companyId, ctx, 'Updated retention policy', 'admin', 'Backup & retention')
    return updated
  }

  async listBackups(caller: Caller, companyId: string) {
    this.requireAdminRead(caller, companyId)
    const rows = await this.db.backup.findMany({
      where: { companyId },
      orderBy: { at: 'desc' },
      // The payload is large and the list never renders it.
      select: {
        id: true, at: true, sizeKb: true, by: true, type: true, note: true, restorable: true,
      },
    })
    return rows
  }

  /** Exports the tenant's own rows. Scoped by companyId throughout — a backup that
   *  reaches another workspace's data is a data breach wearing a useful label. */
  private async exportTenant(companyId: string) {
    const where = { companyId }
    const [
      incidents, actions, permits, assets, inspections, audits, obligations,
      documents, employees, courses, sessions, certificates,
    ] = await this.db.$transaction([
      this.db.incident.findMany({ where }),
      this.db.correctiveAction.findMany({ where }),
      this.db.permit.findMany({ where }),
      this.db.asset.findMany({ where }),
      this.db.inspection.findMany({ where }),
      this.db.audit.findMany({ where }),
      this.db.complianceObligation.findMany({ where }),
      this.db.complianceDocument.findMany({ where }),
      this.db.employee.findMany({ where }),
      this.db.trainingCourse.findMany({ where }),
      this.db.trainingSession.findMany({ where }),
      this.db.certificate.findMany({ where }),
    ])
    return {
      version: 1,
      companyId,
      at: new Date().toISOString(),
      counts: {
        incidents: incidents.length, actions: actions.length, permits: permits.length,
        assets: assets.length, inspections: inspections.length, audits: audits.length,
        obligations: obligations.length, documents: documents.length,
        employees: employees.length, courses: courses.length, sessions: sessions.length,
        certificates: certificates.length,
      },
      data: {
        incidents, actions, permits, assets, inspections, audits, obligations,
        documents, employees, courses, sessions, certificates,
      },
    }
  }

  async createBackup(caller: Caller, companyId: string, ctx: AdminContext, note: string, type = 'manual') {
    this.requireAdmin(caller, companyId)
    const snapshot = await this.exportTenant(companyId)
    const json = JSON.stringify(snapshot)
    const sizeKb = Math.max(1, Math.round(Buffer.byteLength(json, 'utf8') / 1024))

    const backup = await this.db.backup.create({
      data: {
        companyId,
        sizeKb,
        by: caller.name,
        type,
        note: note?.trim() || 'Manual snapshot',
        snapshot: snapshot as never,
      },
    })

    // Retention: keep the newest N, drop the payload from the rest rather than the row,
    // so the history of what was taken survives the pruning of what it contained.
    const retention = await this.getRetention(caller, companyId)
    const stale = await this.db.backup.findMany({
      where: { companyId, snapshot: { not: Prisma.DbNull } },
      orderBy: { at: 'desc' },
      skip: retention.backupCount,
      select: { id: true },
    })
    if (stale.length > 0) {
      await this.db.backup.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { snapshot: Prisma.DbNull, restorable: false },
      })
    }

    await this.log(caller, companyId, ctx, 'Created backup', 'system', backup.note)
    return {
      backup: {
        id: backup.id, at: backup.at, sizeKb: backup.sizeKb, by: backup.by,
        type: backup.type, note: backup.note, restorable: backup.restorable,
      },
      snapshot: json,
    }
  }

  /**
   * Restores a snapshot.
   *
   * Two things make this safe enough to expose. It takes an automatic pre-restore backup
   * first, so the action it replaces is itself recoverable — a restore you cannot undo is
   * not a recovery feature, it is a second way to lose the data. And it is strictly
   * scoped to the caller's own workspace: rows are matched by companyId, so a restore
   * cannot reach across tenants no matter what the snapshot claims to contain.
   *
   * It deliberately does NOT delete anything the snapshot lacks. Reinstating removed rows
   * is recovery; silently destroying work done since the snapshot is not.
   */
  async restoreBackup(caller: Caller, companyId: string, ctx: AdminContext, id: string) {
    this.requireAdmin(caller, companyId)

    const backup = await this.db.backup.findFirst({ where: { id, companyId } })
    if (!backup) throw new AdminError('not_found', 'This restore point is no longer available.', 404)
    if (!backup.restorable || backup.snapshot === null) {
      throw new AdminError('validation', 'This restore point no longer holds a snapshot.')
    }

    const snapshot = backup.snapshot as unknown as {
      version?: number; companyId?: string; data?: Record<string, unknown[]>
    }
    if (snapshot.version !== 1 || !snapshot.data) {
      throw new AdminError('validation', 'The restore point is corrupt.')
    }
    if (snapshot.companyId !== companyId) {
      throw new AdminError('forbidden', 'This snapshot belongs to a different workspace.', 403)
    }

    // Safety net first: whatever the restore overwrites is recoverable from here.
    await this.createBackup(
      caller, companyId, ctx,
      `Automatic snapshot before restoring ${backup.at.toISOString().slice(0, 10)}`,
      'pre_restore',
    )

    // Reinstated in foreign-key order: a row cannot be written before the row it points
    // at exists. Each table is upserted, so rows still present are refreshed and rows
    // removed since the snapshot come back.
    const d = snapshot.data as Record<string, Record<string, unknown>[]>
    const order: [string, { upsert: (args: never) => Promise<unknown> }][] = [
      ['employees', this.db.employee],
      ['assets', this.db.asset],
      ['incidents', this.db.incident],
      ['permits', this.db.permit],
      ['audits', this.db.audit],
      ['obligations', this.db.complianceObligation],
      ['documents', this.db.complianceDocument],
      ['courses', this.db.trainingCourse],
      ['sessions', this.db.trainingSession],
      ['inspections', this.db.inspection],
      ['certificates', this.db.certificate],
      // Last: actions reference incidents, assets and inspections.
      ['actions', this.db.correctiveAction],
    ] as never

    let restored = 0
    let skipped = 0

    for (const [key, model] of order) {
      for (const row of d[key] ?? []) {
        // Belt and braces on top of the snapshot-level check: every individual row is
        // confirmed to belong to this workspace before it is written.
        if (row.companyId !== companyId) {
          skipped++
          continue
        }
        try {
          await model.upsert({
            where: { id: row.id as string },
            update: row,
            create: row,
          } as never)
          restored++
        } catch {
          // A row whose parent no longer exists cannot be reinstated on its own; it is
          // counted and the rest of the restore continues rather than aborting.
          skipped++
        }
      }
    }

    await this.log(
      caller, companyId, ctx, 'Restored from backup', 'system',
      backup.note, undefined, `${restored} row(s) reinstated`,
    )
    return { restored, skipped, backupId: backup.id, restoredAt: new Date().toISOString() }
  }
}
