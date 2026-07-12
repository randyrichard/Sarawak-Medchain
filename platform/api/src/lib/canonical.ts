import { keccak256, toUtf8Bytes } from 'ethers';

/**
 * Canonical MC fields — the exact data committed to the blockchain.
 *
 * COMPATIBILITY CONTRACT: the field order and formatting below match the
 * original Sarawak MedChain prototype (`frontend/src/lib/blockchain/mc.js`)
 * so that every MC already anchored on the live Sepolia contract remains
 * verifiable. This must NEVER change while MCs are in circulation.
 *
 * The diagnosis is deliberately excluded: employers verify that a valid
 * certificate exists for a person and period — never the medical reason.
 */
export interface CanonicalMC {
  mcId: string; // human-readable MC number
  patientIC: string;
  patientName: string;
  duration: number | string; // rest days
  doctorName: string;
  mmcNumber: string;
  hospital: string; // issuing facility name
  dateIssued: string; // YYYY-MM-DD
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export function computeMCHash(mc: CanonicalMC): string {
  const canonical = [
    mc.mcId,
    mc.patientIC,
    mc.patientName,
    String(mc.duration),
    mc.doctorName,
    mc.mmcNumber,
    mc.hospital,
    mc.dateIssued,
    mc.startDate,
    mc.endDate,
  ]
    .map((v) => String(v ?? '').trim())
    .join('|');

  return keccak256(toUtf8Bytes(canonical));
}

/** Format a Date as the canonical YYYY-MM-DD string (UTC). */
export function canonicalDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
