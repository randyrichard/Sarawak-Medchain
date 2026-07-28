import { ApiError } from '../types'
import type { Actor } from '../incidents'
import {
  GAS_TEST_REQUIRED, ISOLATION_REQUIRED, PERMIT_CONTROLS, PERMIT_MAX_HOURS,
  PERMIT_STATUS_LABEL, PERMIT_TYPE_LABEL, gasTestPasses,
  type GasTest, type IsolationPoint, type NewPermitInput, type Permit, type PermitFilters,
  type PermitStats, type PermitStatus, type PermitType, type PermitView,
} from '../permits'
import { claimIsAuthentic } from './identity'

/**
 * In-memory seed board for the credential-free demo. PostgreSQL is the source of truth
 * for permits (see permitsApi); this exists only so the no-backend build still has a
 * Permits page to show, and it holds nothing between reloads.
 *
 * It used to persist to localStorage under `safeops.permits.v1`. That is gone on purpose:
 * a permit board rebuilt from a browser cache can disagree with the plant, and one that
 * reads "active" while the database says "suspended" is more dangerous than no board.
 */

/** Issuing authority: who may approve, suspend and close a permit. */
const ISSUER_ROLES = ['admin', 'hse_manager', 'safety_officer']

const now = () => new Date().toISOString()
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

function controlsFor(type: PermitType) {
  return PERMIT_CONTROLS[type].map((c, i) => ({
    id: `ctl-${i}`,
    label: c.label,
    required: c.required,
    confirmed: false,
  }))
}

/**
 * Seeds a realistic board: work in progress, something awaiting approval, one permit
 * about to expire (the state that actually matters on a live site), and closed history.
 */
