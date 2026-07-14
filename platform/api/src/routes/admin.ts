import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { AlertStatus, AuditAction, FacilityStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, clientIp, HttpError, strongPassword, validateBody } from '../middleware/common.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit, verifyAuditChain } from '../lib/audit.js';
import { notify } from '../services/notifyService.js';

/**
 * Validate an optional enum-typed query parameter. An unknown value would
 * otherwise reach Prisma and throw a validation error → 500; here it is a
 * clean 400. Returns undefined when the parameter is absent.
 */
function enumParam<T extends Record<string, string>>(
  raw: unknown,
  enumObj: T,
  name: string
): T[keyof T] | undefined {
  if (raw === undefined) return undefined;
  const allowed = Object.values(enumObj);
  if (typeof raw !== 'string' || !allowed.includes(raw)) {
    throw new HttpError(400, `Invalid ${name}. Allowed: ${allowed.join(', ')}`);
  }
  return raw as T[keyof T];
}

/**
 * KKM (SUPER_ADMIN) and STATE_ADMIN endpoints. State admins are scoped to
 * their own state; KKM sees everything.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('SUPER_ADMIN', 'STATE_ADMIN'));

function stateScope(req: { user?: { role: string; state: string | null } }) {
  return req.user!.role === 'STATE_ADMIN' && req.user!.state
    ? { state: req.user!.state }
    : {};
}

// ── Facility registry ────────────────────────────────────────────────────────

adminRouter.get(
  '/facilities',
  asyncHandler(async (req, res) => {
    const status = enumParam(req.query.status, FacilityStatus, 'status');
    const facilities = await prisma.facility.findMany({
      where: {
        ...stateScope(req),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { doctors: true, mcs: true } } },
    });
    res.json(facilities);
  })
);

const facilitySchema = z.object({
  type: z.enum(['HOSPITAL', 'CLINIC']),
  name: z.string().min(3).max(160),
  registrationNo: z.string().min(3).max(60),
  state: z.string().min(2).max(40),
  district: z.string().max(60).optional(),
  address: z.string().min(5).max(300),
  phone: z.string().max(20).optional(),
});

adminRouter.post(
  '/facilities',
  validateBody(facilitySchema),
  asyncHandler(async (req, res) => {
    const facility = await prisma.facility.create({ data: req.body });
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'REGISTER_FACILITY',
      entityType: 'Facility',
      entityId: facility.id,
      ip: clientIp(req),
      meta: { name: facility.name, registrationNo: facility.registrationNo },
    });
    res.status(201).json(facility);
  })
);

adminRouter.post(
  '/facilities/:id/approve',
  asyncHandler(async (req, res) => {
    const facility = await prisma.facility.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: new Date() },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'APPROVE_FACILITY',
      entityType: 'Facility',
      entityId: facility.id,
      ip: clientIp(req),
    });
    res.json(facility);
  })
);

adminRouter.post(
  '/facilities/:id/suspend',
  validateBody(z.object({ reason: z.string().min(3).max(300) })),
  asyncHandler(async (req, res) => {
    const facility = await prisma.facility.update({
      where: { id: req.params.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: req.body.reason },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'SUSPEND_FACILITY',
      entityType: 'Facility',
      entityId: facility.id,
      meta: { reason: req.body.reason },
    });
    // Alert every facility user
    const users = await prisma.user.findMany({
      where: { facilityId: facility.id },
      select: { id: true },
    });
    await Promise.all(
      users.map((u) =>
        notify(u.id, 'FACILITY_SUSPENDED', 'Facility suspended', `${facility.name}: ${req.body.reason}`)
      )
    );
    res.json(facility);
  })
);

// ── Facility admin account provisioning ─────────────────────────────────────

adminRouter.post(
  '/facilities/:id/admins',
  validateBody(
    z.object({
      email: z.string().email(),
      password: strongPassword,
      fullName: z.string().min(2).max(120),
    })
  ),
  asyncHandler(async (req, res) => {
    const facility = await prisma.facility.findUnique({ where: { id: req.params.id } });
    if (!facility) throw new HttpError(404, 'Facility not found');
    const user = await prisma.user.create({
      data: {
        email: req.body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(req.body.password, 12),
        fullName: req.body.fullName,
        mustChangePassword: true, // initial password set by KKM/state admin
        role: facility.type === 'HOSPITAL' ? 'HOSPITAL_ADMIN' : 'CLINIC_ADMIN',
        facilityId: facility.id,
        state: facility.state,
      },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'CREATE_USER',
      entityType: 'User',
      entityId: user.id,
      meta: { role: user.role, facilityId: facility.id },
    });
    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  })
);

// ── Fraud alerts ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/fraud-alerts',
  asyncHandler(async (req, res) => {
    const alertStatus = enumParam(req.query.status, AlertStatus, 'status');
    const alerts = await prisma.fraudAlert.findMany({
      where: alertStatus ? { status: alertStatus } : {},
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    res.json(alerts);
  })
);

adminRouter.post(
  '/fraud-alerts/:id/review',
  validateBody(z.object({ status: z.enum(['UNDER_REVIEW', 'CONFIRMED', 'DISMISSED']) })),
  asyncHandler(async (req, res) => {
    const alert = await prisma.fraudAlert.update({
      where: { id: req.params.id },
      data: { status: req.body.status, reviewedBy: req.user!.id, reviewedAt: new Date() },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'FRAUD_ALERT_REVIEWED',
      entityType: 'FraudAlert',
      entityId: alert.id,
      meta: { status: req.body.status },
    });
    res.json(alert);
  })
);

// ── Audit trail ──────────────────────────────────────────────────────────────

adminRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const parsedLimit = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;
    const action = enumParam(req.query.action, AuditAction, 'action');
    const entries = await prisma.auditLog.findMany({
      orderBy: { seq: 'desc' },
      take: limit,
      ...(action ? { where: { action } } : {}),
    });
    res.json(
      entries.map((e) => ({
        ...e,
        seq: e.seq.toString(),
      }))
    );
  })
);

adminRouter.get(
  '/audit/integrity',
  requireRole('SUPER_ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(await verifyAuditChain());
  })
);

// ── Analytics ────────────────────────────────────────────────────────────────

adminRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const scope = stateScope(req);
    const facilityFilter = scope.state ? { facility: { state: scope.state } } : {};

    const [totalMCs, activeMCs, revokedMCs, verifications, openAlerts, facilities, doctors] =
      await Promise.all([
        prisma.medicalCertificate.count({ where: facilityFilter }),
        prisma.medicalCertificate.count({ where: { ...facilityFilter, status: 'ACTIVE' } }),
        prisma.medicalCertificate.count({ where: { ...facilityFilter, status: 'REVOKED' } }),
        prisma.verificationEvent.count({ where: { createdAt: { gte: since } } }),
        prisma.fraudAlert.count({ where: { status: 'OPEN' } }),
        prisma.facility.count({ where: { ...scope, status: 'APPROVED' } }),
        prisma.doctor.count({
          where: { status: 'ACTIVE', ...(scope.state ? { facility: { state: scope.state } } : {}) },
        }),
      ]);

    // Daily issuance (last 30 days) — aggregated in the database
    const stateParam = scope.state ?? null;
    const dailyRows = await prisma.$queryRaw<Array<{ date: string; count: number }>>`
      SELECT to_char(mc."dateIssued", 'YYYY-MM-DD') AS date, count(*)::int AS count
      FROM "MedicalCertificate" mc
      JOIN "Facility" f ON f.id = mc."facilityId"
      WHERE mc."dateIssued" >= ${since}
        AND (${stateParam}::text IS NULL OR f.state = ${stateParam})
      GROUP BY 1
      ORDER BY 1`;
    const daily: Record<string, number> = Object.fromEntries(
      dailyRows.map((r) => [r.date, r.count])
    );

    // Verification outcomes (last 30 days)
    const outcomes = await prisma.verificationEvent.groupBy({
      by: ['result'],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    // Issuance by state (heatmap). Aggregated per facility in the database —
    // never materializes MC rows, so it stays O(#facilities) at any scale.
    const perFacility = await prisma.medicalCertificate.groupBy({
      by: ['facilityId'],
      where: facilityFilter,
      _count: true,
    });
    const facilityStates = await prisma.facility.findMany({
      where: { id: { in: perFacility.map((p) => p.facilityId) } },
      select: { id: true, state: true },
    });
    const stateOf = new Map(facilityStates.map((f) => [f.id, f.state]));
    const byState: Record<string, number> = {};
    for (const p of perFacility) {
      const s = stateOf.get(p.facilityId) ?? 'Unknown';
      byState[s] = (byState[s] ?? 0) + p._count;
    }

    // Top facilities
    const topFacilities = await prisma.medicalCertificate.groupBy({
      by: ['facilityId'],
      where: facilityFilter,
      _count: true,
      orderBy: { _count: { facilityId: 'desc' } },
      take: 5,
    });
    const facilityNames = await prisma.facility.findMany({
      where: { id: { in: topFacilities.map((t) => t.facilityId) } },
      select: { id: true, name: true, type: true },
    });

    res.json({
      totals: { totalMCs, activeMCs, revokedMCs, verifications, openAlerts, facilities, doctors },
      dailyIssuance: Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      verificationOutcomes: outcomes.map((o) => ({ result: o.result, count: o._count })),
      byState: Object.entries(byState).map(([state, count]) => ({ state, count })),
      topFacilities: topFacilities.map((t) => ({
        ...facilityNames.find((f) => f.id === t.facilityId),
        count: t._count,
      })),
    });
  })
);
