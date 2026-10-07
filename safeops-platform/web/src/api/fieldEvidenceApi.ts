import { blob, request, upload } from './http'

/**
 * Photos and documents for inspections, audit answers and corrective actions with no
 * incident (api/src/routes/fieldEvidence.ts).
 */
export type EvidenceKind = 'inspections' | 'audits' | 'actions'

export interface FieldEvidenceRow {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  auditItemId: string | null
  uploadedBy: string
  createdAt: string
}

export const fieldEvidenceApi = {
  list(kind: EvidenceKind, id: string) {
    return request<{ rows: FieldEvidenceRow[] }>(`/evidence/${kind}/${id}`).then((r) => r.rows)
  },

  /**
   * One request, of at most five files - the server's limit. More than that goes through
   * sendFieldPhotos (features/evidence), which batches and says which batch failed.
   */
  async upload(kind: EvidenceKind, id: string, files: File[], itemId?: string): Promise<FieldEvidenceRow[]> {
    if (files.length > 5) throw new Error('At most five files per upload; use sendFieldPhotos for more.')
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    if (itemId) form.append('itemId', itemId)
    return (await upload<{ rows: FieldEvidenceRow[] }>(`/evidence/${kind}/${id}`, form)).rows
  },

  file(evidenceId: string): Promise<Blob> {
    return blob(`/evidence/file/${evidenceId}`)
  },
}
