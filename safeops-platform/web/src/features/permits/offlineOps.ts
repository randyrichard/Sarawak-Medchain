/*
 * Which parts of a permit to work may be recorded with no signal, and which may not.
 *
 * This is a safety decision before it is a technical one, and it is the whole reason this
 * file exists rather than the queue simply accepting every permit write.
 *
 * The rule: a permit's *authority* is granted online. What happens *under* an authority
 * already granted is recorded wherever the work is, signal or not.
 *
 * Why that line and not "queue everything". An approval is somebody saying the work may
 * start. Granted on a phone with no signal, the device cannot see that the area authority
 * suspended the permit twenty minutes ago, that a simultaneous operation was raised on the
 * next flange, or that the gas tester's certificate lapsed this morning. The crew would
 * enter a confined space on an authority the plant has already withdrawn, and the system
 * would tell them it was fine. That is the exact failure permits exist to prevent, and it is
 * why permits were taken out of localStorage in the first place (SERVER_PERMITS in
 * src/api/client.ts): a permit board that disagrees with the plant is worse than no board.
 *
 * Whereas a gas reading, a toolbox talk, a man entering a vessel, a tag going on a valve —
 * those already happened. The server learning about them four hours late is a reporting
 * delay. Refusing to record them is how a site ends up reconstructing a confined-space
 * entry log from memory at the end of the shift, which is both a worse record and the thing
 * the paper system did.
 *
 * And stopping work is always allowed offline. Suspension is restrictive: accepting it late
 * can only ever close work down, never open it up. A supervisor who sees something wrong
 * must never be told to find signal first.
 */
import { permitsApi } from '@/api/permitsApi'
import { permitPeopleApi } from '@/api/permitPeopleApi'
import { permitWorkflowApi } from '@/api/permitWorkflowApi'
import { ApiError } from '@/api/types'
import type { AttachmentKind } from '@/api/permitWorkflowApi'
import type { GasTest, IsolationPoint } from '@/api/permits'
import { enqueue, read, remove, type OutboxStore, type QueuedOp } from '@/lib/fieldOutbox/queue'
import { forgetJsaId, isLocalJsaId, rememberJsaId, resolveJsaId } from './localJsaIds'

/** Everything the field can record against a permit without a connection. */
export type PermitOp =
  | { kind: 'gas-test'; permitId: string; permitCode: string; reading: Omit<GasTest, 'id' | 'testedAt' | 'testedBy' | 'pass'> }
  | { kind: 'control-confirm'; permitId: string; permitCode: string; controlId: string; label: string; confirmed: boolean }
  | { kind: 'toolbox'; permitId: string; permitCode: string; supervisor?: string }
  | { kind: 'toolbox-ack'; permitId: string; permitCode: string; attendeeId: string; person: string }
  | { kind: 'ppe-ack'; permitId: string; permitCode: string }
  /**
   * A hazard found at the job and written down there.
   *
   * `clientId` is the name the device gave the row so it can be amended before the server
   * has ever seen it; the server keeps that name beside the id it generates, which is what
   * makes a replay exact and what lets the amendments queued behind this find their row.
   */
  | {
      kind: 'jsa-add'; permitId: string; permitCode: string; clientId: string
      step: { step?: string; hazard: string; control: string }
    }
  | { kind: 'jsa-update'; permitId: string; permitCode: string; stepId: string; patch: { step?: string; hazard?: string; control?: string } }
  | { kind: 'person-entry'; permitId: string; permitCode: string; attendeeId: string; person: string; inside: boolean }
  | { kind: 'isolation-add'; permitId: string; permitCode: string; input: Pick<IsolationPoint, 'description' | 'tagId'> }
  | { kind: 'isolation-release'; permitId: string; permitCode: string; isolationId: string; tagId: string }
  | { kind: 'suspend'; permitId: string; permitCode: string; reason: string }
  | { kind: 'close'; permitId: string; permitCode: string; handbackConfirmed: boolean; statement: string }
  | { kind: 'attachment'; permitId: string; permitCode: string; attachmentKind: AttachmentKind }

