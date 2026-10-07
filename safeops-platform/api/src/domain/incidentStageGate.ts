/**
 * What an investigation must contain before it may move to a stage.
 *
 * These are the rules the incident page shows the manager at each step ("Needs at least one
 * contributing cause and a 5-Why root statement", "every action must be completed first").
 * The offline demo enforced them; the server checked only that stages went in order. So on a
 * real deployment an incident could be taken from Reported to Closed with no root cause, no
 * corrective action and nothing verified - found by driving the lifecycle in a browser. An
 * investigation that can be closed empty is a record that one happened, not an investigation.
 *
 * Returns why the move is refused, in words for the manager, or null when it may go ahead.
 */
export interface StageGateFacts {
  /** The investigator already on the incident, or the one being assigned now. */
  investigator: string | null
  findings: string | null
  note: string | null
  causes: unknown[]
  rootStatement: string | null
  actions: { status: string }[]
}

const SETTLED = new Set(['completed', 'verified', 'cancelled'])
const CLOSED = new Set(['verified', 'cancelled'])

export function stageGateProblem(to: string, f: StageGateFacts): string | null {
  const live = f.actions.filter((a) => a.status !== 'cancelled')
  switch (to) {
    case 'investigation':
      return f.investigator?.trim() ? null : 'Assign a lead investigator first.'
    case 'rca':
      return (f.findings?.trim().length ?? 0) >= 20
        ? null
        : 'Summarise what the investigation established (at least 20 characters) before the root cause analysis.'
    case 'actions':
      if (f.causes.length === 0) return 'Record at least one contributing cause in the root cause analysis first.'
      if (!f.rootStatement?.trim()) return 'Write the 5-Why root cause statement first.'
      return null
    case 'review': {
      if (live.length === 0) return 'Raise at least one corrective action against the root cause first.'
      const open = live.filter((a) => !SETTLED.has(a.status)).length
      return open === 0 ? null : `${open} corrective action(s) are not completed yet.`
    }
    case 'verification':
      return f.note?.trim() ? null : 'A review note is required.'
    case 'closed': {
      const unverified = f.actions.filter((a) => !CLOSED.has(a.status)).length
      if (unverified > 0) return `${unverified} corrective action(s) still need verifying before the incident can close.`
      return f.note?.trim() ? null : 'A closing note is required.'
    }
    default:
      return null
  }
}
