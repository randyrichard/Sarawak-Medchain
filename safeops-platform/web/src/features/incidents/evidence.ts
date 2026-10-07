import { api } from '@/api/client'
import type { Actor, AttachmentKind } from '@/api/incidents'

/**
 * Evidence chosen on a report form, and getting it to the server.
 *
 * Both report forms collected files, listed them and confirmed "2 photo(s) attached", and
 * neither ever sent them: only the names went into the report, which the server ignores.
 * A worker who photographed the scene was told the photos were on record when they were
 * not. Found by reporting a near miss on a phone.
 *
 * The files are uploaded once the report exists, because evidence belongs to an incident.
 * What the server refuses is screened out here first, in the same terms, so a file is
 * never listed as attached when it is bound to be rejected.
 */

/** What the server accepts (api/src/lib/uploadSafety.ts). */
export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
export const EVIDENCE_ACCEPT = EVIDENCE_TYPES.join(',')
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024
export const EVIDENCE_HINT = 'Photos (JPEG, PNG, WebP, HEIC) or PDF, up to 10 MB each'

export const evidenceKind = (f: File): AttachmentKind => (f.type === 'application/pdf' ? 'pdf' : 'image')

/** Splits a selection into what can be sent and, in words, what cannot. */
export function screenEvidence(files: File[]): { ok: File[]; refused: string[] } {
  const ok: File[] = []
  const refused: string[] = []
  for (const f of files) {
    if (!EVIDENCE_TYPES.includes(f.type)) refused.push(`${f.name} is not a photo or PDF.`)
    else if (f.size > EVIDENCE_MAX_BYTES) refused.push(`${f.name} is over 10 MB.`)
    else ok.push(f)
  }
  return { ok, refused }
}

/** Uploads each file to the incident. Returns how many did not arrive. */
export async function uploadEvidence(incidentId: string, files: File[], actor: Actor): Promise<number> {
  let failed = 0
  for (const f of files) {
    try {
      await api.addIncidentAttachment(
        incidentId,
        { name: f.name, kind: evidenceKind(f), sizeKb: Math.max(1, Math.round(f.size / 1024)) },
        actor,
        f,
      )
    } catch {
      failed++
    }
  }
  return failed
}
