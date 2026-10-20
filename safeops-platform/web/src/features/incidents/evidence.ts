import { api } from '@/api/client'
import type { Actor, AttachmentKind } from '@/api/incidents'
import type { QueuedFile } from '@/lib/fieldOutbox/queue'

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
 *
 * With no signal the bytes go into the outbox and are uploaded when the report lands
 * (`queueableEvidence`, and `./outbox.ts` for the replay).
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

/**
 * Uploads one file to the incident.
 *
 * Throws, with the API's error code intact. That matters on the offline path: the outbox
 * decides between "retry when there is signal" and "show a person" from that code, and a
 * failure flattened into a count would lose the distinction.
 */
export function uploadOneEvidence(incidentId: string, file: File, actor: Actor): Promise<unknown> {
  return api.addIncidentAttachment(
    incidentId,
    { name: file.name, kind: evidenceKind(file), sizeKb: Math.max(1, Math.round(file.size / 1024)) },
    actor,
    file,
  )
}

/**
 * Uploads each file to the incident. Returns how many did not arrive.
 *
 * For the online path, where the report has just been filed and the screen can say which
 * photos did not make it. The offline drain uses `uploadOneEvidence` directly, because it
 * needs the failure rather than a tally.
 */
export async function uploadEvidence(incidentId: string, files: File[], actor: Actor): Promise<number> {
  let failed = 0
  for (const f of files) {
    try {
      await uploadOneEvidence(incidentId, f, actor)
    } catch {
      failed++
    }
  }
  return failed
}

/**
 * Turns a selection into something the outbox can keep.
 *
 * A File is already a Blob, so this is the bytes themselves rather than a reference to
 * them — which is the point. The name and type are carried alongside because IndexedDB
 * stores the Blob, and a File rebuilt on the way out needs both to be uploaded as what it
 * is (see fieldOutbox/store.ts).
 */
export const queueableEvidence = (files: File[]): QueuedFile[] =>
  files.map((f) => ({ name: f.name, type: f.type, blob: f }))
