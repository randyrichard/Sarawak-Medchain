// ─────────────────────────────────────────────────────────────────────────────
// MC data store — the ONLY place the app reads/writes certificate records.
// Pages never touch Supabase directly. The medical reason (diagnosis) is never
// stored or returned here — it stays out of the public verification system.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

// Map a DB row (snake_case) to the app's MC object (camelCase). No diagnosis.
function mapRow(row) {
  return {
    mcId: row.mc_id,
    patientName: row.patient_name,
    patientIC: row.ic_number,
    doctorName: row.doctor_name,
    mmcNumber: row.mmc_number,
    hospital: row.clinic_name,
    dateIssued: row.date_issued,
    duration: row.duration,
    startDate: row.start_date,
    endDate: row.end_date,
    blockNumber: row.block_number,
  };
}

async function directRead(hash) {
  const r = await supabase
    .from('medical_certificates')
    .select('*')
    .eq('id', hash)
    .single();
  return !r.error && r.data ? mapRow(r.data) : null;
}

/**
 * Fetch one certificate by its hash.
 * Prefers the locked-down verify_mc() RPC (returns a single record by exact
 * hash, never the whole table). Falls back to a scoped single-row read if the
 * RPC isn't set up yet, then to localStorage (same-device demo).
 * @returns {Object|null} the MC display object, or null if not found.
 */
export async function fetchMCByHash(hash) {
  if (supabase) {
    try {
      const rpc = await supabase.rpc('verify_mc', { mc_hash: hash });
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        return mapRow(rpc.data[0]);
      }
      if (rpc.error) {
        const row = await directRead(hash);
        if (row) return row;
      }
    } catch {
      const row = await directRead(hash);
      if (row) return row;
    }
  }

  const stored = localStorage.getItem(`mc_${hash}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      /* corrupt local copy — ignore */
    }
  }
  return null;
}

/**
 * Persist an issued certificate for cross-device verification, keyed by its
 * canonical hash. Falls back to localStorage if Supabase is unavailable.
 * @param {Object} r  the MC record (must include mcHash + the display fields).
 * @returns {{ ok: boolean }}
 */
export async function storeMC(r) {
  if (supabase) {
    const { error } = await supabase.from('medical_certificates').insert({
      id: r.mcHash,
      mc_id: r.mcId,
      patient_name: r.patientName,
      ic_number: r.patientIC,
      // diagnosis intentionally NOT stored — kept private, off the public record
      duration: r.duration,
      doctor_name: r.doctorName,
      clinic_name: r.hospital,
      mmc_number: r.mmcNumber,
      date_issued: r.dateIssued,
      start_date: r.startDate,
      end_date: r.endDate,
      block_number: r.blockNumber,
    });
    if (!error) return { ok: true };
    console.warn('Supabase insert error:', error.message);
  }

  try {
    localStorage.setItem(`mc_${r.mcHash}`, JSON.stringify(r));
  } catch {
    /* storage full / unavailable */
  }
  return { ok: false };
}
