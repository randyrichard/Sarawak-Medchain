import type { VerificationResult } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { canonicalDate, computeMCHash } from '../lib/canonical.js';
import { decryptField, verifySignature } from '../lib/crypto.js';
import { chainEnabled, explorerTxUrl, verifyMCOnChain } from '../lib/chain.js';
import { audit } from '../lib/audit.js';
import { reportTampering } from './fraudService.js';

/**
 * Public verification result. Deliberately privacy-preserving:
 *  - IC number is masked (first 6 digits only — birthdate part, no serial)
 *  - diagnosis is NEVER included
 */
export interface VerifyOutcome {
  result: VerificationResult;
  mc?: {
    mcNumber: string;
    patientName: string;
    patientIcMasked: string;
    restDays: number;
    startDate: string;
    endDate: string;
    dateIssued: string;
    doctorName: string;
    mmcNumber: string;
    facilityName: string;
    facilityState: string;
    status: string;
    amended: boolean;
    revokedReason?: string;
  };
  integrity: {
    signatureValid: boolean | null;
    hashIntact: boolean | null;
    blockchain: {
      checked: boolean;
      anchored: boolean;
      txHash?: string;
      explorerUrl?: string;
      anchoredAt?: string;
      issuerVerifiedOnChain?: boolean;
    };
  };
  checkedAt: string;
}

function maskIc(ic: string): string {
  const clean = ic.replace(/[^0-9A-Za-z]/g, '');
  if (clean.length <= 6) return `${clean.slice(0, 2)}****`;
  return `${clean.slice(0, 6)}-**-****`;
}

export async function verifyByHash(
  hash: string,
  context: { verifierUserId?: string; verifierType?: string; ip?: string; userAgent?: string }
): Promise<VerifyOutcome> {
  const checkedAt = new Date().toISOString();
  const normalized = hash.toLowerCase().startsWith('0x') ? hash.toLowerCase() : `0x${hash.toLowerCase()}`;

  const mc = await prisma.medicalCertificate.findUnique({
    where: { canonicalHash: normalized },
    include: {
      doctor: { include: { user: { select: { fullName: true } } } },
      facility: { select: { name: true, state: true } },
    },
  });

  const record = async (result: VerificationResult, mcId?: string) => {
    await prisma.verificationEvent.create({
      data: {
        mcId,
        hashQueried: normalized,
        result,
        verifierUserId: context.verifierUserId,
        verifierType: context.verifierType ?? 'public',
        ip: context.ip,
        userAgent: context.userAgent,
      },
    });
    await audit({
      actorId: context.verifierUserId,
      action: 'VERIFY_MC',
      entityType: 'MedicalCertificate',
      entityId: mcId ?? normalized,
      ip: context.ip,
      meta: { result },
    });
  };

  if (!mc) {
    await record('INVALID');
    return {
      result: 'INVALID',
      integrity: {
        signatureValid: null,
        hashIntact: null,
        blockchain: { checked: false, anchored: false },
      },
      checkedAt,
    };
  }

  // 1. Recompute the canonical hash from stored data — detects any edit to
  //    the database record after issuance.
  const patientIc = decryptField(mc.patientIcEncrypted);
  const recomputed = computeMCHash({
    mcId: mc.mcNumber,
    patientIC: patientIc,
    patientName: mc.patientName,
    duration: mc.restDays,
    doctorName: mc.doctor.user.fullName,
    mmcNumber: mc.doctor.mmcNumber,
    hospital: mc.facility.name,
    dateIssued: canonicalDate(mc.dateIssued),
    startDate: canonicalDate(mc.startDate),
    endDate: canonicalDate(mc.endDate),
  });
  const hashIntact = recomputed === mc.canonicalHash;

  // 2. Digital signature over the hash — proves the issuing doctor's key
  //    produced this certificate.
  const signatureValid = verifySignature(
    mc.canonicalHash,
    mc.signature,
    mc.doctor.signingPublicKey
  );

  // 3. Blockchain anchor — independent, immutable timestamp.
  const chain = mc.anchored ? await verifyMCOnChain(mc.canonicalHash) : null;
  const blockchain = {
    checked: chainEnabled() && mc.anchored,
    anchored: mc.anchored && (chain ? chain.exists : true),
    txHash: mc.chainTxHash ?? undefined,
    explorerUrl: mc.chainTxHash ? explorerTxUrl(mc.chainTxHash) : undefined,
    anchoredAt: mc.chainTimestamp?.toISOString(),
    issuerVerifiedOnChain: chain?.doctorVerified,
  };

  let result: VerificationResult;
  if (!hashIntact || !signatureValid) {
    result = 'TAMPERED';
    await reportTampering(mc.id, {
      hashIntact,
      signatureValid,
      recomputedHash: recomputed,
      storedHash: mc.canonicalHash,
    });
  } else if (mc.status === 'REVOKED') {
    result = 'REVOKED';
  } else if (mc.status === 'AMENDED') {
    result = 'REVOKED'; // superseded — the replacement MC is the valid one
  } else if (mc.endDate.getTime() < Date.now() - 24 * 3600 * 1000) {
    // an MC "expires" for verification purposes once its rest period is over
    result = 'EXPIRED';
  } else {
    result = 'VALID';
  }

  await record(result, mc.id);

  return {
    result,
    mc: {
      mcNumber: mc.mcNumber,
      patientName: mc.patientName,
      patientIcMasked: maskIc(patientIc),
      restDays: mc.restDays,
      startDate: canonicalDate(mc.startDate),
      endDate: canonicalDate(mc.endDate),
      dateIssued: canonicalDate(mc.dateIssued),
      doctorName: mc.doctor.user.fullName,
      mmcNumber: mc.doctor.mmcNumber,
      facilityName: mc.facility.name,
      facilityState: mc.facility.state,
      status: mc.status,
      amended: mc.status === 'AMENDED',
      revokedReason: mc.revokedReason ?? undefined,
    },
    integrity: { signatureValid, hashIntact, blockchain },
    checkedAt,
  };
}
