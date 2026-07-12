import type { AlertSeverity, FraudAlertType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';

async function raiseAlert(input: {
  type: FraudAlertType;
  severity: AlertSeverity;
  mcId?: string;
  doctorId?: string;
  facilityId?: string;
  userId?: string;
  details: Record<string, unknown>;
}): Promise<void> {
  await prisma.fraudAlert.create({
    data: {
      type: input.type,
      severity: input.severity,
      mcId: input.mcId,
      doctorId: input.doctorId,
      facilityId: input.facilityId,
      userId: input.userId,
      details: input.details as object,
    },
  });
  await audit({
    action: 'FRAUD_ALERT_RAISED',
    entityType: 'FraudAlert',
    entityId: input.mcId ?? input.doctorId ?? input.userId,
    meta: { type: input.type, severity: input.severity, ...input.details },
  });
}

/**
 * Pre-issuance checks. Returns a list of blocking reasons (empty = allowed).
 * Non-blocking anomalies raise FraudAlerts but let issuance proceed so a
 * doctor at a busy clinic is not locked out by a threshold — KKM reviews.
 */
export async function checkIssuance(params: {
  doctorId: string;
  facilityId: string;
  patientIcHash: string;
  startDate: Date;
  endDate: Date;
}): Promise<string[]> {
  const blockers: string[] = [];

  const [doctor, facility] = await Promise.all([
    prisma.doctor.findUnique({ where: { id: params.doctorId } }),
    prisma.facility.findUnique({ where: { id: params.facilityId } }),
  ]);

  if (!doctor || doctor.status !== 'ACTIVE') {
    blockers.push('Doctor is not active');
    await raiseAlert({
      type: 'INACTIVE_DOCTOR',
      severity: 'HIGH',
      doctorId: params.doctorId,
      details: { status: doctor?.status ?? 'UNKNOWN' },
    });
  }
  if (!facility || facility.status !== 'APPROVED') {
    blockers.push('Facility is not approved');
    await raiseAlert({
      type: 'SUSPENDED_FACILITY',
      severity: 'CRITICAL',
      facilityId: params.facilityId,
      details: { status: facility?.status ?? 'UNKNOWN' },
    });
  }

  // Duplicate MC: same patient with an ACTIVE MC overlapping this rest period
  const overlapping = await prisma.medicalCertificate.findFirst({
    where: {
      patientIcHash: params.patientIcHash,
      status: 'ACTIVE',
      startDate: { lte: params.endDate },
      endDate: { gte: params.startDate },
    },
    select: { id: true, mcNumber: true },
  });
  if (overlapping) {
    blockers.push(`Patient already holds an active MC (${overlapping.mcNumber}) covering this period`);
    await raiseAlert({
      type: 'DUPLICATE_MC',
      severity: 'HIGH',
      mcId: overlapping.id,
      doctorId: params.doctorId,
      details: { overlappingMc: overlapping.mcNumber },
    });
  }

  // Volume anomaly: impossible daily issuance for one doctor (non-blocking
  // below the critical multiplier, blocking above it)
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.medicalCertificate.count({
    where: { doctorId: params.doctorId, dateIssued: { gte: dayStart } },
  });
  const max = config.fraud.maxMCsPerDoctorPerDay;
  if (todayCount >= max * config.fraud.volumeCriticalMultiplier) {
    blockers.push('Daily issuance limit exceeded — account flagged for review');
    await raiseAlert({
      type: 'VOLUME_ANOMALY',
      severity: 'CRITICAL',
      doctorId: params.doctorId,
      details: { todayCount, threshold: max },
    });
  } else if (todayCount >= max) {
    await raiseAlert({
      type: 'VOLUME_ANOMALY',
      severity: 'MEDIUM',
      doctorId: params.doctorId,
      details: { todayCount, threshold: max },
    });
  }

  return blockers;
}

/** Tampering detected at verification time — always CRITICAL. */
export async function reportTampering(
  mcId: string,
  details: Record<string, unknown>
): Promise<void> {
  await raiseAlert({ type: 'HASH_MISMATCH', severity: 'CRITICAL', mcId, details });
}

/**
 * Login anomaly detection: a successful login from a different country than
 * the previous one within an implausible window raises a GEO_ANOMALY alert.
 */
export async function checkLoginAnomaly(params: {
  userId: string;
  ip: string;
  country: string | null;
  previousCountry: string | null;
  previousLoginAt: Date | null;
}): Promise<void> {
  if (!params.country || !params.previousCountry) return;
  if (params.country === params.previousCountry) return;
  const hoursSince = params.previousLoginAt
    ? (Date.now() - params.previousLoginAt.getTime()) / 36e5
    : Infinity;
  if (hoursSince < 6) {
    await raiseAlert({
      type: 'GEO_ANOMALY',
      severity: 'HIGH',
      userId: params.userId,
      details: {
        ip: params.ip,
        country: params.country,
        previousCountry: params.previousCountry,
        hoursSincePreviousLogin: Math.round(hoursSince * 10) / 10,
      },
    });
  }
}
