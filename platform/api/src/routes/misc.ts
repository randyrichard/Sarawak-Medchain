import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, toCsv, validateBody } from '../middleware/common.js';
import { requireAuth, requireRole, type AuthUser } from '../middleware/auth.js';
import { randomToken, searchDigest, sha256Hex } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';

// ── Administrative search ────────────────────────────────────────────────────

export const searchRouter = Router();
searchRouter.use(
  requireAuth,
  requireRole('SUPER_ADMIN', 'STATE_ADMIN', 'HOSPITAL_ADMIN', 'CLINIC_ADMIN')
);

const searchSchema = z.object({
  type: z.enum(['mcNumber', 'ic', 'doctor', 'mmc', 'facility', 'hash']),
  q: z.string().min(2).max(120),
});
type SearchInput = z.infer<typeof searchSchema>;

/** Shared, role-scoped MC search used by both the JSON and CSV endpoints. */
async function runSearch(user: AuthUser, { type, q }: SearchInput, take = 50) {
  // Facility admins only see their own facility's records
  const facilityScope =
    user.role === 'HOSPITAL_ADMIN' || user.role === 'CLINIC_ADMIN'
      ? { facilityId: user.facilityId ?? '__none__' }
      : {};
  const stateScope =
    user.role === 'STATE_ADMIN' && user.state ? { facility: { state: user.state } } : {};
  const include = {
    doctor: { include: { user: { select: { fullName: true } } } },
    facility: { select: { name: true, state: true } },
  } as const;
  const baseWhere = { ...facilityScope, ...stateScope };

  const filterByType = {
    mcNumber: { mcNumber: { contains: q, mode: 'insensitive' as const } },
    ic: { patientIcHash: searchDigest(q) },
    hash: { canonicalHash: q.toLowerCase().startsWith('0x') ? q.toLowerCase() : `0x${q.toLowerCase()}` },
    doctor: { doctor: { user: { fullName: { contains: q, mode: 'insensitive' as const } } } },
    mmc: { doctor: { mmcNumber: q } },
    facility: { facility: { ...(stateScope.facility ?? {}), name: { contains: q, mode: 'insensitive' as const } } },
  }[type];

  const mcs = await prisma.medicalCertificate.findMany({
    where: { ...baseWhere, ...filterByType },
    include,
    take,
    orderBy: { dateIssued: 'desc' },
  });
  return mcs.map((m) => ({
    id: m.id,
    mcNumber: m.mcNumber,
    patientName: m.patientName,
    status: m.status,
    dateIssued: m.dateIssued,
    restDays: m.restDays,
    doctorName: m.doctor.user.fullName,
    mmcNumber: m.doctor.mmcNumber,
    facilityName: m.facility.name,
    state: m.facility.state,
    canonicalHash: m.canonicalHash,
    anchored: m.anchored,
  }));
}

searchRouter.post(
  '/',
  validateBody(searchSchema),
  asyncHandler(async (req, res) => {
    res.json(await runSearch(req.user!, req.body as SearchInput));
  })
);

// CSV export of the same search (bounded higher for reporting)
searchRouter.post(
  '/csv',
  validateBody(searchSchema),
  asyncHandler(async (req, res) => {
    const rows = await runSearch(req.user!, req.body as SearchInput, 5000);
    const csv = toCsv(
      ['mcNumber', 'patientName', 'status', 'dateIssued', 'restDays', 'doctorName', 'mmcNumber', 'facilityName', 'state', 'canonicalHash', 'anchored'],
      rows.map((r) => [
        r.mcNumber, r.patientName, r.status, r.dateIssued.toISOString(), r.restDays,
        r.doctorName, r.mmcNumber, r.facilityName, r.state, r.canonicalHash, r.anchored ? 'yes' : 'no',
      ])
    );
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'DATA_EXPORT',
      entityType: 'MedicalCertificate',
      meta: { export: 'search.csv', rows: rows.length },
    });
    res
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="mc-search-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv);
  })
);

// ── Notifications ────────────────────────────────────────────────────────────

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  })
);

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, marked: result.count });
  })
);

notificationRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    res.json({ ok: true });
  })
);

// ── Employer API keys (HR-system integration) ───────────────────────────────

export const apiKeyRouter = Router();
apiKeyRouter.use(requireAuth, requireRole('EMPLOYER'));

apiKeyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const keys = await prisma.apiKey.findMany({
      where: { ownerUserId: req.user!.id, revokedAt: null },
      select: { id: true, name: true, scopes: true, lastUsedAt: true, createdAt: true },
    });
    res.json(keys);
  })
);

apiKeyRouter.post(
  '/',
  validateBody(z.object({ name: z.string().min(2).max(80) })),
  asyncHandler(async (req, res) => {
    const key = `emc_${randomToken(32)}`;
    const record = await prisma.apiKey.create({
      data: { ownerUserId: req.user!.id, name: req.body.name, keyHash: sha256Hex(key) },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: 'EMPLOYER',
      action: 'CREATE_API_KEY',
      entityType: 'ApiKey',
      entityId: record.id,
    });
    // The plaintext key is shown exactly once
    res.status(201).json({ id: record.id, name: record.name, apiKey: key });
  })
);

apiKeyRouter.post(
  '/:id/revoke',
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
    if (!key || key.ownerUserId !== req.user!.id) throw new HttpError(404, 'API key not found');
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit({
      actorId: req.user!.id,
      actorRole: 'EMPLOYER',
      action: 'REVOKE_API_KEY',
      entityType: 'ApiKey',
      entityId: key.id,
    });
    res.json({ ok: true });
  })
);
