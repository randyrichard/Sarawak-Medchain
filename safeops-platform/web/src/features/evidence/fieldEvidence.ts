import { isBackendConfigured } from '@/api/authApi'
import { type EvidenceKind, fieldEvidenceApi } from '@/api/fieldEvidenceApi'

/**
 * Sends photos chosen in a runner once the record they belong to has been saved.
 *
 * Returns how many did not arrive, so the screen can say so rather than claim them. In the
 * offline demo there is nowhere to send them; the demo's own banner already says nothing
 * typed there is kept, so that is not reported as a failure.
 */
export async function sendFieldPhotos(kind: EvidenceKind, id: string, files: File[], itemId?: string): Promise<number> {
  if (!files.length || !isBackendConfigured()) return 0
  try {
    await fieldEvidenceApi.upload(kind, id, files, itemId)
    return 0
  } catch {
    return files.length
  }
}
