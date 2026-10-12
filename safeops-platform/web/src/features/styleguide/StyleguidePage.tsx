import { useRef, useState } from 'react'
import { Inbox, Plus, Save, Trash2 } from 'lucide-react'
import {
  Alert, AsyncContent, Avatar, FORM_SPACING, Badge, Button, Card, CardBody, CardHeader, Checkbox, DataTable, Dialog,
  Dropdown, DropdownItem, DropdownLabel, DropdownSeparator, EmptyState, ErrorState, Input, Loading,
  PageHeader, Select, Skeleton, SkeletonRows, SkeletonText, StatusPill, Tabs, Textarea,
  type Column, type TabItem,
} from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { MiniBars, ScoreRing, Sparkline } from '@/components/charts/Sparkline'

// Living documentation: every primitive, rendered from the same components the
// app uses. If it looks wrong here, it is wrong everywhere — fix the primitive.

export function StyleguidePage() {
  return (
    <>
      <PageHeader
        title="Design System"
        subtitle="One design language. Components consume tokens; pages consume components; nobody hardcodes hex."
        right={<Badge tone="accent">v1</Badge>}
      />
      <div className="space-y-4">
        <TokensSection />
        <TypographySection />
        <div className="grid gap-4 xl:grid-cols-2">
          <ButtonsSection />
          <BadgesSection />
        </div>
        <AlertsSection />
        <div className="grid gap-4 xl:grid-cols-2">
          <FormsSection />
          <OverlaysSection />
        </div>
        <TableSection />
        <div className="grid gap-4 xl:grid-cols-2">
          <LoadingSection />
          <ChartsSection />
        </div>
      </div>
    </>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody>{children}</CardBody>
    </Card>
  )
}

function TokensSection() {
  const surfaces = ['--page', '--surface', '--raised', '--sunken']
  const inks = ['--ink', '--ink-2', '--muted']
  const status = ['--good', '--warning', '--serious', '--critical']
  const series = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8']
  const Sw = ({ token }: { token: string }) => (
    <div className="flex flex-col items-center gap-1">
      <span className="h-9 w-9 rounded-lg border" style={{ background: `var(${token})` }} />
      <code className="text-2xs text-muted">{token}</code>
    </div>
  )
  return (
    <Section title="Color Tokens" subtitle="Both themes are selected palettes — toggle dark mode in the topbar and everything below re-resolves.">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Surfaces</p>
          <div className="flex gap-3">{surfaces.map((t) => <Sw key={t} token={t} />)}</div>
        </div>
        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Ink</p>
          <div className="flex gap-3">{inks.map((t) => <Sw key={t} token={t} />)}</div>
        </div>
        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Status (reserved)</p>
          <div className="flex gap-3">{status.map((t) => <Sw key={t} token={t} />)}</div>
        </div>
        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Series (charts only)</p>
          <div className="flex flex-wrap gap-3">{series.map((t) => <Sw key={t} token={t} />)}</div>
        </div>
      </div>
    </Section>
  )
}

function TypographySection() {
  return (
    <Section title="Typography & Spacing" subtitle="Eight sizes, one family. Spacing rides Tailwind's 4px grid — components use gap, never ad-hoc margins.">
      <div className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight text-ink">Display 28 — page titles</p>
        <p className="text-2xl font-semibold tracking-tight text-ink">Title 22 — section headers</p>
        <p className="text-lg font-semibold text-ink">Heading 16 — card titles</p>
        <p className="text-base text-ink">Body 14 — default reading size for the entire app</p>
        <p className="text-sm text-ink-2">Secondary 13 — supporting copy, table cells</p>
        <p className="text-xs text-muted">Caption 12 — timestamps, hints, footnotes</p>
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">Overline 11 — group labels</p>
        <p className="font-mono text-sm text-ink">Mono 13 — IDs like INC-2607, CA-440 <span className="text-muted">(tabular-nums for columns)</span></p>
      </div>
    </Section>
  )
}

function ButtonsSection() {
  const [busy, setBusy] = useState(false)
  return (
    <Section title="Buttons" subtitle="Four variants × three sizes. One primary action per view.">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Plus size={15} />}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={<Trash2 size={14} />}>Danger</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button
            loading={busy}
            icon={<Save size={14} />}
            onClick={() => {
              setBusy(true)
              setTimeout(() => setBusy(false), 1500)
            }}
          >
            {busy ? 'Saving…' : 'Click for Loading'}
          </Button>
        </div>
      </div>
    </Section>
  )
}

function BadgesSection() {
  return (
    <Section title="Badges & Status" subtitle="Status is never color alone — pills always carry an icon + label.">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="good">Good</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="critical">Critical</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill kind="good" label="Healthy" />
          <StatusPill kind="warning" label="Watch" />
          <StatusPill kind="serious" label="At Risk" />
          <StatusPill kind="critical" label="Intervene" />
          <StatusPill kind="info" label="In Review" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Avatar name="Marcus Tan" /> <Avatar name="Faridah Abdullah" /> <Avatar name="Amirul Hassan" size={24} />
          <span className="text-xs text-muted">Avatars: deterministic color per name</span>
        </div>
      </div>
    </Section>
  )
}