function seed(): Permit[] {
  const mk = (p: Partial<Permit> & Pick<Permit, 'code' | 'type' | 'title' | 'siteId' | 'status'>): Permit => ({
    id: p.code.toLowerCase(),
    description: '',
    companyId: 'big',
    department: 'Maintenance',
    location: '',
    applicant: 'Ganesh Pillai',
    workerCount: 2,
    validFrom: hoursFromNow(-2),
    validTo: hoursFromNow(6),
    controls: controlsFor(p.type),
    isolations: [],
    gasTests: [],
    signatures: [],
    timeline: [],
    createdAt: hoursFromNow(-3),
    ...p,
  }) as Permit

  const confirmAll = (perm: Permit, by: string): Permit => ({
    ...perm,
    controls: perm.controls.map((c) => ({ ...c, confirmed: true, confirmedBy: by, confirmedAt: hoursFromNow(-2) })),
  })

  const p1 = confirmAll(mk({
    code: 'PTW-4401', type: 'hot_work', title: 'Weld repair on jetty pipe support',
    siteId: 'btu', department: 'Maintenance', location: 'Jetty 2, loading arm 3 manifold',
    applicant: 'Faizal Omar', contractor: 'Sarawak Fabrication Sdn Bhd', workerCount: 3,
    status: 'active', validFrom: hoursFromNow(-3), validTo: hoursFromNow(0.6),
    approver: 'Amirul Hassan', approvedAt: hoursFromNow(-3),
    description: 'Fillet weld repair to corroded pipe support bracket. Grinding and MIG welding.',
  }), 'Amirul Hassan')
  p1.gasTests = [{
    id: 'gt-1', testedAt: hoursFromNow(-3), testedBy: 'Amirul Hassan',
    oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 2, pass: true,
  }]
  p1.signatures = [
    { role: 'applicant', name: 'Faizal Omar', signedAt: hoursFromNow(-3.2), statement: 'I have read and understood the precautions.' },
    { role: 'approver', name: 'Amirul Hassan', signedAt: hoursFromNow(-3), statement: 'Controls verified on site. Permit issued.' },
  ]
  p1.timeline = [
    { id: 'e1', at: hoursFromNow(-3.5), actor: 'Faizal Omar', action: 'Permit requested' },
    { id: 'e2', at: hoursFromNow(-3.2), actor: 'Faizal Omar', action: 'Submitted for approval' },
    { id: 'e3', at: hoursFromNow(-3), actor: 'Amirul Hassan', action: 'Approved', detail: 'Controls verified on site.' },
    { id: 'e4', at: hoursFromNow(-2.9), actor: 'Faizal Omar', action: 'Work started' },
  ]

  const p2 = confirmAll(mk({
    code: 'PTW-4402', type: 'confined_space', title: 'Internal inspection of settling tank T-104',
    siteId: 'btu', department: 'Field Operations', location: 'Tank farm, T-104',
    applicant: 'Hafiz Rahman', workerCount: 2,
    status: 'active', validFrom: hoursFromNow(-1), validTo: hoursFromNow(7),
    approver: 'Marcus Tan', approvedAt: hoursFromNow(-1.2),
    description: 'Entry for internal corrosion survey following the annual integrity plan.',
  }), 'Marcus Tan')
  p2.gasTests = [
    { id: 'gt-2', testedAt: hoursFromNow(-1.3), testedBy: 'Marcus Tan', oxygenPct: 20.8, lelPct: 0, h2sPpm: 1, coPpm: 0, pass: true },
    { id: 'gt-3', testedAt: hoursFromNow(-0.3), testedBy: 'Marcus Tan', oxygenPct: 20.7, lelPct: 1, h2sPpm: 2, coPpm: 1, pass: true },
  ]
  p2.isolations = [
    { id: 'iso-1', description: 'Feed valve V-2201 closed and locked', tagId: 'LOTO-4471', isolatedBy: 'Hafiz Rahman', isolatedAt: hoursFromNow(-1.4) },
    { id: 'iso-2', description: 'Agitator motor breaker racked out', tagId: 'LOTO-4472', isolatedBy: 'Hafiz Rahman', isolatedAt: hoursFromNow(-1.4) },
  ]
  p2.timeline = [
    { id: 'e5', at: hoursFromNow(-1.6), actor: 'Hafiz Rahman', action: 'Permit requested' },
    { id: 'e6', at: hoursFromNow(-1.2), actor: 'Marcus Tan', action: 'Approved' },
    { id: 'e7', at: hoursFromNow(-1), actor: 'Hafiz Rahman', action: 'Work started' },
  ]

  const p3 = mk({
    code: 'PTW-4403', type: 'working_at_height', title: 'Replace corroded handrail on Level 12',
    siteId: 'mri', department: 'Maintenance', location: 'Process tower, Level 12 north face',
    applicant: 'Kumar Raj', contractor: 'Miri Access Services', workerCount: 4,
    status: 'submitted', validFrom: hoursFromNow(2), validTo: hoursFromNow(12),
    description: 'Cut out and replace 6m of corroded handrail. Rope access.',
  })
  p3.timeline = [{ id: 'e8', at: hoursFromNow(-0.5), actor: 'Kumar Raj', action: 'Submitted for approval' }]

  const p4 = confirmAll(mk({
    code: 'PTW-4404', type: 'electrical_isolation', title: 'Motor control centre panel upgrade',
    siteId: 'kch', department: 'Engineering', location: 'MCC Room B, panel 7',
    applicant: 'Ganesh Pillai', workerCount: 2,
    status: 'closed', validFrom: hoursFromNow(-30), validTo: hoursFromNow(-6),
    approver: 'Marcus Tan', approvedAt: hoursFromNow(-31),
    closedBy: 'Marcus Tan', closedAt: hoursFromNow(-6.5), handbackConfirmed: true,
    description: 'Replace failed contactor and upgrade overload relay.',
  }), 'Marcus Tan')
  p4.isolations = [{
    id: 'iso-3', description: 'MCC panel 7 incomer isolated', tagId: 'LOTO-4460',
    isolatedBy: 'Ganesh Pillai', isolatedAt: hoursFromNow(-31),
    removedBy: 'Ganesh Pillai', removedAt: hoursFromNow(-6.6),
  }]
  p4.signatures = [
    { role: 'applicant', name: 'Ganesh Pillai', signedAt: hoursFromNow(-31.2), statement: 'I have read and understood the precautions.' },
    { role: 'approver', name: 'Marcus Tan', signedAt: hoursFromNow(-31), statement: 'Isolation verified. Permit issued.' },
    { role: 'closer', name: 'Marcus Tan', signedAt: hoursFromNow(-6.5), statement: 'Site handed back, isolations released, area clear.' },
  ]

  const p5 = mk({
    code: 'PTW-4405', type: 'lifting_operation', title: 'Lift replacement pump into place',
    siteId: 'btu', department: 'Maintenance', location: 'Pump house 2',
    applicant: 'Faizal Omar', contractor: 'Borneo Crane Hire', workerCount: 5,
    status: 'approved', validFrom: hoursFromNow(1), validTo: hoursFromNow(9),
    approver: 'Amirul Hassan', approvedAt: hoursFromNow(-0.2),
    description: '4.2t centrifugal pump lift with 50t mobile crane.',
  })
  p5.controls = p5.controls.map((c, i) => (i < 4 ? { ...c, confirmed: true, confirmedBy: 'Amirul Hassan', confirmedAt: hoursFromNow(-0.2) } : c))

  return [p1, p2, p3, p4, p5]
}

