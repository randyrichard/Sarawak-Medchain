import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, Plus, Copy, Check, ShieldCheck } from 'lucide-react'
import {
  platformApi,
  type PlatformCompany, type ProvisionResult,
} from '@/api/platformApi'
import { ApiError, type PlanEntitlements } from '@/api/types'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Input, Skeleton,
} from '@/components/ui'
import { PageHeader } from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { TIMEZONES } from '@/api/reportsApi'
import {
  companyStatusBadge, formatMyr, monthlyRecurring, previewCompanyId, provisionOutcome,
  subscriptionBadge,
} from './lib'
import { usePlatformInfo } from './usePlatformAdmin'

/**
 * The SafeChain platform console.
 *
 * Where a customer is created. Deliberately plain: this is an internal tool used a handful
 * of times a month by somebody who already knows what they are doing, so it optimises for
 * being unambiguous about what is about to happen rather than for looking impressive.
 *
 * Nothing here is tenant-scoped — it sits above every customer — which is exactly why the
 * server re-checks the platform flag against the database on every call rather than
 * trusting anything this page sends.
 */
const EMPTY = {
  companyName: '', industry: '', plan: '', adminName: '', adminEmail: '',
  siteName: '', siteCity: '', siteTimezone: 'Asia/Kuching',
}

/** A plan's enforced limits, as a line an operator can read out over the phone. */
function planLimits(e: PlanEntitlements): string {
  const sites = e.maxSites === null ? 'Unlimited sites' : `Up to ${e.maxSites} active sites`
  return `${sites} · API keys and webhooks ${e.integrations ? 'included' : 'not included'}`
}

