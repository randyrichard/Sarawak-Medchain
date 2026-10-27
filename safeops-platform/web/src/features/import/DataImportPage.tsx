import { useEffect, useMemo, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import {
  importApi, readCsvFile, templateCsv,
  type ImportCatalog, type ImportKind, type ImportPlan, type ImportRow, type RowAction,
} from '@/api/importApi'
import { isBackendConfigured } from '@/api/authApi'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorAlert, NotInDemo, PageHeader, Select,
  Skeleton, Tabs, type Column,
} from '@/components/ui'
import { useOrg } from '@/features/org/OrgContext'
import { saveBlob } from '@/lib/saveBlob'

/**
 * Loading the registers a company already keeps - employees, contractors and their workers,
 * equipment - from the spreadsheets they are kept in.
 *
 * Choose what is being imported, read the columns, choose the file. The server previews it
 * row by row before anything is written (api/src/lib/dataImport.ts), and the import adds
 * exactly the rows the preview said it would. Nothing that exists is changed, so the same
 * file can be corrected and imported again.
 */
export function DataImportPage() {
  return (
    <>
      <PageHeader
        title="Import Data"
        subtitle="Load the registers you already keep in Excel: employees, contractors and their workers, equipment, and HIRARC"
      />
      {isBackendConfigured() ? <LiveImport /> : (
        <Card>
          <CardBody>
            <NotInDemo>
              Importing needs the server. In a live workspace an Admin or HSE Manager loads employees, contractors,
              contractor workers and equipment here from a CSV file, with a preview of every row before anything is added.
            </NotInDemo>
          </CardBody>
        </Card>
      )}
    </>
  )
}

/** 2 MB: what the server accepts, and comfortably more than 2,000 rows. */
const MAX_BYTES = 2 * 1024 * 1024

type Filter = 'all' | RowAction

const PLANNED: Record<RowAction, { label: string; tone: 'good' | 'neutral' | 'critical' }> = {
  add: { label: 'To Add', tone: 'good' },
  skip: { label: 'Already There', tone: 'neutral' },
  fix: { label: 'To Fix', tone: 'critical' },
}
const DONE: Record<RowAction, { label: string; tone: 'good' | 'neutral' | 'critical' }> = {
  add: { label: 'Added', tone: 'good' },
  skip: { label: 'Already There', tone: 'neutral' },
  fix: { label: 'Not Imported', tone: 'critical' },
}