function AlertsSection() {
  const [dismissed, setDismissed] = useState(false)
  return (
    <Section title="Alerts" subtitle="Explain what happened and what to do next — never apologize vaguely.">
      <div className="grid gap-3 xl:grid-cols-2">
        <Alert tone="info" title="Scheduled maintenance">Reports sync pauses Sunday 02:00–02:30 MYT. Queued reports send automatically afterwards.</Alert>
        <Alert tone="success" title="Password updated">Use your new password the next time you sign in.</Alert>
        <Alert tone="warning" title="Session expiring in 5 minutes">Save your work, then sign in again to continue.</Alert>
        {!dismissed && (
          <Alert tone="critical" title="Couldn't save your changes" onDismiss={() => setDismissed(true)}>
            The server didn't respond. Your edits are kept locally — retry from the banner above the form.
          </Alert>
        )}
      </div>
    </Section>
  )
}

function FormsSection() {
  const [val, setVal] = useState('')
  return (
    <Section title="Forms & Inputs" subtitle="36px controls, accent focus, errors replace hints in place. Label to field 6px, field to field 20px: each label is clearly closer to its own control (law of proximity).">
      <div className={FORM_SPACING.stack}>
        <Input label="Site name" placeholder="e.g. Bintulu LNG Terminal" hint="Shown in switchers and reports." required />
        <Input
          label="Work email" type="email" value={val} onChange={(e) => setVal(e.target.value)}
          error={val && !val.includes('@') ? 'Enter a valid email address, like name@company.com.' : undefined}
          placeholder="you@company.com"
        />
        <Select label="Industry" defaultValue="og">
          <option value="mfg">Manufacturing</option>
          <option value="og">Oil & Gas</option>
          <option value="con">Construction</option>
          <option value="log">Logistics</option>
          <option value="pln">Plantation</option>
        </Select>
        <Textarea label="Description" placeholder="What happened, in your own words…" hint="Plain language is fine — classification comes later." />
        <div className="flex gap-5">
          <Checkbox label="Email me a copy" defaultChecked />
          <Checkbox label="Mark as anonymous" />
        </div>
      </div>
    </Section>
  )
}

function OverlaysSection() {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [tab, setTab] = useState<'account' | 'security' | 'danger'>('account')
  return (
    <Section title="Dialogs, Dropdowns & Tabs" subtitle="Dialogs trap focus and close on Esc; dropdowns close on outside click.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setOpen(true)}>Open Dialog</Button>
          <Dropdown
            trigger={(o) => <Button variant="secondary">{o ? 'Close Menu' : 'Open Dropdown'}</Button>}
            align="start"
          >
            <DropdownLabel>Example Menu</DropdownLabel>
            <DropdownItem icon={<Plus size={14} />}>New Item</DropdownItem>
            <DropdownItem icon={<Save size={14} />}>Save View</DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger icon={<Trash2 size={14} />}>Delete</DropdownItem>
          </Dropdown>
          {confirmed && <Badge tone="good">Dialog Confirmed ✓</Badge>}
        </div>
        <Tabs
          items={[
            { value: 'account', label: 'Account' },
            { value: 'security', label: 'Security', badge: <Badge tone="critical">2</Badge> },
            { value: 'danger', label: 'Danger zone' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <p className="text-sm text-ink-2">
          {tab === 'account' && 'Profile, memberships and language preferences live here.'}
          {tab === 'security' && 'Two flagged items: password age and missing 2FA.'}
          {tab === 'danger' && 'Destructive actions are always separated, always confirmed.'}
        </p>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Close incident INC-2607?"
        description="This is a demo of the confirmation pattern."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setConfirmed(true)
                setOpen(false)
              }}
            >
              Confirm Close
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Closing requires every linked corrective action to be verified. This rule is enforced by the
          server in the real workflow — the button here just demonstrates the dialog.
        </p>
      </Dialog>
    </Section>
  )
}

interface DemoRow {
  id: string
  site: string
  status: 'Healthy' | 'Watch' | 'Intervene'
  score: number
  trend: number[]
}

const DEMO_ROWS: DemoRow[] = [
  { id: 'r1', site: 'Kuching Assembly Plant', status: 'Healthy', score: 94, trend: [88, 90, 91, 92, 93, 94] },
  { id: 'r2', site: 'Sibu Logistics Hub', status: 'Healthy', score: 88, trend: [82, 84, 85, 86, 87, 88] },
  { id: 'r3', site: 'Tawau Plantation Estate', status: 'Watch', score: 79, trend: [74, 76, 75, 77, 78, 79] },
  { id: 'r4', site: 'Bintulu LNG Terminal', status: 'Intervene', score: 71, trend: [84, 81, 78, 75, 73, 71] },
]

type TableState = 'data' | 'loading' | 'empty' | 'error'
const TABLE_STATES: TabItem<TableState>[] = [
  { value: 'data', label: 'Data' },
  { value: 'loading', label: 'Loading' },
  { value: 'empty', label: 'Empty' },
  { value: 'error', label: 'Error' },
]

function TableSection() {
  const [state, setState] = useState<TableState>('data')
  const columns: Column<DemoRow>[] = [
    { key: 'site', header: 'Site', render: (r) => <span className="text-sm font-medium text-ink">{r.site}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <StatusPill kind={r.status === 'Healthy' ? 'good' : r.status === 'Watch' ? 'warning' : 'critical'} label={r.status} />
      ),
    },
    {
      key: 'score', header: 'Score', align: 'right',
      render: (r) => <span className="text-sm font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.score}</span>,
    },
    { key: 'trend', header: 'Trend', align: 'right', visibility: 'hidden md:table-cell', render: (r) => <Sparkline data={r.trend} width={80} height={22} stroke={r.status === 'Intervene' ? 'var(--critical)' : 'var(--s1)'} /> },
  ]
  return (
    <Section title="Data Table" subtitle="Declarative columns, responsive visibility, and every state a request can be in - switch them below.">
      <Tabs label="Table state" items={TABLE_STATES} value={state} onChange={setState} className="mb-3" />
      <div className="rounded-lg border">
        <DataTable
          caption="Site safety scores"
          columns={columns}
          rows={state === 'data' ? DEMO_ROWS : []}
          rowKey={(r) => r.id}
          loading={state === 'loading'}
          error={state === 'error' ? new Error('The server did not answer in time.') : undefined}
          onRetry={() => setState('data')}
          empty={<EmptyState icon={Inbox} title="No sites yet">Add a site to start tracking its score.</EmptyState>}
        />
      </div>
    </Section>
  )
}

