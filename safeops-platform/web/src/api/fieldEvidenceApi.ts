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

  /** Up to five files per request, as the server allows. */
  async upload(kind: EvidenceKind, id: string, files: File[], itemId?: string): Promise<FieldEvidenceRow[]> {
    const out: FieldEvidenceRow[] = []
    for (let i = 0; i < files.length; i += 5) {
      const form = new FormData()
      files.slice(i, i + 5).forEach((f) => form.append('files', f))
      if (itemId) form.append('itemId', itemId)
      out.push(...(await upload<{ rows: FieldEvidenceRow[] }>(`/evidence/${kind}/${id}`, form)).rows)
    }
    return out
  },

  file(evidenceId: string): Promise<Blob> {
    return blob(`/evidence/file/${evidenceId}`)
  },
}