export class PermitStore {
  private permits: Permit[]
  private nextCode: number
  private remindersSent: Record<string, true> = {}

  constructor(private notify: (kind: 'system' | 'action' | 'incident', title: string, detail: string) => void) {
    this.permits = seed()
    this.nextCode = 4406
    // Clear the retired store from browsers that still carry it, so a stale board
    // cannot reappear if this file is ever pointed at localStorage again.
    try {
      localStorage.removeItem('safeops.permits.v1')
    } catch {
      /* storage unavailable — nothing to clear */
    }
  }

  /** Verified role: a claimed role is honoured only if the session genuinely holds it. */
  private authenticRole(actor: Actor): string {
    if (!claimIsAuthentic(actor.role)) {
      throw new ApiError('forbidden', 'Your session does not hold the claimed role.')
    }
    return actor.role
  }

  private requireIssuer(actor: Actor) {
    if (!ISSUER_ROLES.includes(this.authenticRole(actor))) {
      throw new ApiError('forbidden', 'Only a Safety Officer, HSE Manager or Admin can issue or close permits.')
    }
  }

  private find(id: string): Permit {
    const p = this.permits.find((x) => x.id === id)
    if (!p) throw new ApiError('not_found', 'Permit not found.')
    return p
  }

  private log(p: Permit, actor: Actor, action: string, detail?: string) {
    p.timeline.unshift({ id: uid('ev'), at: now(), actor: actor.name, action, detail })
  }

  /** Derives live status: an active permit past its window is expired, not active. */
  private effectiveStatus(p: Permit): PermitStatus {
    if ((p.status === 'active' || p.status === 'approved') && new Date(p.validTo).getTime() < Date.now()) {
      return 'expired'
    }
    return p.status
  }

  private toView(p: Permit): PermitView {
    const status = this.effectiveStatus(p)
    const hoursRemaining = (new Date(p.validTo).getTime() - Date.now()) / 3600_000
    return {
      ...p,
      status,
      hoursRemaining,
      expiringSoon: status === 'active' && hoursRemaining > 0 && hoursRemaining <= 1,
      outstandingControls: p.controls.filter((c) => c.required && !c.confirmed).length,
      typeLabel: PERMIT_TYPE_LABEL[p.type],
      statusLabel: PERMIT_STATUS_LABEL[status],
    }
  }