export function PlatformPage() {
  const [companies, setCompanies] = useState<PlatformCompany[] | null>(null)
  // Shared with the sidebar and the route guard - one answer per navigation, not three.
  const { plans } = usePlatformInfo()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(EMPTY)
  const [result, setResult] = useState<ProvisionResult | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setCompanies(null)
    platformApi.listCompanies()
      .then(setCompanies)
      .catch((e) => {
        setCompanies([])
        setError(e instanceof ApiError ? e.message : 'Could not load the customer list.')
      })
  }, [])

  useEffect(load, [load])

  const openNew = () => {
    setDraft({ ...EMPTY, plan: plans[0]?.key ?? '' })
    setResult(null)
    setOpen(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return // a double-click must not reach the server twice
    setSaving(true)
    setError(null)
    try {
      const r = await platformApi.provisionCompany({
        companyName: draft.companyName,
        plan: draft.plan,
        industry: draft.industry || undefined,
        adminName: draft.adminName,
        adminEmail: draft.adminEmail,
        siteName: draft.siteName,
        siteCity: draft.siteCity || undefined,
        siteTimezone: draft.siteTimezone || undefined,
      })
      setResult(r)
      setOpen(false)
      setDraft(EMPTY)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create that customer.')
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    if (!result?.invitationUrl) return
    try {
      await navigator.clipboard.writeText(result.invitationUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Could not copy — select the link and copy it manually.')
    }
  }

  const money = companies ? monthlyRecurring(companies) : null
  const outcome = result ? provisionOutcome(result) : null
  const idPreview = previewCompanyId(draft.companyName)
  const selectedPlan = plans.find((p) => p.key === draft.plan)
  const ready = draft.companyName.trim() && draft.adminName.trim()
    && draft.adminEmail.trim() && draft.siteName.trim() && draft.plan

  return (
    <>
      <PageHeader
        title="SafeChain customers"
        subtitle="Every company on this deployment, and where new ones are created"
        right={(
          <Button icon={<Plus size={15} />} onClick={openNew} disabled={plans.length === 0}>
            New customer
          </Button>
        )}
      />

      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      {/* Shown once, after provisioning. The link only appears when nothing was emailed. */}
      {result && outcome && (
        <Alert
          tone={outcome.tone === 'critical' ? 'critical' : outcome.tone === 'warning' ? 'warning' : 'success'}
          className="mb-3"
          onDismiss={() => setResult(null)}
          title={outcome.headline}
        >
          <div className="space-y-1.5">
            <p>{outcome.detail}</p>
            <p className="text-2xs">
              {result.planLabel} · {result.monthlyPrice}/month · workspace{' '}
              <code className="font-mono">{result.companyId}</code> · first site{' '}
              {result.siteName}
            </p>
            {outcome.showLink && result.invitationUrl && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <code className="min-w-0 flex-1 truncate rounded bg-[var(--surface-2)] px-2 py-1 font-mono text-2xs">
                  {result.invitationUrl}
                </code>
                <Button
                  size="sm" variant="secondary"
                  icon={copied ? <Check size={12} /> : <Copy size={12} />}
                  onClick={copy}
                >
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              </div>
            )}
          </div>
        </Alert>
      )}

      {/* Only what is actually being paid. Counting trials here would be a forecast. */}
      {money && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Customers', String(companies?.length ?? 0)],
            ['Paying', String(money.paying)],
            ['On trial', String(money.trial)],
            ['Monthly recurring', formatMyr(money.mrrMyr)],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardBody className="py-3">
                <p className="text-2xs font-medium text-muted">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Customers" subtitle="Newest first" />
        <CardBody>
          {companies === null && (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          )}

          {companies?.length === 0 && (
            <EmptyState icon={Building2} title="No customers yet.">
              Create the first one. It gets a workspace, one site, and an administrator who
              receives an invitation to set their own password.
            </EmptyState>
          )}

          {companies && companies.length > 0 && (
            <div className="relative overflow-x-auto">
              <ul className="divide-y divide-line">
                {companies.map((c) => {
                  const status = companyStatusBadge(c.status)
                  const sub = subscriptionBadge(c.subscriptionStatus)
                  return (
                    <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink">{c.name}</span>
                          <span className="font-mono text-2xs text-muted">{c.id}</span>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <Badge tone={sub.tone}>{sub.label}</Badge>
                        </p>
                        <p className="mt-0.5 text-2xs text-muted">
                          {c.planLabel} · {c.monthlyPrice}/month · {c.users} user(s) ·{' '}
                          {c.sites} site(s)
                          {c.industry && <> · {c.industry}</>}
                        </p>
                        <p className="text-2xs text-muted">
                          {c.provisionedAt
                            ? <>Provisioned {fmtDateTime(c.provisionedAt)}{c.provisionedBy && <> by {c.provisionedBy}</>}</>
                            : 'Created before the provisioning console existed'}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New customer"
        description="Creates a workspace, one site and an administrator who is invited to set their own password."
        width="max-w-xl"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !ready}>
              {saving ? 'Creating…' : 'Create customer'}
            </Button>
          </div>
        )}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-3">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted">Company</p>
            <Input
              label="Company name" required value={draft.companyName}
              onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
              placeholder="Borneo Industrial Group Sdn Bhd"
              hint={idPreview ? `Workspace id will be "${idPreview}"` : undefined}
            />
            <Input
              label="Industry" value={draft.industry}
              onChange={(e) => setDraft({ ...draft, industry: e.target.value })}
              placeholder="Oil and gas"
            />
            <label className="block space-y-1.5">
              <span className="block text-xs font-semibold text-ink-2">Plan</span>
              <select
                value={draft.plan}
                onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
                className="h-9 coarse:h-11 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink"
              >
                {plans.map((p) => (
                  <option key={p.key} value={p.key}>{p.label} — {p.monthlyPrice}/month</option>
                ))}
              </select>
              {/* What the customer is buying, so the operator picks by scope not by name. */}
              {selectedPlan && <span className="block text-2xs text-muted">{selectedPlan.summary}</span>}
              {/*
                The same thing again as the two facts the product actually enforces. The
                summary sells; this is what the API will and will not allow, and it is the
                half an operator needs when the customer asks what the difference is.
              */}
              {selectedPlan && (
                <span className="block text-2xs font-semibold text-ink-2">
                  {planLimits(selectedPlan.entitlements)}
                </span>
              )}
            </label>
          </div>

          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted">
              First administrator
            </p>
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input
                label="Full name" required value={draft.adminName}
                onChange={(e) => setDraft({ ...draft, adminName: e.target.value })}
              />
              <Input
                label="Email" required type="email" value={draft.adminEmail}
                onChange={(e) => setDraft({ ...draft, adminEmail: e.target.value })}
                placeholder="hse.manager@customer.com"
              />
            </div>
            <p className="text-2xs text-muted">
              They receive an invitation and choose their own password. Nobody at SafeChain
              ever holds a working credential for their workspace.
            </p>
          </div>

          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-2xs font-bold uppercase tracking-wider text-muted">First site</p>
            <div className="grid gap-x-3 gap-y-5 sm:grid-cols-2">
              <Input
                label="Site name" required value={draft.siteName}
                onChange={(e) => setDraft({ ...draft, siteName: e.target.value })}
                placeholder="Bintulu Plant"
              />
              <Input
                label="City" value={draft.siteCity}
                onChange={(e) => setDraft({ ...draft, siteCity: e.target.value })}
              />
            </div>
            <label className="block space-y-1.5">
              <span className="block text-xs font-semibold text-ink-2">Timezone</span>
              <select
                value={draft.siteTimezone}
                onChange={(e) => setDraft({ ...draft, siteTimezone: e.target.value })}
                className="h-9 coarse:h-11 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink"
              >
                {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <p className="text-2xs text-muted">
              They add the rest of their sites and departments themselves, in Administration.
            </p>
          </div>
        </form>
      </Dialog>
    </>
  )
}

/** Shown in place of the console to anybody who is not platform staff. */
export function PlatformForbidden() {
  return (
    <EmptyState icon={ShieldCheck} title="This area is for SafeChain staff.">
      Managing customers across the whole deployment is separate from administering your own
      workspace. If you are looking for your company&rsquo;s users, sites or departments,
      they are under Administration.
    </EmptyState>
  )
}
