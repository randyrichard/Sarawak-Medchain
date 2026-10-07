// Runs inside the page. Returns layout problems measured from the real DOM.
window.__probe = () => {
  const W = innerWidth, H = innerHeight
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0 }
  const desc = (el) => { const t = el.tagName.toLowerCase(); const id = el.id ? '#' + el.id : ''; const lab = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40); return `${t}${id}${lab ? ` "${lab}"` : ''}` }
  const scrollsX = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true } return false }
  const out = { zoomOut: innerWidth > screen.width + 1 ? `layout ${innerWidth}px on a ${screen.width}px screen` : '', W: Math.min(W, screen.width), H, docW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, wide: [], clipped: [], spill: [], overlap: [], smallInputs: [], tallFixed: [] }
  const all = [...document.querySelectorAll('body *')].filter(vis)
  // 1. Elements past the right/left edge that are not inside a scroll/clip container.
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if ((r.right > W + 1 || r.left < -1) && !scrollsX(el) && getComputedStyle(el).position !== 'fixed') out.wide.push(`${desc(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`)
  }
  // 2. Text spilling out of its own box horizontally (not truncated with ellipsis, not a scroller).
  for (const el of all) {
    const cs = getComputedStyle(el)
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!ownText) continue
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis' && el.clientWidth > 0 && cs.display !== 'inline') out.spill.push(`${desc(el)} (${el.scrollWidth}>${el.clientWidth})`)
  }
  // 3. Content cut off by a fixed-height box that does not scroll.
  for (const el of all) {
    const cs = getComputedStyle(el)
    if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && cs.webkitLineClamp === 'none' && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 20 && !el.closest('[aria-hidden="true"]')) {
      const hasText = (el.innerText || '').trim().length > 0
      if (hasText) out.clipped.push(`${desc(el)} (${el.scrollHeight}>${el.clientHeight})`)
    }
  }
  // 4. Text/controls drawn on top of each other (neither contains the other).
  const leaves = all.filter((el) => {
    const t = el.tagName
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(t)) return true
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  }).filter((el) => !el.closest('[role="dialog"]') || document.querySelector('[role="dialog"]'))
  // False when a scrolling or clipping ancestor cuts the element off at that point.
  const shownAt = (e, x, y) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
      const r = p.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false
    }
    return true
  }
  const pinned = (e) => { for (let p = e; p; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === 'sticky' || ps === 'fixed') return true } return false }
  const rects = leaves.filter((el) => !pinned(el)).flatMap((el) => [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => [el, r]))
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, ra] = rects[i], [b, rb] = rects[j]
    if (a === b || a.contains(b) || b.contains(a)) continue
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
    const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
    if (ix > 3 && iy > 3) {
      // Ignore things that are under an open overlay on purpose, and screen-reader-only text.
      if ([a, b].some((e) => e.closest('.sr-only') || getComputedStyle(e).position === 'absolute' && e.closest('[aria-hidden="true"]'))) continue
      // The one on top must be what a tap hits; if neither is reachable it is behind an overlay.
      const cx = Math.max(ra.left, rb.left) + ix / 2, cy = Math.max(ra.top, rb.top) + iy / 2
      if (cy < 0 || cy > H) continue
      // Scrolled out of its scroll box (under the top bar, say): clipped, so not drawn there.
      if (!shownAt(a, cx, cy) || !shownAt(b, cx, cy)) continue
      const top = document.elementFromPoint(cx, cy)
      if (!top || (!a.contains(top) && !b.contains(top) && !top.contains(a) && !top.contains(b))) continue
      // A button or icon placed inside a field on purpose (show-password, search icon) is
      // fine when the field reserves padding for it, so typed text never runs underneath.
      const field = [a, b].find((e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName))
      const inner = [a, b].find((e) => e !== field)
      if (field && inner && getComputedStyle(inner).position === 'absolute') {
        const fs = getComputedStyle(field)
        const reserved = Math.max(parseFloat(fs.paddingRight), parseFloat(fs.paddingLeft))
        if (reserved >= ix - 1) continue
      }
      out.overlap.push(`${desc(a)} ✕ ${desc(b)} (${Math.round(ix)}×${Math.round(iy)})`)
    }
  }
  // 5. Inputs iOS would zoom into on focus (< 16px).
  for (const el of all.filter((e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && !['checkbox', 'radio', 'file', 'hidden', 'range'].includes(e.type)))
    if (parseFloat(getComputedStyle(el).fontSize) < 16) out.smallInputs.push(`${desc(el)} ${getComputedStyle(el).fontSize}`)
  // 6. Fixed/sticky boxes taller than the screen (cannot be scrolled to the end).
  for (const el of all) { const cs = getComputedStyle(el); if (cs.position === 'fixed' && el.getBoundingClientRect().height > H + 1 && cs.overflowY === 'visible') out.tallFixed.push(desc(el)) }
  const uniq = (a) => [...new Set(a)]
  for (const k of ['wide', 'clipped', 'spill', 'overlap', 'smallInputs', 'tallFixed']) out[k] = uniq(out[k]).slice(0, 12)
  return out
}
