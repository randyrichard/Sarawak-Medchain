/**
 * Saves a file the app has in memory (an export, a report, a downloaded attachment).
 *
 * Every download did this inline and revoked the object URL on the line after `click()`.
 * Chrome tolerates that. Safari - on iPhone above all - starts the download asynchronously,
 * and revoking at once can cancel it ("WebKitBlobResource error 1"): the tap does nothing,
 * or opens an empty page. The URL is kept for a minute instead, which costs nothing.
 *
 * The link is attached to the document while it is clicked, which older Safari requires
 * for a synthetic click to start a download.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
