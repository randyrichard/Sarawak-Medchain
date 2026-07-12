import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, validateBody } from '../middleware/common.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
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

searchRouter.post(
  '/',
  validateBody(searchSchema),
  asyncHandler(async (req, res) => {
    const { type, q } = req.body as z.infer<typeof searchSchema>;
    const user = req.user!;

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
    let mcs;
    switch (type) {
      case 'mcNumber':
        mcs = await prisma.medicalCertificate.findMany({
          where: { ...baseWhere, mcNumber: { contains: q, mode: 'insensitive' } },
          include,
          take: 50,
        });
        break;
      case 'ic':
        mcs = await prisma.medicalCertificate.findMany({
          where: { ...baseWhere, patientIcHash: searchDigest(q) },
          include,
          take: 50,
        });
        break;
      case 'hash':
        mcs = await prisma.medicalCertificate.findMany({
          where: {
            ...baseWhere,
            canonicalHash: q.toLowerCase().startsWith('0x') ? q.toLowerCase() : `0x${q.toLowerCase()}`,
          },
          include,
          take: 50,
        });
        break;
      case 'doctor':
        mcs = await prisma.medicalCertificate.findMany({
          where: {
            ...baseWhere,
            doctor: { user: { fullName: { contains: q, mode: 'insensitive' } } },
          },
          include,
          take: 50,
        });
        break;
      case 'mmc':
        mcs = await prisma.medicalCertificate.findMany({
          where: { ...baseWhere, doctor: { mmcNumber: q } },
          include,
          take: 50,
        });
        break;
      case 'facility':
        mcs = await prisma.medicalCertificate.findMany({
          where: {
            ...facilityScope,
            ...stateScope,
            facility: { ...(stateScope.facility ?? {}), name: { contains: q, mode: 'insensitive' } },
          },
          include,
          take: 50,
        });
        break;
    }

    res.json(
      (mcs ?? []).map((m) => ({
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
      }))
    );
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
