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

const jpg = (name = 'a.jpg') => new File([new Uint8Array(10)], name, { type: 'image/jpeg' })

afterEach(() => { cleanup(); upload.mockReset(); backend = true })

describe('sendFieldPhotos', () => {
  it('sends the files to the record and reports none failed', async () => {
    upload.mockResolvedValue({ rows: [] })
    expect(await sendFieldPhotos('inspections', 'ins-1', [jpg()])).toBe(0)
    expect(upload.mock.calls[0][0]).toBe('/evidence/inspections/ins-1')
  })

  it('says how many did not arrive, rather than claiming them', async () => {
    upload.mockRejectedValue(new Error('Upload failed.'))
    expect(await sendFieldPhotos('audits', 'aud-1', [jpg(), jpg('b.jpg')], 'q1')).toBe(2)
    expect((upload.mock.calls[0][1] as FormData).get('itemId')).toBe('q1')
  })

  it('sends nothing in the offline demo, which keeps nothing anyway', async () => {
    backend = false
    expect(await sendFieldPhotos('actions', 'ca-1', [jpg()])).toBe(0)
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('fieldEvidenceApi.upload', () => {
  it('sends at most five files a request, as the server accepts', async () => {
    upload.mockResolvedValue({ rows: [] })
    await fieldEvidenceApi.upload('inspections', 'ins-1', Array.from({ length: 7 }, (_, i) => jpg(`${i}.jpg`)))
    expect(upload).toHaveBeenCalledTimes(2)
    expect((upload.mock.calls[0][1] as FormData).getAll('files')).toHaveLength(5)
    expect((upload.mock.calls[1][1] as FormData).getAll('files')).toHaveLength(2)
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