function LiveImport() {
  const { company } = useOrg()
  const [catalog, setCatalog] = useState<ImportCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<unknown>(null)
  const [kind, setKind] = useState<ImportKind>('employees')
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    importApi.catalog().then(setCatalog, setCatalogError)
  }, [])

  const entry = catalog?.kinds.find((k) => k.kind === kind)

  const reset = () => { setFile(null); setPlan(null); setDone(false); setError(null); setFilter('all') }

  const choose = async (chosen: File) => {
    if (!company) return
    reset()
    if (chosen.size > MAX_BYTES) {
      setError(`That file is larger than 2 MB. A file can hold up to ${(catalog?.maxRows ?? 2000).toLocaleString('en-MY')} rows: split it and import each part.`)
      return
    }
    const read = await readCsvFile(chosen)
    if ('problem' in read) {
      setError(read.problem === 'spreadsheet'
        ? 'That is an Excel workbook, not a CSV file. In Excel choose File › Save As › CSV UTF-8 (Comma delimited), then choose the saved file here.'
        : 'That file is empty.')
      return
    }
    setFile({ name: chosen.name, text: read.text })
    setBusy('preview')
    try {
      const p = await importApi.preview(company.id, kind, read.text)
      setPlan(p)
      setFilter(p.fix > 0 ? 'fix' : 'all')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const runImport = async () => {
    if (!company || !file) return
    setBusy('import'); setError(null)
    try {
      const p = await importApi.run(company.id, kind, file.text)
      setPlan(p)
      setDone(true)
      setFilter('all')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const downloadTemplate = () => {
    if (!entry) return
    saveBlob(new Blob([`﻿${templateCsv(entry.columns)}`], { type: 'text/csv;charset=utf-8' }), `safechain-${kind.replace('_', '-')}-template.csv`)
  }

  const rows = useMemo(() => (plan ? plan.rows.filter((r) => filter === 'all' || r.action === filter) : []), [plan, filter])

  if (catalogError) return <ErrorAlert error={catalogError} />
  if (!catalog || !entry) return <Skeleton className="h-64" />

  const label = entry.noun
  const badge = done ? DONE : PLANNED

  const rowColumns: Column<ImportRow>[] = [
    { key: 'line', header: 'Line', width: '4.5rem', render: (r) => <span className="tabular-nums text-ink-2">{r.line}</span> },
    { key: 'label', header: 'Row', render: (r) => <span className="font-medium text-ink">{r.label}</span> },
    { key: 'action', header: 'Result', width: '9rem', render: (r) => <Badge tone={badge[r.action].tone}>{badge[r.action].label}</Badge> },
    {
      key: 'message', header: 'Note',
      render: (r) => (
        <span className="text-ink-2">
          {r.ref ? `Added as ${r.ref}.` : null}
          {r.ref && r.message ? ' ' : null}
          {r.message}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="What Are You Importing" subtitle="Each register has its own columns. Download the template to start from them." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs">
              <Select label="Register" value={kind} disabled={busy !== null} onChange={(e) => { setKind(e.target.value as ImportKind); reset() }}>
                {catalog.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </Select>
            </div>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download size={14} aria-hidden /> Download Template
            </Button>
          </div>
          {kind === 'contractor_workers' && (
            <p className="text-xs text-ink-2">Import the contractors first: each worker names their contractor, which must already be in SafeChain.</p>
          )}
          <p className="text-sm text-ink">
            <span className="font-semibold">Required:</span> {entry.columns.filter((c) => c.required).map((c) => c.header).join(', ')}.
            {' '}<span className="text-ink-2">Columns in any order; a header written differently is still recognised.</span>
          </p>
          <details className="group rounded-lg border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">Every Column, and What to Put In</summary>
            <div className="border-t px-1 pb-1">
          <DataTable
            caption={`${entry.label} columns`}
            columns={[
              { key: 'header', header: 'Column', width: '12rem', render: (c) => <span className="font-medium text-ink">{c.header}</span> },
              { key: 'required', header: 'Needed', width: '6.5rem', render: (c) => (c.required ? 'Required' : 'Optional') },
              {
                key: 'help', header: 'What to Put In',
                render: (c) => (
                  <span className="text-ink-2">
                    {c.help}
                    {c.example ? <span className="text-muted">{c.help ? ' ' : ''}For example: {c.example}</span> : null}
                    {c.aliases?.length ? <span className="block text-2xs text-muted">Also read from a column named {c.aliases.join(', ')}.</span> : null}
                  </span>
                ),
              },
            ]}
            rows={entry.columns}
            rowKey={(c) => c.key}
          />
            </div>
          </details>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Choose the File" subtitle={`A CSV file of up to ${catalog.maxRows.toLocaleString('en-MY')} rows. Nothing is added until you have seen the preview.`} />
        <CardBody className="space-y-3">
          {!file || error ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-6 text-sm text-ink-2 hover:border-accent hover:bg-accent-soft/30">
              <span className="flex items-center gap-1.5 font-medium text-ink"><FileUp size={16} aria-hidden /> Choose a CSV File of {entry.label}</span>
              <span className="text-xs text-muted">In Excel: File › Save As › CSV UTF-8 (Comma delimited).</span>
              <input
                type="file"
                className="sr-only"
                accept=".csv,text/csv"
                disabled={busy !== null}
                onChange={(e) => {
                  const chosen = e.target.files?.[0]
                  if (chosen) void choose(chosen)
                  e.target.value = ''
                }}
              />
            </label>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-ink"><FileUp size={14} aria-hidden className="mr-1.5 inline text-muted" />{file.name}</span>
              <Button variant="ghost" size="sm" disabled={busy !== null} onClick={reset}>{done ? 'Import Another File' : 'Choose a Different File'}</Button>
            </div>
          )}

          <ErrorAlert error={error} onDismiss={() => setError(null)} />
          {busy === 'preview' && <Skeleton className="h-24" />}
          {busy === 'import' && plan && (
            <Alert tone="info">Importing {plan.add.toLocaleString('en-MY')} rows. A large file can take a minute: keep this page open.</Alert>
          )}

          {plan && busy === null && (
            <>
              {done ? (
                <Alert tone={plan.fix > 0 ? 'warning' : 'success'}>
                  {plan.add.toLocaleString('en-MY')} {plan.add === 1 ? 'row' : 'rows'} added to {label}.
                  {plan.skip > 0 && ` ${plan.skip.toLocaleString('en-MY')} already there, left as they were.`}
                  {plan.fix > 0 && ` ${plan.fix.toLocaleString('en-MY')} not imported: correct them in the file and import it again. The rows added this time will be recognised and skipped.`}
                </Alert>
              ) : (
                <p className="text-sm text-ink">
                  {plan.total.toLocaleString('en-MY')} {plan.total === 1 ? 'row' : 'rows'}: <strong>{plan.add.toLocaleString('en-MY')} to add</strong>,
                  {' '}{plan.skip.toLocaleString('en-MY')} already there, {plan.fix.toLocaleString('en-MY')} to fix.
                  {plan.fix > 0 && ' Rows to fix are left out; correct them in the file and import it again.'}
                </p>
              )}
              {plan.ignoredColumns.length > 0 && (
                <p className="text-xs text-muted">Not used: {plan.ignoredColumns.join(', ')}.</p>
              )}

              <Tabs
                label="Rows to show"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: 'all', label: `All ${plan.total}` },
                  { value: 'add', label: `${badge.add.label} ${plan.add}` },
                  { value: 'skip', label: `${badge.skip.label} ${plan.skip}` },
                  { value: 'fix', label: `${badge.fix.label} ${plan.fix}` },
                ]}
              />
              <DataTable
                caption="Rows in the file"
                columns={rowColumns}
                rows={rows}
                rowKey={(r) => String(r.line)}
                empty={<p className="py-4 text-sm text-muted">No rows here.</p>}
              />

              {!done && (
                <div className="flex justify-end">
                  <Button onClick={() => void runImport()} disabled={plan.add === 0}>
                    {plan.add === 0 ? 'Nothing to Import' : `Import ${plan.add.toLocaleString('en-MY')} ${plan.add === 1 ? 'Row' : 'Rows'}`}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