export type PermitOpKind = PermitOp['kind']

/**
 * The kinds this feature's queue owns.
 *
 * One outbox store holds everything a user recorded in the field, including their incident
 * reports, and a drain must never be handed a record it has no sender for: `sendPermitOp`
 * has no case for an incident report, so it would return without sending, nothing would be
 * thrown, and the drain would take the report as delivered and delete it. The permit queue
 * therefore reads only these (`queueFor` in lib/fieldOutbox/store.ts).
 *
 * Written as a record of every kind rather than a list, so adding a `PermitOp` without
 * adding it here does not compile. A kind missing from this is a kind that never sends.
 */
const OWNED: Record<PermitOpKind, true> = {
  'gas-test': true,
  'control-confirm': true,
  toolbox: true,
  'toolbox-ack': true,
  'ppe-ack': true,
  'jsa-add': true,
  'jsa-update': true,
  'person-entry': true,
  'isolation-add': true,
  'isolation-release': true,
  suspend: true,
  close: true,
  attachment: true,
}

export const PERMIT_OP_KINDS = Object.keys(OWNED) as PermitOpKind[]

/**
 * Operations that need a connection, and what to say instead of queueing them.
 *
 * Each message says what the person can do now, because "you are offline" on its own leaves
 * a supervisor holding a permit with no next step. The wording avoids implying the request
 * was kept: none of these is queued, and a message that reads like a receipt would be the
 * worst possible outcome here — somebody believing a permit was approved.
 */
export const ONLINE_ONLY: Record<string, string> = {
  submit: 'A permit can only be sent for review where there is a connection, so the reviewers see it. Nothing has been sent.',
  approve: 'A permit cannot be approved offline. This device cannot see whether the permit has been suspended, or whether another job has been raised on the same equipment, and an approval given without those checks is not an approval. Approve it once there is a connection.',
  reject: 'A permit cannot be rejected offline — the applicant would not be told. Nothing has been sent.',
  activate: 'Work cannot be started offline. Starting means checking the permit is still live, and this device cannot see a suspension made in the last few minutes. Get a connection before the crew enters.',
  resume: 'A suspended permit cannot be resumed offline: resuming re-opens work, and whoever suspended it may know something this device does not. Resume it where there is a connection.',
  'review-advance': 'The review chain needs a connection so the next reviewer is notified. Nothing has been sent.',
  'review-return': 'Returning a permit needs a connection so the applicant is told. Nothing has been sent.',
  'extension-request': 'An extension cannot be requested offline. Queuing one would leave the impression the permit is valid for longer than it is — it is not, and it still lapses at the time on the permit.',
  'extension-approve': 'An extension cannot be approved offline, for the same reason an approval cannot.',
}

/** Can this be recorded with no connection? */
export const isOfflineSafe = (kind: string): kind is PermitOpKind => !(kind in ONLINE_ONLY)

/** Why not, in words a supervisor can act on. Empty for anything offline-safe. */
export const refusalFor = (kind: string) => ONLINE_ONLY[kind] ?? ''

/**
 * What the record says in the list of things waiting to sync.
 *
 * Named by permit and by what was done, not by endpoint. Somebody looking at four pending
 * records at the end of a shift has to recognise their own work in them.
 */
export function labelFor(op: PermitOp): string {
  switch (op.kind) {
    case 'gas-test': return `${op.permitCode}: gas test`
    case 'control-confirm': return `${op.permitCode}: ${op.confirmed ? 'confirmed' : 'unconfirmed'} "${op.label}"`
    case 'toolbox': return `${op.permitCode}: toolbox talk held`
    case 'toolbox-ack': return `${op.permitCode}: ${op.person} acknowledged the toolbox talk`
    case 'ppe-ack': return `${op.permitCode}: PPE acknowledged`
    case 'jsa-add': return `${op.permitCode}: JSA step — ${op.step.hazard}`
    case 'jsa-update': return `${op.permitCode}: JSA step amended`
    case 'person-entry': return `${op.permitCode}: ${op.person} ${op.inside ? 'entered' : 'left'} the work area`
    case 'isolation-add': return `${op.permitCode}: isolation ${op.input.tagId} applied`
    case 'isolation-release': return `${op.permitCode}: isolation ${op.tagId} released`
    case 'suspend': return `${op.permitCode}: WORK SUSPENDED — ${op.reason}`
    case 'close': return `${op.permitCode}: permit closed and handed back`
    case 'attachment': return `${op.permitCode}: photo or document`
  }
}

