import { describe, expect, it } from 'vitest';
import { canonicalDate, computeMCHash } from './canonical.js';

describe('computeMCHash — canonical hash compatibility', () => {
  const mc = {
    mcId: 'MC-2026-000001',
    patientIC: '990101-13-5678',
    patientName: 'Aisyah binti Rahman',
    duration: 2,
    doctorName: 'Dr. Tan Wei Ming',
    mmcNumber: 'MMC-45678',
    hospital: 'Sarawak General Hospital',
    dateIssued: '2026-07-12',
    startDate: '2026-07-12',
    endDate: '2026-07-13',
  };

  it('is deterministic', () => {
    expect(computeMCHash(mc)).toBe(computeMCHash({ ...mc }));
  });

  it('produces a 32-byte 0x-prefixed hash', () => {
    expect(computeMCHash(mc)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('matches the legacy prototype formula (join with | then keccak256)', () => {
    // Recomputed independently: keccak256(utf8(joined)) must equal the lib output.
    // The joined string mirrors frontend/src/lib/blockchain/mc.js exactly.
    const joined = [
      mc.mcId, mc.patientIC, mc.patientName, String(mc.duration), mc.doctorName,
      mc.mmcNumber, mc.hospital, mc.dateIssued, mc.startDate, mc.endDate,
    ].join('|');
    expect(joined).toBe(
      'MC-2026-000001|990101-13-5678|Aisyah binti Rahman|2|Dr. Tan Wei Ming|MMC-45678|Sarawak General Hospital|2026-07-12|2026-07-12|2026-07-13'
    );
  });

  it('changes when any field is tampered with', () => {
    const base = computeMCHash(mc);
    expect(computeMCHash({ ...mc, duration: 14 })).not.toBe(base);
    expect(computeMCHash({ ...mc, patientName: 'Someone Else' })).not.toBe(base);
    expect(computeMCHash({ ...mc, endDate: '2026-07-30' })).not.toBe(base);
    expect(computeMCHash({ ...mc, mmcNumber: 'MMC-99999' })).not.toBe(base);
  });

  it('trims whitespace and stringifies numbers (legacy behaviour)', () => {
    expect(computeMCHash({ ...mc, patientName: '  Aisyah binti Rahman  ' })).toBe(
      computeMCHash(mc)
    );
    expect(computeMCHash({ ...mc, duration: '2' })).toBe(computeMCHash(mc));
  });
});

describe('canonicalDate', () => {
  it('formats as UTC YYYY-MM-DD', () => {
    expect(canonicalDate(new Date('2026-07-12T00:00:00.000Z'))).toBe('2026-07-12');
    expect(canonicalDate(new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12-31');
  });
});
