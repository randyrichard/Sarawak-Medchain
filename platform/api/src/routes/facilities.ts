import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, strongPassword, validateBody } from '../middleware/common.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateDoctorKeyPair, encryptField, searchDigest } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { notify } from '../services/notifyService.js';

/**
 * Hospital / clinic administrator endpoints — doctor management and
 * facility-level reporting. Admins operate only on their own facility.
 */
export const facilityRouter = Router();
facilityRouter.use(requireAuth, requireRole('HOSPITAL_ADMIN', 'CLINIC_ADMIN'));

function ownFacilityId(req: { user?: { facilityId: string | null } }): string {
  const id = req.user!.facilityId;
  if (!id) throw new HttpError(403, 'Account is not linked to a facility');
  return id;
}

facilityRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const facility = await prisma.facility.findUnique({
      where: { id: ownFacilityId(req) },
      include: { _count: { select: { doctors: true, mcs: true, users: true } } },
    });
    res.json(facility);
  })
);

// ── Doctors ──────────────────────────────────────────────────────────────────

facilityRouter.get(
  '/doctors',
  asyncHandler(async (req, res) => {
    const doctors = await prisma.doctor.findMany({
      where: { facilityId: ownFacilityId(req) },
      include: {
        user: { select: { fullName: true, email: true, status: true, lastLoginAt: true } },
        _count: { select: { mcs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      doctors.map((d) => ({
        id: d.id,
        fullName: d.user.fullName,
        email: d.user.email,
        mmcNumber: d.mmcNumber,
        specialty: d.specialty,
        status: d.status,
        mcCount: d._count.mcs,
        lastLoginAt: d.user.lastLoginAt,
      }))
    );
  })
);

const registerDoctorSchema = z.object({
  email: z.string().email(),
  password: strongPassword,
  fullName: z.string().min(2).max(120),
  ic: z.string().min(6).max(20),
  mmcNumber: z.string().min(4).max(20),
  specialty: z.string().max(80).optional(),
});

facilityRouter.post(
  '/doctors',
  validateBody(registerDoctorSchema),
  asyncHandler(async (req, res) => {
    const facilityId = ownFacilityId(req);
    const facility = await prisma.facility.findUniqueOrThrow({ where: { id: facilityId } });
    if (facility.status !== 'APPROVED') {
      throw new HttpError(403, 'Facility must be approved before registering doctors');
    }

    const mmcTaken = await prisma.doctor.findUnique({
      where: { mmcNumber: req.body.mmcNumber },
    });
    if (mmcTaken) throw new HttpError(409, 'A doctor with this MMC number is already registered');

    // In production this is the MMC registry integration point: the number
    // is validated against the live Malaysian Medical Council register
    // before the account is created.

    const keys = generateDoctorKeyPair();
    const doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: req.body.email.toLowerCase(),
          passwordHash: await bcrypt.hash(req.body.password, 12),
          fullName: req.body.fullName,
          role: 'DOCTOR',
          facilityId,
          state: facility.state,
          icEncrypted: encryptField(req.body.ic),
          icHash: searchDigest(req.body.ic),
          mustChangePassword: true, // initial password set by the facility admin
        },
      });
      return tx.doctor.create({
        data: {
          userId: user.id,
          mmcNumber: req.body.mmcNumber,
          specialty: req.body.specialty,
          facilityId,
          signingPublicKey: keys.publicKeyPem,
          signingKeyEncrypted: keys.privateKeyEncrypted,
        },
      });
    });

    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'REGISTER_DOCTOR',
      entityType: 'Doctor',
      entityId: doctor.id,
      meta: { mmcNumber: doctor.mmcNumber, facilityId },
    });
    res.status(201).json({ id: doctor.id, mmcNumber: doctor.mmcNumber });
  })
);

facilityRouter.post(
  '/doctors/:id/suspend',
  validateBody(z.object({ reason: z.string().min(3).max(300) })),
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
    if (!doctor || doctor.facilityId !== ownFacilityId(req)) throw new HttpError(404, 'Doctor not found');

    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: req.body.reason },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'SUSPEND_DOCTOR',
      entityType: 'Doctor',
      entityId: doctor.id,
      meta: { reason: req.body.reason },
    });
    await notify(
      doctor.userId,
      'DOCTOR_SUSPENDED',
      'Issuing privileges suspended',
      `Your MC issuing privileges were suspended: ${req.body.reason}`
    );
    res.json({ id: updated.id, status: updated.status });
  })
);

facilityRouter.post(
  '/doctors/:id/reinstate',
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
    if (!doctor || doctor.facilityId !== ownFacilityId(req)) throw new HttpError(404, 'Doctor not found');
    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data: { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'REINSTATE_DOCTOR',
      entityType: 'Doctor',
      entityId: doctor.id,
    });
    res.json({ id: updated.id, status: updated.status });
  })
);

// ── Facility analytics ───────────────────────────────────────────────────────

facilityRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const facilityId = ownFacilityId(req);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [total, last30, revoked, doctors] = await Promise.all([
      prisma.medicalCertificate.count({ where: { facilityId } }),
      prisma.medicalCertificate.count({ where: { facilityId, dateIssued: { gte: since } } }),
      prisma.medicalCertificate.count({ where: { facilityId, status: 'REVOKED' } }),
      prisma.doctor.count({ where: { facilityId, status: 'ACTIVE' } }),
    ]);

    const perDoctor = await prisma.medicalCertificate.groupBy({
      by: ['doctorId'],
      where: { facilityId, dateIssued: { gte: since } },
      _count: true,
      orderBy: { _count: { doctorId: 'desc' } },
      take: 10,
    });
    const doctorNames = await prisma.doctor.findMany({
      where: { id: { in: perDoctor.map((p) => p.doctorId) } },
      include: { user: { select: { fullName: true } } },
    });

    res.json({
      totals: { total, last30, revoked, activeDoctors: doctors },
      topDoctors: perDoctor.map((p) => ({
        doctorId: p.doctorId,
        name: doctorNames.find((d) => d.id === p.doctorId)?.user.fullName,
        count: p._count,
      })),
    });
  })
);
