import { isBackendConfigured } from '@/api/authApi'
import { type EvidenceKind, fieldEvidenceApi } from '@/api/fieldEvidenceApi'
import { ApiError } from '@/api/types'

/** What happened to a set of photos sent to a record. */
export interface SendResult {
  /** Files the server stored. */
  stored: number
  /** Files that did not arrive, in the order they were chosen, to offer again. */
  failed: File[]
  /** The server's reason for the first refusal, when it gave one. */
  error?: string
}

/**
 * Sends photos to a record that has been saved, five to a request as the server allows.
 *
 * Each request stands alone. A batch that fails does not undo the ones before it: those
 * photos are stored and on the record. Reporting all of them as failed - what this used to
 * do - told the person to add again photos that were already there, and doing so put
 * every one of them on the safety record twice.
 *
 * In the offline demo there is nowhere to send them; the demo's own banner already says
 * nothing typed there is kept, so that is not reported as a failure.
 */
export async function sendFieldPhotos(kind: EvidenceKind, id: string, files: File[], itemId?: string): Promise<SendResult> {
  const result: SendResult = { stored: 0, failed: [] }
  if (!files.length || !isBackendConfigured()) return result
  for (let i = 0; i < files.length; i += 5) {
    const batch = files.slice(i, i + 5)
    try {
      await fieldEvidenceApi.upload(kind, id, batch, itemId)
      result.stored += batch.length
    } catch (e) {
      result.failed.push(...batch)
      result.error ??= e instanceof ApiError ? e.message : undefined
    }
  }
  return result
}
