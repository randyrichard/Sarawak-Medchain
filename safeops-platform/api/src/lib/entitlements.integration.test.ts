import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { OrgAdminService, OrgAdminError } from './orgAdminService.js'
import { AdminService, AdminError } from './adminService.js'
import { OrgService } from './orgService.js'
import { siteAllowance } from './entitlements.js'
import type { Caller } from './incidentService.js'

/**
 * Plan limits, against a REAL PostgreSQL database.
 *
 * Standard and Premium differ by two things the product enforces: how many sites a
 * workspace may run, and whether it may create API keys and webhooks. Everything else -
 * every module, every user, scheduled report delivery - is the same on both, deliberately.
 *
 * What is tested here is mostly the edges, because the happy path is one comparison and
 * the edges are where a billing limit does real damage:
 *
 *   - a workspace over its limit keeps everything it has, and can still see it
 *   - turning something off is never gated, because that is the way back under the line
 *   - a legacy or unrecognised plan is granted everything rather than nothing
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const orgAdmin = new OrgAdminService(db)
const admin = new AdminService(db)
const org = new OrgService(db)

const STD = 'ent-itest-standard'
const PRM = 'ent-itest-premium'
const LGC = 'ent-itest-legacy'
const UNK = 'ent-itest-unknown'
const ALL = [STD, PRM, LGC, UNK]

const ctx = { ip: '10.0.0.9', device: 'vitest' }

const adminOf = (companyId: string): Caller => ({
  userId: `ent-admin-${companyId}`,
  name: 'Ent Admin',
  roles: [{ companyId, role: 'admin' as never, siteIds: [] }],
})

/** Sites created by a test, cleared between them so each starts from a known count. */
async function clearSites() {
  await db.site.deleteMany({ where: { companyId: { in: ALL } } })
}

