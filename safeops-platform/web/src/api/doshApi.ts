import { request, qs } from './http'

/**
 * DOSH notification on an incident, under the NADOPOD Regulations 2004.
 *
 * Every rule - which categories are told at once, which form, the seven calendar days - is
 * the server's (api/src/domain/doshNotification.ts). This side renders what it is given.
 */

export type DoshCategory =
  | 'death' | 'serious_bodily_injury' | 'over_four_days' | 'dangerous_occurrence'
  | 'occupational_poisoning' | 'occupational_disease' | 'not_notifiable'

export type DoshState = 'decide' | 'unflagged' | 'not_required' | 'due' | 'overdue' | 'submitted'
export type DoshForm = 'JKKP 6' | 'JKKP 7'

export interface DoshStatus {
  state: DoshState
  form: DoshForm | null
  immediate: boolean
  immediateOutstanding: boolean
  /** "YYYY-MM-DD", the last day the written report is due on, in the site's zone. */
  dueDate: string | null
  daysLeft: number | null
}

export interface DoshView {
  incidentId: string
  category: DoshCategory | null
  categoryLabel: string | null
  detail: string | null
  notRequiredReason: string | null
  decidedBy: string | null
  decidedAt: string | null
  clockFrom: string | null
  informedAt: string | null
  informedHow: string | null
  office: string | null
  submittedAt: string | null
  reference: string | null
  suggestion: { category: DoshCategory | null; flagged: boolean; reason: string }
  status: DoshStatus
  canEdit: boolean
}

export interface DoshInput {
  category: DoshCategory
  detail?: string | null
  notRequiredReason?: string | null
  clockFrom?: string | null
  informedAt?: string | null
  informedHow?: string | null
  office?: string | null
  submittedAt?: string | null
  reference?: string | null
}

export interface DoshOutstanding {
  incidentId: string
  number: string
  title: string
  siteName: string
  occurredAt: string
  category: DoshCategory | null
  categoryLabel: string | null
  state: DoshState
  form: DoshForm | null
  dueDate: string | null
  daysLeft: number | null
  immediateOutstanding: boolean
  reason: string
}

/** The categories as the decision form offers them, with what each means in practice. */
export const DOSH_OPTIONS: { value: DoshCategory; label: string; hint: string }[] = [
  { value: 'death', label: 'Death', hint: 'Tell DOSH at once by the quickest means, then JKKP 6 within 7 days.' },
  {
    value: 'serious_bodily_injury', label: 'Serious bodily injury (First Schedule)',
    hint: 'For example a fracture, an amputation, loss of sight or hearing, or loss of consciousness. Tell DOSH at once, then JKKP 6 within 7 days.',
  },
  {
    value: 'dangerous_occurrence', label: 'Dangerous occurrence (Second Schedule)',
    hint: 'Notifiable even when nobody is hurt, for example a scaffold over 5 m collapsing. Tell DOSH at once, then JKKP 6 within 7 days.',
  },
  { value: 'over_four_days', label: 'Off normal work for more than 4 days', hint: 'JKKP 6 within 7 days of the accident.' },
  { value: 'occupational_poisoning', label: 'Occupational poisoning', hint: 'JKKP 7 within 7 days of learning of the diagnosis.' },
  { value: 'occupational_disease', label: 'Occupational disease', hint: 'JKKP 7 within 7 days of learning of the diagnosis.' },
  { value: 'not_notifiable', label: 'Not notifiable to DOSH', hint: 'Say why, so the record shows the question was answered.' },
]

export const doshApi = {
  get(incidentId: string): Promise<DoshView> {
    return request(`/incidents/${incidentId}/dosh`)
  },

  save(incidentId: string, input: DoshInput): Promise<DoshView> {
    return request(`/incidents/${incidentId}/dosh`, { method: 'PUT', body: JSON.stringify(input) })
  },

  outstanding(companyId: string): Promise<DoshOutstanding[]> {
    return request(`/incidents/dosh/outstanding?${qs({ companyId })}`)
  },
}
