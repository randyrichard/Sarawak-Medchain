// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ImportCatalog, ImportPlan } from '@/api/importApi'
import { ApiError } from '@/api/types'

/**
 * Importing a register, as the person doing it sees it.
 *
 * What each row becomes is the server's decision (api/src/lib/dataImport.ts, tested there
 * over HTTP). What is tested here is the screen's side: that the file is read as the person
 * sees it in Excel, that nothing is sent to be imported before the preview has been shown,
 * and that the import sends the same file the preview was made from.
 */
let backend = true
vi.mock('@/api/authApi', async (orig) => ({ ...(await orig<object>()), isBackendConfigured: () => backend }))
vi.mock('@/features/org/OrgContext', () => ({ useOrg: () => ({ company: { id: 'big', name: 'Big Co' } }) }))
const saveBlob = vi.fn()
vi.mock('@/lib/saveBlob', () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }))
const catalog = vi.fn()
const preview = vi.fn()
const run = vi.fn()
vi.mock('@/api/importApi', async (orig) => ({
  ...(await orig<object>()),
  importApi: {
    catalog: (...a: unknown[]) => catalog(...a), preview: (...a: unknown[]) => preview(...a), run: (...a: unknown[]) => run(...a),
  },
}))

const { DataImportPage } = await import('./DataImportPage')
const { templateCsv } = await import('@/api/importApi')

afterEach(() => { cleanup(); vi.clearAllMocks(); backend = true })

const CATALOG: ImportCatalog = {
  maxRows: 2000,
  kinds: [
    {
      kind: 'employees', label: 'Employees',
      columns: [
        { key: 'name', header: 'Name', required: true, help: 'Full name.', example: 'Grace Lim', aliases: ['Full Name'] },
        { key: 'site', header: 'Site', required: true, help: 'The site name.', example: 'Bintulu' },
        { key: 'employeeNo', header: 'Employee No', required: false, help: 'Your own staff number.', example: 'P10234' },
      ],
    },
    { kind: 'contractor_workers', label: 'Contractor Workers', columns: [{ key: 'name', header: 'Name', required: true, help: '', example: 'Rashid Karim' }] },
  ],
}

const PLAN: ImportPlan = {
  kind: 'employees', total: 3, add: 2, skip: 0, fix: 1, ignoredColumns: ['Shoe Size'],
  rows: [
    { line: 2, action: 'add', label: 'Lim, Grace', message: null },
    { line: 3, action: 'fix', label: 'Nobody Here', message: 'No site called "Kuching". Sites: Bintulu Yard.' },
    { line: 4, action: 'add', label: 'Ali Hassan', message: null },
  ],
}

/** A chosen file. jsdom's File has no arrayBuffer(), which every browser the app supports does. */
function fileOf(content: string | Uint8Array, name = 'staff.csv') {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  const file = new File([bytes], name, { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
  return file
}

async function choose(file: File) {
  const input = await screen.findByLabelText(/Choose a CSV File of Employees/)
  fireEvent.change(input, { target: { files: [file] } })
}

describe('importing a register', () => {
  it('shows the columns, and hands out the template to fill in', async () => {
    catalog.mockResolvedValue(CATALOG)
    render(<DataImportPage />)
    expect(await screen.findByText('Employee No')).toBeTruthy()
    expect(screen.getByText(/Also read from a column named Full Name/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Download Template/ }))
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'safechain-employees-template.csv')
    expect(templateCsv(CATALOG.kinds[0].columns)).toBe('Name,Site,Employee No\r\nGrace Lim,Bintulu,P10234\r\n')
  })

  it('previews the file before anything is imported, then imports the same file', async () => {
    catalog.mockResolvedValue(CATALOG)
    preview.mockResolvedValue(PLAN)
    run.mockResolvedValue({ ...PLAN, rows: PLAN.rows.map((r, i) => (r.action === 'add' ? { ...r, ref: `P100${i}` } : r)) })
    render(<DataImportPage />)
    const csv = 'Name,Site,Shoe Size\r\n"Lim, Grace",BTU,8\r\n'
    await choose(fileOf(csv))

    // Opens on what needs fixing, so it is not missed under the rows that are fine.
    expect(await screen.findByText(/No site called "Kuching"/)).toBeTruthy()
    expect(screen.queryByText('Lim, Grace')).toBeNull()
    expect(screen.getByText(/Not used: Shoe Size/)).toBeTruthy()
    expect(preview).toHaveBeenCalledWith('big', 'employees', csv)
    expect(run).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 Rows' }))
    await waitFor(() => expect(run).toHaveBeenCalledWith('big', 'employees', csv))
    expect(await screen.findByText(/2 rows added to employees/)).toBeTruthy()
    expect(screen.getByText('Added as P1000.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import Another File' })).toBeTruthy()
  })

  it('turns away an Excel workbook with how to save it as CSV', async () => {
    catalog.mockResolvedValue(CATALOG)
    render(<DataImportPage />)
    await choose(fileOf(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]), 'staff.xlsx'))
    expect(await screen.findByText(/That is an Excel workbook, not a CSV file/)).toBeTruthy()
    expect(preview).not.toHaveBeenCalled()
  })

  it('reads a file Excel saved in the PC\'s own code page without mangling a name', async () => {
    catalog.mockResolvedValue(CATALOG)
    preview.mockResolvedValue(PLAN)
    render(<DataImportPage />)
    // "José,BTU" as Windows-1252 writes it: é is the single byte 0xE9, which is not UTF-8.
    await choose(fileOf(new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x2c, 0x53, 0x69, 0x74, 0x65, 0x0a, 0x4a, 0x6f, 0x73, 0xe9, 0x2c, 0x42, 0x54, 0x55])))
    await waitFor(() => expect(preview).toHaveBeenCalled())
    expect(preview.mock.calls[0][2]).toBe('Name,Site\nJosé,BTU')
  })

  it('shows the server\'s refusal of the file in its own words', async () => {
    catalog.mockResolvedValue(CATALOG)
    preview.mockRejectedValue(new ApiError('validation', 'The file has no "Site" column. Download the template to see the columns.'))
    render(<DataImportPage />)
    await choose(fileOf('Name\nAli\n'))
    expect(await screen.findByText(/The file has no "Site" column/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Import \d/ })).toBeNull()
  })

  it('offers nothing to import when every row is already there', async () => {
    catalog.mockResolvedValue(CATALOG)
    preview.mockResolvedValue({ ...PLAN, add: 0, skip: 3, fix: 0, rows: PLAN.rows.map((r) => ({ ...r, action: 'skip', message: 'Already in the register.' })) })
    render(<DataImportPage />)
    await choose(fileOf('Name,Site\nAli,BTU\n'))
    const button = await screen.findByRole('button', { name: 'Nothing to Import' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('says, calmly, that the offline demo cannot import', () => {
    backend = false
    render(<DataImportPage />)
    expect(screen.getByText(/Importing needs the server/)).toBeTruthy()
    expect(catalog).not.toHaveBeenCalled()
  })
})
