import { open, unlink } from 'node:fs/promises'
import { extname, join } from 'node:path'

/**
 * What the three upload routes (incident evidence, permit documents, equipment files) must
 * all get right, in one place.
 *
 * Each route stored whatever the browser declared. `file.mimetype` is the Content-Type the
 * client wrote into the multipart body, not anything read from the bytes, so an executable
 * declared as `application/pdf` passed the allow-list, was stored, and came back to the
 * next person who opened it under the uploader's chosen filename - `Permit.exe` is a valid
 * original name. Between colleagues on one workspace that is a malware drop with the
 * product's name on it.
 *
 * And every route wrote the files before it knew whether the caller was allowed to attach
 * anything, then left them on disk when it found out they were not: an unknown incident, a
 * workspace the caller does not belong to, a closed permit, a rejected type part-way through
 * a batch. Five files of 10 MB per request, from any signed-in account, never cleaned up,
 * on the volume that also holds the evidence customers cannot recreate.
 */

/** The types the routes accept, and the one extension each is stored and served under. */
export const ALLOWED_UPLOAD_TYPES = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['application/pdf', '.pdf'],
])

/** Extensions a name may already carry for its type without one being appended. */
const ACCEPTED_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic', '.heif'],
  'application/pdf': ['.pdf'],
}

/**
 * Whether the first bytes of a file are what its declared type says they are.
 *
 * Signatures, not a full parse: the aim is to refuse a file that is plainly something else
 * (an executable, a script, an HTML page), not to validate an image decoder's input. PDF
 * allows its header anywhere in the first kilobyte, and real scanners do put bytes before
 * it, so that one is searched rather than anchored. HEIC is an ISO media file, identified
 * by its `ftyp` box; the brand varies by device, so any `ftyp` is accepted.
 */
export function matchesSignature(mimeType: string, head: Buffer): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b)
  switch (mimeType) {
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff)
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case 'image/webp':
      return head.subarray(0, 4).toString('latin1') === 'RIFF'
        && head.subarray(8, 12).toString('latin1') === 'WEBP'
    case 'image/heic':
      return head.subarray(4, 8).toString('latin1') === 'ftyp'
    case 'application/pdf':
      return head.subarray(0, 1024).includes('%PDF-')
    default:
      return false
  }
}

async function readHead(path: string): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buf = Buffer.alloc(1024)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

interface StoredUpload {
  filename: string
  mimetype: string
  originalname: string
}

/**
 * Settles each file's type from its bytes. Returns the first file that is none of the
 * accepted types, or null when every file is one of them.
 *
 * A file that is an accepted type other than the one declared - a PNG screenshot saved with
 * a `.jpg` name, which a browser then declares as JPEG - is not refused: it is a genuine
 * photograph, and turning it away on a technicality would stop somebody on a site recording
 * evidence. Its `mimetype` is corrected to what it really is, so the row and every later
 * download describe it truthfully.
 */
export async function settleUploadTypes<F extends StoredUpload>(dir: string, files: F[]): Promise<F | null> {
  for (const f of files) {
    const head = await readHead(join(dir, f.filename))
    if (matchesSignature(f.mimetype, head)) continue
    const actual = [...ALLOWED_UPLOAD_TYPES.keys()].find((type) => matchesSignature(type, head))
    if (!actual) return f
    f.mimetype = actual
  }
  return null
}

/**
 * Removes the files a refused request wrote. Never throws: the request is already failing
 * for a reason worth reporting, and a file that is already gone is the outcome wanted.
 */
export async function discardUploads(dir: string, files: { filename: string }[] | undefined): Promise<void> {
  await Promise.all((files ?? []).map((f) => unlink(join(dir, f.filename)).catch(() => undefined)))
}

/**
 * The Content-Disposition for serving a stored file back.
 *
 * Always `attachment`: a PDF rendered in this origin can script. The name is the uploader's,
 * so it is reduced to something that cannot address a path or break the header, and its
 * extension is made to agree with the type the file was verified as - a name ending in
 * `.exe` is saved as `.exe.pdf`, which is what it is. Sent twice, as plain ASCII and as
 * RFC 5987 UTF-8, so a Malay or Chinese filename survives while older clients still get a
 * usable one; before this the name was percent-encoded into the plain form, which browsers
 * do not decode, so every space arrived as `%20`.
 */
export function attachmentDisposition(originalName: string, mimeType: string): string {
  const cleaned = originalName
    .replace(/[\\/]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(0, 200) || 'file'
  const wanted = ACCEPTED_EXTENSIONS[mimeType]
  const ext = extname(cleaned).toLowerCase()
  const name = wanted && !wanted.includes(ext) ? `${cleaned}${ALLOWED_UPLOAD_TYPES.get(mimeType)}` : cleaned
  // eslint-disable-next-line no-control-regex
  const ascii = name.replace(/[^\x20-\x7e]/g, '_')
  // encodeURIComponent leaves ' ( ) * alone, and RFC 5987 does not allow them unescaped.
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
