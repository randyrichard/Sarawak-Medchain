import { prisma } from '../lib/prisma.js';
import { canonicalDate, computeMCHash } from '../lib/canonical.js';
import { encryptField, searchDigest, signHash } from '../lib/crypto.js';
import { anchorMCHash } from '../lib/chain.js';
import { audit } from '../lib/audit.js';
import { HttpError } from '../middleware/common.js';
import { checkIssuance } from './fraudService.js';
import { notify } from './notifyService.js';
import type { MedicalCertificate } from '@prisma/client';

export interface IssueMCInput {
  patientName: string;
  patientIc: string;
  diagnosis?: string;
  restDays: number;
  startDate: string; // YYYY-MM-DD
}

/** MC-YYYY-NNNNNN, unique per year. */
async function nextMcNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.medicalCertificate.count({
    where: { mcNumber: { startsWith: `MC-${year}-` } },
  });
  return `MC-${year}-${String(count + 1).padStart(6, '0')}`;
}

export async function issueMC(
  doctorUserId: string,
  input: IssueMCInput
): Promise<MedicalCertificate> {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: doctorUserId },
    include: { user: true, facility: true },
  });
  if (!doctor) throw new HttpError(403, 'No doctor profile for this account');

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Invalid start date');
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + input.restDays - 1);

  const patientIcHash = searchDigest(input.patientIc);

  const blockers = await checkIssuance({
    doctorId: doctor.id,
    facilityId: doctor.facilityId,
    patientIcHash,
    startDate: start,
    endDate: end,
  });
  if (blockers.length > 0) {
    throw new HttpError(422, 'MC issuance blocked', blockers);
  }

  const mcNumber = await nextMcNumber();
  const issued = new Date();

  const canonicalHash = computeMCHash({
    mcId: mcNumber,
    patientIC: input.patientIc,
    patientName: input.patientName,
    duration: input.restDays,
    doctorName: doctor.user.fullName,
    mmcNumber: doctor.mmcNumber,
    hospital: doctor.facility.name,
    dateIssued: canonicalDate(issued),
    startDate: canonicalDate(start),
    endDate: canonicalDate(end),
  });

  const signature = signHash(canonicalHash, doctor.signingKeyEncrypted);

  // Link to a patient portal account when the IC matches a registered user
  const patientUser = await prisma.user.findUnique({
    where: { icHash: patientIcHash },
    select: { id: true },
  });

  // Anchor on-chain BEFORE persisting so a chain failure can't leave an
  // "anchored" MC without a transaction. Anchoring disabled ⇒ demo record.
  const anchor = await anchorMCHash(canonicalHash);

  const mc = await prisma.medicalCertificate.create({
    data: {
      mcNumber,
      patientName: input.patientName,
      patientIcEncrypted: encryptField(input.patientIc),
      patientIcHash,
      patientUserId: patientUser?.id,
      doctorId: doctor.id,
      facilityId: doctor.facilityId,
      diagnosisEncrypted: input.diagnosis ? encryptField(input.diagnosis) : null,
      restDays: input.restDays,
      startDate: start,
      endDate: end,
      dateIssued: issued,
      canonicalHash,
      signature,
      signerKeyId: doctor.id,
      anchored: anchor !== null,
      chainTxHash: anchor?.txHash,
      chainBlock: anchor?.blockNumber,
      chainTimestamp: anchor?.timestamp,
    },
  });

  await audit({
    actorId: doctorUserId,
    actorRole: 'DOCTOR',
    action: 'ISSUE_MC',
    entityType: 'MedicalCertificate',
    entityId: mc.id,
    meta: { mcNumber, anchored: mc.anchored, chainTxHash: mc.chainTxHash },
  });

  if (patientUser) {
    await notify(
      patientUser.id,
      'MC_ISSUED',
      'Medical certificate issued',
      `${mcNumber} issued by Dr. ${doctor.user.fullName} (${doctor.facility.name}) for ${input.restDays} day(s) from ${canonicalDate(start)}.`
    );
  }

  return mc;
}

export async function revokeMC(
  doctorUserId: string,
  mcId: string,
  reason: string
): Promise<MedicalCertificate> {
  const doctor = await prisma.doctor.findUnique({ where: { userId: doctorUserId } });
  if (!doctor) throw new HttpError(403, 'No doctor profile for this account');

  const mc = await prisma.medicalCertificate.findUnique({ where: { id: mcId } });
  if (!mc) throw new HttpError(404, 'MC not found');
  if (mc.doctorId !== doctor.id) throw new HttpError(403, 'Only the issuing doctor can revoke an MC');
  if (mc.status !== 'ACTIVE') throw new HttpError(409, `MC is already ${mc.status}`);

  const updated = await prisma.medicalCertificate.update({
    where: { id: mcId },
    data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason },
  });

  await audit({
    actorId: doctorUserId,
    actorRole: 'DOCTOR',
    action: 'REVOKE_MC',
    entityType: 'MedicalCertificate',
    entityId: mcId,
    meta: { mcNumber: mc.mcNumber, reason },
  });

  if (mc.patientUserId) {
    await notify(
      mc.patientUserId,
      'MC_REVOKED',
      'Medical certificate revoked',
      `${mc.mcNumber} has been revoked by the issuing doctor. Reason: ${reason}`
    );
  }
  return updated;
}

/**
 * Amend an MC: the original is marked AMENDED (its hash stays on-chain but
 * verification reports the supersession) and a corrected MC is issued and
 * anchored as a fresh certificate.
 */
export async function amendMC(
  doctorUserId: string,
  mcId: string,
  reason: string,
  corrected: IssueMCInput
): Promise<{ original: MedicalCertificate; replacement: MedicalCertificate }> {
  const doctor = await prisma.doctor.findUnique({ where: { userId: doctorUserId } });
  if (!doctor) throw new HttpError(403, 'No doctor profile for this account');

  const original = await prisma.medicalCertificate.findUnique({ where: { id: mcId } });
  if (!original) throw new HttpError(404, 'MC not found');
  if (original.doctorId !== doctor.id) throw new HttpError(403, 'Only the issuing doctor can amend an MC');
  if (original.status !== 'ACTIVE') throw new HttpError(409, `MC is already ${original.status}`);

  // Supersede first so the duplicate-MC check doesn't trip on the original
  const superseded = await prisma.medicalCertificate.update({
    where: { id: mcId },
    data: { status: 'AMENDED', amendReason: reason },
  });

  let replacement: MedicalCertificate;
  try {
    replacement = await issueMC(doctorUserId, corrected);
  } catch (err) {
    // Roll the supersession back if the corrected MC can't be issued
    await prisma.medicalCertificate.update({
      where: { id: mcId },
      data: { status: 'ACTIVE', amendReason: null },
    });
    throw err;
  }

  await prisma.medicalCertificate.update({
    where: { id: replacement.id },
    data: { amendedFromId: mcId },
  });

  await audit({
    actorId: doctorUserId,
    actorRole: 'DOCTOR',
    action: 'AMEND_MC',
    entityType: 'MedicalCertificate',
    entityId: mcId,
    meta: { reason, replacementId: replacement.id, replacementNumber: replacement.mcNumber },
  });

  return { original: superseded, replacement };
}