  list(companyId: string, filters: PermitFilters = {}): PermitView[] {
    const q = filters.q?.trim().toLowerCase()
    const LIVE: PermitStatus[] = ['submitted', 'approved', 'active', 'suspended', 'expired']

    return this.permits
      .filter((p) => p.companyId === companyId)
      .filter((p) => !filters.siteId || p.siteId === filters.siteId)
      .filter((p) => !filters.type || p.type === filters.type)
      .map((p) => this.toView(p))
      .filter((v) => {
        if (!filters.status || filters.status === 'all') return true
        if (filters.status === 'live') return LIVE.includes(v.status)
        return v.status === filters.status
      })
      .filter((v) => !q || [v.code, v.title, v.location, v.applicant, v.contractor ?? '', v.department, v.typeLabel]
        .join(' ').toLowerCase().includes(q))
      // Most urgent first: expiring, then active, then soonest to expire.
      .sort((a, b) => {
        const rank = (v: PermitView) =>
          v.expiringSoon ? 0 : v.status === 'expired' ? 1 : v.status === 'active' ? 2
            : v.status === 'submitted' ? 3 : v.status === 'approved' ? 4 : 5
        return rank(a) - rank(b) || a.hoursRemaining - b.hoursRemaining
      })
  }

  get(id: string): PermitView {
    return this.toView(this.find(id))
  }

  stats(companyId: string, siteId?: string | null): PermitStats {
    const all = this.permits
      .filter((p) => p.companyId === companyId)
      .filter((p) => !siteId || p.siteId === siteId)
      .map((p) => this.toView(p))

    const monthAgo = Date.now() - 30 * 86400_000
    return {
      activeNow: all.filter((p) => p.status === 'active').length,
      awaitingApproval: all.filter((p) => p.status === 'submitted').length,
      expiringWithin2h: all.filter((p) => p.status === 'active' && p.hoursRemaining > 0 && p.hoursRemaining <= 2).length,
      expiredOpen: all.filter((p) => p.status === 'expired').length,
      closedThisMonth: all.filter((p) => p.status === 'closed' && p.closedAt && new Date(p.closedAt).getTime() > monthAgo).length,
      byType: Object.entries(PERMIT_TYPE_LABEL).map(([type, label]) => ({
        type: type as PermitType,
        label,
        active: all.filter((p) => p.type === type && p.status === 'active').length,
      })).filter((t) => t.active > 0),
    }
  }

  create(input: NewPermitInput, actor: Actor): PermitView {
    this.authenticRole(actor)
    if (!input.title.trim()) throw new ApiError('validation', 'A work description is required.')

    const hours = (new Date(input.validTo).getTime() - new Date(input.validFrom).getTime()) / 3600_000
    if (hours <= 0) throw new ApiError('validation', 'The permit must end after it starts.')
    const max = PERMIT_MAX_HOURS[input.type]
    if (hours > max) {
      throw new ApiError('validation', `A ${PERMIT_TYPE_LABEL[input.type]} permit cannot exceed ${max} hours.`)
    }

    const permit: Permit = {
      id: uid('ptw'),
      code: `PTW-${this.nextCode++}`,
      ...input,
      status: 'draft',
      controls: controlsFor(input.type),
      isolations: [],
      gasTests: [],
      signatures: [],
      timeline: [],
      createdAt: now(),
    }
    this.log(permit, actor, 'Permit created')
    this.permits.unshift(permit)
    return this.toView(permit)
  }

  submit(id: string, actor: Actor): PermitView {
    this.authenticRole(actor)
    const p = this.find(id)
    if (p.status !== 'draft') throw new ApiError('validation', 'Only a draft permit can be submitted.')

    p.status = 'submitted'
    p.signatures.push({
      role: 'applicant', name: actor.name, signedAt: now(),
      statement: 'I have read and understood the precautions and will comply with them.',
    })
    this.log(p, actor, 'Submitted for approval')
    this.notify('system', `Permit ${p.code} awaiting approval`, `${PERMIT_TYPE_LABEL[p.type]} — ${p.location}`)
    return this.toView(p)
  }

