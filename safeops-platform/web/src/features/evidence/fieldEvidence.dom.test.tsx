// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

/**
 * Field photos: the inspection and audit runners counted the photos chosen and threw them
 * away, and the record then showed the count as if they were kept. These pin what replaced
 * that - photos that are sent, failures that are said, and refusals named before sending.
 */
let backend = true
vi.mock('@/api/authApi', () => ({ isBackendConfigured: () => backend }))
const upload = vi.fn()
vi.mock('@/api/http', () => ({ upload: (...a: unknown[]) => upload(...a), request: vi.fn(), blob: vi.fn() }))

const { sendFieldPhotos } = await import('./fieldEvidence')
const { fieldEvidenceApi } = await import('@/api/fieldEvidenceApi')
const { PhotoPicker } = await import('./PhotoPicker')
const { AddFieldPhotos } = await import('./AddFieldPhotos')

const jpg = (name = 'a.jpg') => new File([new Uint8Array(10)], name, { type: 'image/jpeg' })

afterEach(() => { cleanup(); upload.mockReset(); backend = true })

describe('sendFieldPhotos', () => {
  it('sends the files to the record and reports none failed', async () => {
    upload.mockResolvedValue({ rows: [] })
    expect(await sendFieldPhotos('inspections', 'ins-1', [jpg()])).toEqual({ stored: 1, failed: [] })
    expect(upload.mock.calls[0][0]).toBe('/evidence/inspections/ins-1')
  })

  it('says how many did not arrive, rather than claiming them', async () => {
    upload.mockRejectedValue(new Error('Upload failed.'))
    const r = await sendFieldPhotos('audits', 'aud-1', [jpg(), jpg('b.jpg')], 'q1')
    expect(r.stored).toBe(0)
    expect(r.failed.map((f) => f.name)).toEqual(['a.jpg', 'b.jpg'])
    expect((upload.mock.calls[0][1] as FormData).get('itemId')).toBe('q1')
  })

  it('sends five to a request, and counts as failed only a batch that failed', async () => {
    // Seven photos: the first five are stored, then the connection drops. Calling all seven
    // failed sent people to add again five photos already on the record.
    upload.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('Network'))
    const files = Array.from({ length: 7 }, (_, i) => jpg(`${i}.jpg`))
    const r = await sendFieldPhotos('inspections', 'ins-1', files)
    expect(upload).toHaveBeenCalledTimes(2)
    expect((upload.mock.calls[0][1] as FormData).getAll('files')).toHaveLength(5)
    expect(r.stored).toBe(5)
    expect(r.failed.map((f) => f.name)).toEqual(['5.jpg', '6.jpg'])
  })

  it('sends nothing in the offline demo, which keeps nothing anyway', async () => {
    backend = false
    expect(await sendFieldPhotos('actions', 'ca-1', [jpg()])).toEqual({ stored: 0, failed: [] })
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('fieldEvidenceApi.upload', () => {
  it('is one request of at most five files, as the server accepts', async () => {
    upload.mockResolvedValue({ rows: [] })
    await fieldEvidenceApi.upload('inspections', 'ins-1', Array.from({ length: 5 }, (_, i) => jpg(`${i}.jpg`)))
    expect(upload).toHaveBeenCalledTimes(1)
    await expect(fieldEvidenceApi.upload('inspections', 'ins-1', Array.from({ length: 6 }, (_, i) => jpg(`${i}.jpg`))))
      .rejects.toThrow(/At most five/)
    expect(upload).toHaveBeenCalledTimes(1)
  })
})

describe('AddFieldPhotos', () => {
  it('after a partial failure keeps only the photos that did not arrive', async () => {
    upload.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('Network'))
    const onAdded = vi.fn()
    render(<AddFieldPhotos kind="inspections" id="ins-1" onAdded={onAdded} />)
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: Array.from({ length: 6 }, (_, i) => jpg(`${i}.jpg`)) } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload 6 photos' }))
    expect(await screen.findByText(/One photo did not upload; the other 5 did/)).toBeTruthy()
    // The stored five are gone from the selection; pressing Upload again sends only 5.jpg.
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeTruthy()
    expect(screen.queryByText('0.jpg')).toBeNull()
    expect(screen.getByText('5.jpg')).toBeTruthy()
    expect(onAdded).toHaveBeenCalledTimes(1)
  })
})

describe('PhotoPicker', () => {
  function Harness() {
    const [files, setFiles] = useState<File[]>([])
    return <PhotoPicker files={files} onChange={setFiles} />
  }

  it('keeps photos, names what the server would refuse, and lets one be removed', () => {
    render(<Harness />)
    const input = document.querySelector('input[type=file]')!
    fireEvent.change(input, { target: { files: [jpg('scene.jpg'), new File([new Uint8Array(4)], 'clip.mp4', { type: 'video/mp4' })] } })
    expect(screen.getByText('scene.jpg')).toBeTruthy()
    expect(screen.getByText(/1 to send/)).toBeTruthy()
    expect(screen.getByText('clip.mp4 is not a photo or PDF.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove scene.jpg' }))
    expect(screen.queryByText('scene.jpg')).toBeNull()
  })
})
