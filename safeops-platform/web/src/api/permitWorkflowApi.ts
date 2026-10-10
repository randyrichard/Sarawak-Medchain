import { request } from './http'
import { API_BASE_URL, getAccessToken } from './authApi'

/**
 * The permit workflow surfaces: the approval chain, the toolbox talk, PPE, the JSA and
 * the document pack.
 *
 * Separate from permitsApi because these are the parts an issuer works through at the
 * permit desk, and because the review status endpoint carries the activation gate — the
 * one response whose whole job is to say what is still missing.
 */

export type ReviewStage = 'supervisor_review' | 'hse_review' | 'area_authority'
export type StageState = 'done' | 'current' | 'pending'

export interface ReviewChainStep {
  stage: ReviewStage
  label: string
  state: StageState
  /** True only when this caller's role may sign this stage right now. */
  canSign: boolean
}

export interface ReviewStatus {
  status: string
  chain: ReviewChainStep[]
  /** Sentences describing what still blocks activation. Empty means ready. */
  activationBlockers: string[]
}

export interface JsaStep {
  id: string
  permitId: string
  sequence: number
  step: string
  hazard: string
  risk: string
  control: string
  responsible: string
  residualRisk: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AttachmentKind =
  | 'method_statement' | 'jsa' | 'gas_test_sheet' | 'isolation_certificate' | 'photo' | 'other'

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  method_statement: 'Method Statement',
  jsa: 'JSA',
  gas_test_sheet: 'Gas Test Sheet',
  isolation_certificate: 'Isolation Certificate',
  photo: 'Photo',
  other: 'Other',
}

export interface PermitAttachment {
  id: string
  permitId: string
  kind: AttachmentKind
  originalName: string
  storedName: string
  mimeType: string
  sizeBytes: number
  uploadedBy: string
  createdAt: string
}

/** Selectable PPE. Mirrors PPE_OPTIONS on the server so the two cannot drift. */
export const PPE_OPTIONS = [
  'Helmet', 'Safety Shoes', 'Gloves', 'Face Shield', 'Respirator', 'Harness',
  'Life Jacket', 'Gas Detector', 'SCBA', 'Hearing Protection', 'Other',
] as const
export type PpeItem = (typeof PPE_OPTIONS)[number]

export const permitWorkflowApi = {
  // ── Review chain ───────────────────────────────────────────────────────────

  review(permitId: string): Promise<ReviewStatus> {
    return request(`/permits/${permitId}/review`)
  },

  /**
   * Sign the current stage. Takes no target: the server's chain decides what comes next,
   * so the UI can never be the thing that skips a review.
   */
  advance(permitId: string, statement: string): Promise<ReviewStatus> {
    return request(`/permits/${permitId}/review/advance`, {
      method: 'POST', body: JSON.stringify({ statement }),
    })
  },

  returnToApplicant(permitId: string, reason: string): Promise<ReviewStatus> {
    return request(`/permits/${permitId}/review/return`, {
      method: 'POST', body: JSON.stringify({ reason }),
    })
  },

  // ── Toolbox ────────────────────────────────────────────────────────────────

  recordToolbox(permitId: string, input: { heldAt?: string; supervisor?: string }): Promise<ReviewStatus> {
    return request(`/permits/${permitId}/toolbox`, { method: 'POST', body: JSON.stringify(input) })
  },

  acknowledgeToolbox(attendeeId: string): Promise<ReviewStatus> {
    return request(`/permits/people/${attendeeId}/toolbox-ack`, {
      method: 'POST', body: JSON.stringify({}),
    })
  },

  // ── PPE ────────────────────────────────────────────────────────────────────

  setPpe(permitId: string, items: string[]): Promise<ReviewStatus> {
    return request(`/permits/${permitId}/ppe`, { method: 'PUT', body: JSON.stringify({ items }) })
  },

  acknowledgePpe(permitId: string): Promise<ReviewStatus> {
    return request(`/permits/${permitId}/ppe/acknowledge`, { method: 'POST', body: JSON.stringify({}) })
  },

  // ── JSA ────────────────────────────────────────────────────────────────────

  listJsa(permitId: string): Promise<JsaStep[]> {
    return request<{ rows: JsaStep[] }>(`/permits/${permitId}/jsa`).then((r) => r.rows)
  },

  addJsa(permitId: string, input: Partial<JsaStep> & { hazard: string; control: string }): Promise<JsaStep> {
    return request(`/permits/${permitId}/jsa`, { method: 'POST', body: JSON.stringify(input) })
  },

  updateJsa(stepId: string, patch: Partial<JsaStep>): Promise<JsaStep> {
    return request(`/permits/jsa/${stepId}`, { method: 'PATCH', body: JSON.stringify(patch) })
  },

  removeJsa(stepId: string): Promise<void> {
    return request(`/permits/jsa/${stepId}`, { method: 'DELETE' })
  },

  // ── Attachments ────────────────────────────────────────────────────────────

  listAttachments(permitId: string): Promise<PermitAttachment[]> {
    return request<{ rows: PermitAttachment[] }>(`/permits/${permitId}/attachments`).then((r) => r.rows)
  },

  /**
   * Upload with progress.
   *
   * XHR rather than fetch: fetch still cannot report upload progress, and a 10 MB
   * method statement over site wifi with no progress bar looks like a hung screen.
   */
  upload(
    permitId: string, files: File[], kind: AttachmentKind, onProgress?: (pct: number) => void,
  ): Promise<PermitAttachment[]> {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      for (const f of files) form.append('files', f)
      form.append('kind', kind)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE_URL}/permits/${permitId}/attachments`)
      xhr.withCredentials = true
      const token = getAccessToken()
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        let body: unknown = null
        try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON error page */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve((body as { rows: PermitAttachment[] }).rows)
        } else {
          reject(new Error((body as { message?: string })?.message ?? 'Upload failed.'))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'))
      xhr.send(form)
    })
  },

  /**
   * Fetches the file as a blob so it can be previewed or saved.
   *
   * A plain link cannot carry the Authorization header, and the endpoint re-checks
   * membership on every request — a stored filename grants nothing on its own.
   */
  async fetchBlob(attachmentId: string): Promise<Blob> {
    const token = getAccessToken()
    const res = await fetch(`${API_BASE_URL}/permits/attachments/${attachmentId}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('Could not download that file.')
    return res.blob()
  },

  removeAttachment(attachmentId: string): Promise<void> {
    return request(`/permits/attachments/${attachmentId}`, { method: 'DELETE' })
  },
}