  /**
   * Issue. Blocked until every required control is confirmed, plus a passing gas test
   * and recorded isolations where the permit type demands them — the checks exist to
   * be binding, so approval cannot skip them.
   */
  approve(id: string, statement: string, actor: Actor): PermitView {
    this.requireIssuer(actor)
    const p = this.find(id)
    if (p.status !== 'submitted') throw new ApiError('validation', 'Only a submitted permit can be approved.')

    const outstanding = p.controls.filter((c) => c.required && !c.confirmed)
    if (outstanding.length > 0) {
      throw new ApiError('validation', `${outstanding.length} required control(s) are not yet confirmed.`)
    }
    if (GAS_TEST_REQUIRED.includes(p.type)) {
      const latest = p.gasTests[p.gasTests.length - 1]
      if (!latest) throw new ApiError('validation', 'A gas test is required before this permit can be issued.')
      if (!latest.pass) throw new ApiError('validation', 'The most recent gas test failed. Re-test before issuing.')
    }
    if (ISOLATION_REQUIRED.includes(p.type) && p.isolations.length === 0) {
      throw new ApiError('validation', 'At least one isolation point must be recorded for this permit type.')
    }

    p.status = 'approved'
    p.approver = actor.name
    p.approvedAt = now()
    p.signatures.push({ role: 'approver', name: actor.name, signedAt: now(), statement: statement || 'Controls verified on site. Permit issued.' })
    this.log(p, actor, 'Approved', statement || undefined)
    this.notify('system', `Permit ${p.code} issued`, `${PERMIT_TYPE_LABEL[p.type]} at ${p.location}. Valid until ${new Date(p.validTo).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}.`)
    return this.toView(p)
  }

  reject(id: string, reason: string, actor: Actor): PermitView {
    this.requireIssuer(actor)
    if (!reason.trim()) throw new ApiError('validation', 'A reason is required so the applicant can correct it.')
    const p = this.find(id)
    if (p.status !== 'submitted') throw new ApiError('validation', 'Only a submitted permit can be rejected.')

    p.status = 'rejected'
    p.rejectionReason = reason
    this.log(p, actor, 'Rejected', reason)
    this.notify('system', `Permit ${p.code} rejected`, reason)
    return this.toView(p)
  }

  /** Work start. Separate from approval because issue and start are distinct events. */
  activate(id: string, actor: Actor): PermitView {
    this.authenticRole(actor)
    const p = this.find(id)
    if (this.effectiveStatus(p) === 'expired') throw new ApiError('validation', 'This permit has expired. Request a new one.')
    if (p.status !== 'approved') throw new ApiError('validation', 'The permit must be approved before work starts.')

    p.status = 'active'
    this.log(p, actor, 'Work started')
    return this.toView(p)
  }

  suspend(id: string, reason: string, actor: Actor): PermitView {
    this.requireIssuer(actor)
    if (!reason.trim()) throw new ApiError('validation', 'State why the permit is being suspended.')
    const p = this.find(id)
    if (p.status !== 'active') throw new ApiError('validation', 'Only an active permit can be suspended.')

    p.status = 'suspended'
    p.suspendedReason = reason
    this.log(p, actor, 'Suspended', reason)
    this.notify('incident', `Permit ${p.code} suspended`, `${reason} — work must stop immediately.`)
    return this.toView(p)
  }

  resume(id: string, actor: Actor): PermitView {
    this.requireIssuer(actor)
    const p = this.find(id)
    if (p.status !== 'suspended') throw new ApiError('validation', 'Only a suspended permit can be resumed.')
    if (this.effectiveStatus(p) === 'expired') throw new ApiError('validation', 'This permit has expired. Request a new one.')

    p.status = 'active'
    p.suspendedReason = undefined
    this.log(p, actor, 'Resumed')
    return this.toView(p)
  }

  /** Close. Handback is mandatory and every isolation must be released first. */
  close(id: string, input: { handbackConfirmed: boolean; statement: string }, actor: Actor): PermitView {
    this.requireIssuer(actor)
    const p = this.find(id)
    if (!['active', 'suspended', 'approved', 'expired'].includes(this.effectiveStatus(p))) {
      throw new ApiError('validation', 'This permit is not open.')
    }
    if (!input.handbackConfirmed) {
      throw new ApiError('validation', 'Confirm the site has been handed back before closing.')
    }
    const live = p.isolations.filter((i) => !i.removedAt)
    if (live.length > 0) {
      throw new ApiError('validation', `${live.length} isolation(s) are still applied. Release them before closing.`)
    }

    p.status = 'closed'
    p.closedBy = actor.name
    p.closedAt = now()
    p.handbackConfirmed = true
    p.signatures.push({ role: 'closer', name: actor.name, signedAt: now(), statement: input.statement || 'Site handed back, area clear.' })
    this.log(p, actor, 'Closed', input.statement || undefined)
    return this.toView(p)
  }