/**
 * Records a permit operation for sending later.
 *
 * `recordedAt` is stamped here, at the moment the field did the thing, and travels with the
 * payload. This matters more than it looks: a confined-space gas test is valid for a fixed
 * interval, and one taken at 09:15 that reached the server at 14:00 would otherwise be
 * filed as a 14:00 test. The compliance record would then show a re-test that never
 * happened, and the gap when the space was unmonitored would disappear. The server
 * validates the time rather than trusting it (see permitService.recordedAt handling).
 */
export function queuePermitOp(
  userId: string,
  op: PermitOp,
  files?: { name: string; type: string; blob: Blob }[],
  store?: OutboxStore,
) {
  return enqueue({
    userId,
    kind: op.kind,
    label: labelFor(op),
    payload: { ...op, recordedAt: new Date().toISOString() },
    files,
  }, store)
}

/**
 * Takes back a JSA row that was added in the field and has not reached the server.
 *
 * The one undo the field has. A row added at the job and then thought better of — the
 * hazard turns out to be the one already on line four, or it was added to the wrong permit
 * — can simply be dropped while it is still only on the device, which is what a crew
 * striking a line out on paper does.
 *
 * The amendments made to it go with it. Left behind they would be addressed by a name no
 * add will ever give the server a row for, and the queue would put them in front of
 * somebody as records that failed to send — which they did not; they were withdrawn.
 *
 * Only for a row that is still local. Once the add has landed the row is on a signed
 * analysis, and removing it is a deletion with a timeline entry, not an undo.
 */
export async function discardLocalJsaRow(
  userId: string, localId: string, store?: OutboxStore,
): Promise<void> {
  if (!isLocalJsaId(localId)) return
  for (const queued of await read(userId, store)) {
    const op = queued.payload as PermitOp
    const belongsToRow = (op.kind === 'jsa-add' && op.clientId === localId)
      || (op.kind === 'jsa-update' && op.stepId === localId)
    if (belongsToRow) await remove(queued.clientRef, store)
  }
  forgetJsaId(localId)
}

/**
 * Replays one queued record against the API.
 *
 * The clientRef goes with every call, which is what lets the server recognise a replay
 * rather than filing a second gas test. Without it, a phone that regains signal with the
 * app open in two tabs doubles every record it is holding.
 */
export async function sendPermitOp(queued: QueuedOp): Promise<unknown> {
  const op = queued.payload as PermitOp & { recordedAt?: string }
  const meta = { clientRef: queued.clientRef, recordedAt: op.recordedAt }

  switch (op.kind) {
    case 'gas-test':
      return permitsApi.addGasTest(op.permitId, op.reading, meta)
    case 'control-confirm':
      return permitsApi.confirmControl(op.permitId, op.controlId, op.confirmed, meta)
    case 'toolbox':
      return permitWorkflowApi.recordToolbox(op.permitId, { supervisor: op.supervisor }, meta)
    case 'toolbox-ack':
      return permitWorkflowApi.acknowledgeToolbox(op.attendeeId, meta)
    case 'ppe-ack':
      return permitWorkflowApi.acknowledgePpe(op.permitId, meta)
    case 'jsa-add':
      return sendJsaAdd(op, meta)
    case 'jsa-update':
      return permitWorkflowApi.updateJsa(jsaTarget(op.stepId), op.patch, meta)
    case 'person-entry':
      return permitPeopleApi.setInside(op.attendeeId, op.inside, meta)
    case 'isolation-add':
      return permitsApi.addIsolation(op.permitId, op.input, meta)
    case 'isolation-release':
      return permitsApi.releaseIsolation(op.permitId, op.isolationId, meta)
    case 'suspend':
      return permitsApi.suspend(op.permitId, op.reason, meta)
    case 'close':
      return permitsApi.close(
        op.permitId, { handbackConfirmed: op.handbackConfirmed, statement: op.statement }, meta,
      )
    case 'attachment':
      return sendAttachment(queued, op)
    default:
      /*
       * A kind this dispatch has no case for, which can only mean the queue handed over a
       * record belonging to something else (`PERMIT_OP_KINDS` is what stops that) or a
       * `PermitOp` was added without a sender.
       *
       * Thrown rather than returned, and this is the whole point: returning would look like
       * a successful send, and the drain would delete a record nobody ever received. Loud
       * and kept beats quiet and gone.
       */
      throw new ApiError('request_failed', `Nothing knows how to send a "${(op as PermitOp).kind}" record.`)
  }
}