d('Plan entitlements — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, plan, name] of [
      [STD, 'standard', 'Ent Standard Co'],
      [PRM, 'premium', 'Ent Premium Co'],
      [LGC, 'enterprise', 'Ent Legacy Co'],
      // A plan key nobody recognises: the shape a hand-edited row takes.
      [UNK, 'platinum', 'Ent Unknown Co'],
    ]) {
      await db.company.upsert({
        where: { id }, update: { plan }, create: { id, name, plan },
      })
    }
  })

  afterAll(async () => {
    await db.adminAuditEntry.deleteMany({ where: { companyId: { in: ALL } } })
    await db.apiKey.deleteMany({ where: { companyId: { in: ALL } } })
    await db.webhook.deleteMany({ where: { companyId: { in: ALL } } })
    await clearSites()
    await db.company.deleteMany({ where: { id: { in: ALL } } })
    await db.$disconnect()
  })

  beforeEach(clearSites)

  // ── Sites ──────────────────────────────────────────────────────────────────

  describe('the site allowance', () => {
    it('lets a Standard workspace open every site it pays for', async () => {
      for (const name of ['Plant One', 'Plant Two', 'Plant Three']) {
        await expect(orgAdmin.createSite(adminOf(STD), STD, ctx, { name })).resolves.toBeTruthy()
      }
      expect(await db.site.count({ where: { companyId: STD } })).toBe(3)
    })

    it('refuses the one after the last one, and says what to do about it', async () => {
      for (const name of ['A', 'B', 'C']) {
        await orgAdmin.createSite(adminOf(STD), STD, ctx, { name })
      }

      const err = await orgAdmin.createSite(adminOf(STD), STD, ctx, { name: 'D' })
        .catch((e) => e)
      expect(err).toBeInstanceOf(OrgAdminError)
      expect(err.code).toBe('plan_limit')
      // 403 and not 402: nothing about this is a payment the caller can make inline, and
      // every client already knows how to render a forbidden.
      expect(err.status).toBe(403)
      // A refusal an administrator cannot act on is a support ticket. It names the plan,
      // the number, and both ways forward.
      expect(err.message).toContain('Standard')
      expect(err.message).toContain('3')
      expect(err.message).toMatch(/Deactivate/i)
      expect(err.message).toContain('Premium')

      // Refused, not partially applied.
      expect(await db.site.count({ where: { companyId: STD } })).toBe(3)
    })

    it('frees the allowance when a site is deactivated', async () => {
      for (const name of ['A', 'B', 'C']) {
        await orgAdmin.createSite(adminOf(STD), STD, ctx, { name })
      }
      const c = await db.site.findFirstOrThrow({ where: { companyId: STD, name: 'C' } })

      // Deactivating is never gated - it is how a customer at the limit gets back under it.
      await orgAdmin.setSiteActive(adminOf(STD), STD, ctx, c.id, false)

      await expect(orgAdmin.createSite(adminOf(STD), STD, ctx, { name: 'D' }))
        .resolves.toBeTruthy()
      // The deactivated site is still there. Nothing was deleted to make room.
      expect(await db.site.count({ where: { companyId: STD } })).toBe(4)
    })

    it('does not limit a Premium workspace', async () => {
      for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
        await expect(orgAdmin.createSite(adminOf(PRM), PRM, ctx, { name })).resolves.toBeTruthy()
      }
    })

    it('does not limit a legacy plan, or one it does not recognise', async () => {
      // Grandfathering. A customer who predates plans, and a row somebody typed a plan into
      // by hand, both keep working - the alternative is an outage caused by bookkeeping.
      for (const companyId of [LGC, UNK]) {
        for (const name of ['A', 'B', 'C', 'D']) {
          await expect(orgAdmin.createSite(adminOf(companyId), companyId, ctx, { name }))
            .resolves.toBeTruthy()
        }
      }
    })

    it('leaves a workspace above its limit whole, and visible', async () => {
      // The real path to this: a customer on Premium with six sites moves to Standard.
      for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
        await orgAdmin.createSite(adminOf(PRM), PRM, ctx, { name })
      }
      await db.company.update({ where: { id: PRM }, data: { plan: 'standard' } })

      try {
        // Every site still listed, by the console and by the app's own reader. A plan
        // change must never look like data loss in a system holding incident history.
        expect(await orgAdmin.listSites(adminOf(PRM), PRM)).toHaveLength(6)
        expect(await org.listSites(adminOf(PRM), PRM)).toHaveLength(6)

        // Counted honestly rather than clamped, and the next one refused.
        const allowance = await siteAllowance(db, PRM)
        expect(allowance).toMatchObject({ limit: 3, used: 6, atLimit: true })
        await expect(orgAdmin.createSite(adminOf(PRM), PRM, ctx, { name: 'G' }))
          .rejects.toThrow(/Standard/)

        // And they can still retire what they have.
        const a = await db.site.findFirstOrThrow({ where: { companyId: PRM, name: 'A' } })
        await expect(orgAdmin.setSiteActive(adminOf(PRM), PRM, ctx, a.id, false))
          .resolves.toBeTruthy()
      } finally {
        await db.company.update({ where: { id: PRM }, data: { plan: 'premium' } })
      }
    })
  })

  // ── Integrations ───────────────────────────────────────────────────────────

  describe('API keys and webhooks', () => {
    beforeEach(async () => {
      await db.apiKey.deleteMany({ where: { companyId: { in: ALL } } })
      await db.webhook.deleteMany({ where: { companyId: { in: ALL } } })
    })

    it('refuses to issue an API key on Standard', async () => {
      const err = await admin.createApiKey(adminOf(STD), STD, ctx, 'CI', ['view']).catch((e) => e)
      expect(err).toBeInstanceOf(AdminError)
      expect(err.code).toBe('plan_limit')
      expect(err.status).toBe(403)
      expect(err.message).toContain('Premium')
      expect(await db.apiKey.count({ where: { companyId: STD } })).toBe(0)
    })

    it('refuses to create a webhook on Standard', async () => {
      const err = await admin
        .createWebhook(adminOf(STD), STD, ctx, 'https://hooks.example.com/x', ['incident.created'])
        .catch((e) => e)
      expect(err).toBeInstanceOf(AdminError)
      expect(err.code).toBe('plan_limit')
      expect(err.status).toBe(403)
      expect(await db.webhook.count({ where: { companyId: STD } })).toBe(0)
    })

    it('checks the plan after the request is validated, not before', async () => {
      // A malformed webhook is a malformed webhook on any plan. Answering "upgrade" to a
      // plaintext URL would send an administrator to buy something that will not fix it.
      await expect(
        admin.createWebhook(adminOf(STD), STD, ctx, 'http://insecure.example.com', ['x']),
      ).rejects.toThrow(/HTTPS/)
      await expect(admin.createApiKey(adminOf(STD), STD, ctx, '   ', []))
        .rejects.toThrow(/descriptive name/)
    })

    it('issues both on Premium', async () => {
      const { secret } = await admin.createApiKey(adminOf(PRM), PRM, ctx, 'CI', ['view'])
      expect(secret).toMatch(/^sk_live_/)
      await expect(
        admin.createWebhook(
          adminOf(PRM), PRM, ctx, 'https://hooks.example.com/y', ['incident.created'],
        ),
      ).resolves.toBeTruthy()
    })

    it('issues both on a legacy plan and on one it does not recognise', async () => {
      for (const companyId of [LGC, UNK]) {
        await expect(admin.createApiKey(adminOf(companyId), companyId, ctx, 'CI', ['view']))
          .resolves.toBeTruthy()
      }
    })

    it('keeps a key working, and revocable, after a downgrade', async () => {
      // The one that would hurt a real customer: their integration is live, they move to
      // Standard, and the key stops authenticating or - worse - cannot be turned off.
      const { key } = await admin.createApiKey(adminOf(PRM), PRM, ctx, 'Live', ['view'])
      await db.company.update({ where: { id: PRM }, data: { plan: 'standard' } })
      try {
        const listed = await admin.listApiKeys(adminOf(PRM), PRM)
        expect(listed.map((k) => k.id)).toContain(key.id)
        expect(listed.find((k) => k.id === key.id)?.revoked).toBe(false)

        // Revoking is ungated on purpose. A plan that can strand a live credential is worse
        // than one that lets it be turned off.
        await expect(admin.revokeApiKey(adminOf(PRM), PRM, ctx, key.id)).resolves.toBeTruthy()
      } finally {
        await db.company.update({ where: { id: PRM }, data: { plan: 'premium' } })
      }
    })
  })
})