function LoadingSection() {
  return (
    <Section title="Loading & Empty States" subtitle="Skeletons mirror the final layout; empty states teach the next step.">
      <div className="space-y-5">
        <SkeletonText lines={3} />
        <SkeletonRows rows={2} />
        <div className="flex gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-16 flex-1 rounded-xl" />
        </div>
        <Loading label="Loading reports…"><SkeletonRows rows={1} /></Loading>
        <div className="rounded-lg border">
          <ErrorState title="Couldn't load reports" error={new Error('Check your connection and try again.')} onRetry={() => {}} />
        </div>
        <AsyncDemo />
        <div className="rounded-lg border">
          <EmptyState
            icon={Inbox}
            title="No reports yet"
            action={<Button size="sm" icon={<Plus size={14} />}>Report a Hazard</Button>}
          >
            Print the QR poster for each location and workers can file their first report in under a minute.
          </EmptyState>
        </div>
      </div>
    </Section>
  )
}

/**
 * `useAsync` + `AsyncContent`, end to end: a request that takes a moment and fails every
 * other time, so the loading, error-with-retry and loaded states can all be seen.
 */
function AsyncDemo() {
  const calls = useRef(0)
  const reports = useAsync(
    () => new Promise<string[]>((resolve, reject) => {
      const fail = calls.current++ % 2 === 1
      setTimeout(() => (fail
        ? reject(new Error('The server did not answer in time.'))
        : resolve(['Hazard: loose grating, Bay 4', 'Near miss: forklift reversing'])), 900)
    }),
    [],
  )
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-ink-2">useAsync + AsyncContent</p>
        <Button size="sm" variant="secondary" onClick={reports.reload}>Fetch Again</Button>
      </div>
      <AsyncContent
        state={reports}
        loadingLabel="Loading recent reports…"
        errorTitle="Couldn't load recent reports"
        isEmpty={(r) => r.length === 0}
        empty={<EmptyState title="No reports yet" />}
      >
        {(rows) => <ul className="space-y-1 text-sm text-ink-2">{rows.map((r) => <li key={r}>{r}</li>)}</ul>}
      </AsyncContent>
    </div>
  )
}

function ChartsSection() {
  return (
    <Section title="Chart Primitives" subtitle="Series tokens only; 2px lines; endpoint emphasis. Full chart layer ships with Analytics.">
      <div className="flex flex-wrap items-end gap-8">
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Sparkline</p>
          <Sparkline data={[3, 5, 4, 7, 6, 9, 8, 11]} width={140} height={36} />
        </div>
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Mini bars</p>
          <MiniBars data={[4, 7, 5, 9, 6, 10, 8, 12]} width={140} height={36} fill="var(--s2)" />
        </div>
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Score ring</p>
          <ScoreRing value={84} size={96} label="Safety Score" />
        </div>
        <div>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Empty ring</p>
          <ScoreRing value={null} size={96} label="No data yet" />
        </div>
      </div>
    </Section>
  )
}