/**
 * Sends a row invented in the field, and records what the server called it.
 *
 * The translation is written before anything else looks at the queue, because the
 * amendments made to this row while it was still only on the phone are sitting directly
 * behind it addressed by the local name. The drain is sequential and oldest-first, so the
 * add is always sent first — that ordering is what makes this tractable at all.
 *
 * A replay is answered with the row the first copy created, so a second attempt records the
 * same translation rather than a second row.
 */
async function sendJsaAdd(
  op: Extract<PermitOp, { kind: 'jsa-add' }>,
  meta: { clientRef: string; recordedAt?: string },
) {
  const created = await permitWorkflowApi.addJsa(
    op.permitId, { ...op.step, clientId: op.clientId }, meta,
  )
  rememberJsaId(op.clientId, created.id)
  return created
}

/**
 * The id to send an amendment under.
 *
 * An amendment to a row born on the device is addressed by the name the device gave it, and
 * has to become the server's id before it is sent. If there is no translation the add has
 * not landed — which the sequential drain makes almost impossible, since it stops at the
 * first transport failure and never reaches this. Almost: an add the server *refused*
 * — a permit closed while the crew was out of signal — is marked blocked and skipped,
 * and the queue behind it gets its turn.
 *
 * Refused here rather than sent, because sending a local name would have the server answer
 * "JSA step not found" — which reads as a bug rather than as what it is. And refused in a
 * way the queue will not retry: no amount of signal produces a row the server declined to
 * create, and retrying on a timer would hide a correction to a control that nobody is ever
 * going to see land.
 */
function jsaTarget(stepId: string): string {
  const target = resolveJsaId(stepId)
  if (isLocalJsaId(target)) {
    throw new ApiError(
      'validation',
      'This amendment belongs to a JSA row that was never accepted by the server. '
      + 'Add the hazard to the analysis again.',
    )
  }
  return target
}

/**
 * Uploads the bytes a phone kept while it had no signal.
 *
 * The upload path is XHR (it reports progress, which fetch still cannot), and its failures
 * arrive as a plain Error with no code. The queue decides between "retry on a timer" and
 * "show a person" from that code, and an uncoded error counts as a refusal — so an upload
 * that failed because the site has no signal would be marked as rejected by the server and
 * never tried again. Re-coding it here is what keeps a photograph in the queue.
 */
async function sendAttachment(
  queued: QueuedOp,
  op: Extract<PermitOp, { kind: 'attachment' }>,
): Promise<unknown> {
  const files = (queued.files ?? []).map((f) => new File([f.blob], f.name, { type: f.type }))
  if (files.length === 0) return undefined
  try {
    return await permitWorkflowApi.upload(op.permitId, files, op.attachmentKind, undefined, {
      clientRef: queued.clientRef,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed.'
    if (e instanceof ApiError) throw e
    // XHR cannot distinguish a dead network from a blocked request, and neither can we;
    // treating it as transport is the answer that keeps the evidence rather than losing it.
    throw new ApiError('network', message)
  }
}