  confirmControl(permitId: string, controlId: string, confirmed: boolean, actor: Actor): PermitView {
    this.authenticRole(actor)
    const p = this.find(permitId)
    if (['closed', 'rejected'].includes(p.status)) throw new ApiError('validation', 'This permit is no longer open.')

    const c = p.controls.find((x) => x.id === controlId)
    if (!c) throw new ApiError('not_found', 'Control not found.')
    c.confirmed = confirmed
    c.confirmedBy = confirmed ? actor.name : undefined
    c.confirmedAt = confirmed ? now() : undefined
    return this.toView(p)
  }

  addGasTest(permitId: string, reading: Omit<GasTest, 'id' | 'testedAt' | 'testedBy' | 'pass'>, actor: Actor): PermitView {
    this.authenticRole(actor)
    const p = this.find(permitId)
    const pass = gasTestPasses(reading)
    p.gasTests.push({ ...reading, id: uid('gt'), testedAt: now(), testedBy: actor.name, pass })
    this.log(p, actor, pass ? 'Gas test passed' : 'Gas test FAILED',
      `O₂ ${reading.oxygenPct}% · LEL ${reading.lelPct}% · H₂S ${reading.h2sPpm}ppm · CO ${reading.coPpm}ppm`)

    // A failed test on live work is an immediate stop condition.
    if (!pass && p.status === 'active') {
      p.status = 'suspended'
      p.suspendedReason = 'Gas test failed — atmosphere outside safe limits.'
      this.notify('incident', `Permit ${p.code} suspended — gas test failed`, 'Atmosphere outside safe limits. Evacuate and re-test.')
    }
    return this.toView(p)
  }

  addIsolation(permitId: string, input: Pick<IsolationPoint, 'description' | 'tagId'>, actor: Actor): PermitView {
    this.authenticRole(actor)
    const p = this.find(permitId)
    p.isolations.push({ ...input, id: uid('iso'), isolatedBy: actor.name, isolatedAt: now() })
    this.log(p, actor, 'Isolation applied', `${input.tagId} — ${input.description}`)
    return this.toView(p)
  }

  releaseIsolation(permitId: string, isolationId: string, actor: Actor): PermitView {
    this.authenticRole(actor)
    const p = this.find(permitId)
    const iso = p.isolations.find((i) => i.id === isolationId)
    if (!iso) throw new ApiError('not_found', 'Isolation point not found.')
    if (iso.removedAt) throw new ApiError('validation', 'This isolation has already been released.')
    iso.removedBy = actor.name
    iso.removedAt = now()
    this.log(p, actor, 'Isolation released', iso.tagId)
    return this.toView(p)
  }

  /**
   * Expiry sweep. Fires once per permit at the one-hour mark and again on expiry, so a
   * crew is warned before the permit lapses rather than after — the whole point of the
   * time bound. Idempotent, so repeated calls do not spam.
   */
  sweepExpiring(): void {
    for (const p of this.permits) {
      if (p.status !== 'active' && p.status !== 'approved') continue
      const hours = (new Date(p.validTo).getTime() - Date.now()) / 3600_000

      const warnKey = `${p.id}:warn`
      if (hours > 0 && hours <= 1 && !this.remindersSent[warnKey]) {
        this.remindersSent[warnKey] = true
        this.notify('action', `Permit ${p.code} expires within the hour`,
          `${PERMIT_TYPE_LABEL[p.type]} at ${p.location}. Extend or close before ${new Date(p.validTo).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}.`)
      }

      const expKey = `${p.id}:expired`
      if (hours <= 0 && !this.remindersSent[expKey]) {
        this.remindersSent[expKey] = true
        this.notify('incident', `Permit ${p.code} has EXPIRED with work open`,
          `${p.applicant} at ${p.location}. Work must stop until the permit is renewed.`)
      }
    }
  }
}
