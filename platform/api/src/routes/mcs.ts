import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, clientIp, HttpError, validateBody } from '../middleware/common.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { amendMC, issueMC, revokeMC } from '../services/mcService.js';
import { renderMCPdf, verificationUrl } from '../services/pdfService.js';
import { decryptField, randomToken, sha256Hex } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';

export const mcRouter = Router();
mcRouter.use(requireAuth);

const issueSchema = z.object({
  patientName: z.string().min(2).max(120),
  patientIc: z.string().min(6).max(20),
  diagnosis: z.string().max(500).optional(),
  restDays: z.number().int().min(1).max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Serialize an MC for its owner (doctor/patient) — never includes diagnosis
 *  unless the requester is the issuing doctor. */
function toDto(mc: any, opts: { includeDiagnosis?: boolean } = {}) {
  return {
    id: mc.id,
    mcNumber: mc.mcNumber,
    patientName: mc.patientName,
    restDays: mc.restDays,
    startDate: mc.startDate,
    endDate: mc.endDate,
    dateIssued: mc.dateIssued,
    status: mc.status,
    canonicalHash: mc.canonicalHash,
    anchored: mc.anchored,
    chainTxHash: mc.chainTxHash,
    verificationUrl: verificationUrl(mc.canonicalHash),
    revokedReason: mc.revokedReason,
    amendReason: mc.amendReason,
    doctorName: mc.doctor?.user?.fullName,
    mmcNumber: mc.doctor?.mmcNumber,
    facilityName: mc.facility?.name,
    diagnosis:
      opts.includeDiagnosis && mc.diagnosisEncrypted
        ? decryptField(mc.diagnosisEncrypted)
        : undefined,
  };
}

// ── Doctor endpoints ─────────────────────────────────────────────────────────

mcRouter.post(
  '/',
  requireRole('DOCTOR'),
  validateBody(issueSchema),
  asyncHandler(async (req, res) => {
    const mc = await issueMC(req.user!.id, req.body);
    const full = await prisma.medicalCertificate.findUniqueOrThrow({
      where: { id: mc.id },
      include: { doctor: { include: { user: true } }, facility: true },
    });
    res.status(201).json(toDto(full, { includeDiagnosis: true }));
  })
);

mcRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    let where;
    if (user.role === 'DOCTOR') {
      const doctor = await prisma.doctor.findUnique({ where: { userId: user.id } });
      if (!doctor) throw new HttpError(403, 'No doctor profile');
      where = { doctorId: doctor.id };
    } else if (user.role === 'PATIENT') {
      where = { patientUserId: user.id };
    } else {
      throw new HttpError(403, 'Use the search endpoints for administrative access');
    }
    const mcs = await prisma.medicalCertificate.findMany({
      where,
      orderBy: { dateIssued: 'desc' },
      take: 200,
      include: { doctor: { include: { user: true } }, facility: true },
    });
    res.json(mcs.map((m) => toDto(m, { includeDiagnosis: user.role === 'DOCTOR' })));
  })
);

mcRouter.post(
  '/:id/revoke',
  requireRole('DOCTOR'),
  validateBody(z.object({ reason: z.string().min(3).max(300) })),
  asyncHandler(async (req, res) => {
    const mc = await revokeMC(req.user!.id, req.params.id, req.body.reason);
    res.json({ id: mc.id, status: mc.status, revokedReason: mc.revokedReason });
  })
);

mcRouter.post(
  '/:id/amend',
  requireRole('DOCTOR'),
  validateBody(z.object({ reason: z.string().min(3).max(300), corrected: issueSchema })),
  asyncHandler(async (req, res) => {
    const { original, replacement } = await amendMC(
      req.user!.id,
      req.params.id,
      req.body.reason,
      req.body.corrected
    );
    res.json({
      original: { id: original.id, status: original.status },
      replacement: toDto(
        await prisma.medicalCertificate.findUniqueOrThrow({
          where: { id: replacement.id },
          include: { doctor: { include: { user: true } }, facility: true },
        })
      ),
    });
  })
);

// ── PDF download (doctor or the MC's patient) ───────────────────────────────

mcRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const mc = await prisma.medicalCertificate.findUnique({
      where: { id: req.params.id },
      include: { doctor: { include: { user: true } }, facility: true },
    });
    if (!mc) throw new HttpError(404, 'MC not found');

    const user = req.user!;
    const isPatient = mc.patientUserId === user.id;
    const doctor =
      user.role === 'DOCTOR'
        ? await prisma.doctor.findUnique({ where: { userId: user.id } })
        : null;
    const isIssuer = doctor?.id === mc.doctorId;
    if (!isPatient && !isIssuer) throw new HttpError(403, 'Not permitted to download this MC');

    const ic = decryptField(mc.patientIcEncrypted);
    const masked = `${ic.slice(0, 6)}-**-****`;
    const pdf = await renderMCPdf({
      mcNumber: mc.mcNumber,
      patientName: mc.patientName,
      patientIcMasked: isPatient ? ic : masked,
      restDays: mc.restDays,
      startDate: mc.startDate,
      endDate: mc.endDate,
      dateIssued: mc.dateIssued,
      doctorName: mc.doctor.user.fullName,
      mmcNumber: mc.doctor.mmcNumber,
      facilityName: mc.facility.name,
      facilityRegistrationNo: mc.facility.registrationNo,
      facilityState: mc.facility.state,
      canonicalHash: mc.canonicalHash,
      chainTxHash: mc.chainTxHash,
      anchored: mc.anchored,
    });

    await audit({
      actorId: user.id,
      actorRole: user.role,
      action: 'DOWNLOAD_MC',
      entityType: 'MedicalCertificate',
      entityId: mc.id,
      ip: clientIp(req),
    });

    res
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${mc.mcNumber}.pdf"`)
      .send(pdf);
  })
);

// ── On-screen QR (doctor or the MC's patient) ───────────────────────────────

mcRouter.get(
  '/:id/qr',
  asyncHandler(async (req, res) => {
    const mc = await prisma.medicalCertificate.findUnique({ where: { id: req.params.id } });
    if (!mc) throw new HttpError(404, 'MC not found');
    const user = req.user!;
    const doctor =
      user.role === 'DOCTOR'
        ? await prisma.doctor.findUnique({ where: { userId: user.id } })
        : null;
    if (mc.patientUserId !== user.id && doctor?.id !== mc.doctorId) {
      throw new HttpError(403, 'Not permitted to view this MC');
    }
    const url = verificationUrl(mc.canonicalHash);
    const dataUrl = await QRCode.toDataURL(url, { width: 360, margin: 2 });
    res.json({ mcNumber: mc.mcNumber, verificationUrl: url, qrDataUrl: dataUrl });
  })
);

// ── Patient share links ──────────────────────────────────────────────────────

mcRouter.post(
  '/:id/share',
  requireRole('PATIENT'),
  asyncHandler(async (req, res) => {
    const mc = await prisma.medicalCertificate.findUnique({ where: { id: req.params.id } });
    if (!mc || mc.patientUserId !== req.user!.id) throw new HttpError(404, 'MC not found');

    const token = randomToken(24);
    await prisma.shareToken.create({
      data: {
        mcId: mc.id,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    await audit({
      actorId: req.user!.id,
      actorRole: 'PATIENT',
      action: 'SHARE_MC',
      entityType: 'MedicalCertificate',
      entityId: mc.id,
    });
    res.json({
      shareUrl: verificationUrl(mc.canonicalHash),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
  })
);
