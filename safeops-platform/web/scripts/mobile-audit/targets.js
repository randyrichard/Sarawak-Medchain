// Runs inside the page after probe.js. Touch targets, crowding, pinned bars and tiny text.
window.__extra = () => {
  const W = innerWidth, H = innerHeight
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0 }
  const desc = (el) => { const t = el.tagName.toLowerCase(); const lab = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 36); return `${t}${lab ? ` "${lab}"` : ''}` }
  const dialog = [...document.querySelectorAll('[role=dialog]')].filter(vis).at(-1)
  const scope = dialog ?? document
  const out = { tiny: [], small: 0, smallList: [], crowded: [], blocked: '', tinyText: [], noName: [] }
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=switch], [role=menuitem], summary'
  // A target hidden behind something else, or off screen, is not measured.
  const targets = [...scope.querySelectorAll(sel)].filter(vis).filter((el) => {
    if (el.closest('[aria-hidden=true]') || el.disabled) return false
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return false
    const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), W - 1), Math.min(Math.max(r.top + r.height / 2, 0), H - 1))
    return hit && (el === hit || el.contains(hit) || hit.contains(el) || (el.tagName === 'INPUT' && hit.tagName === 'LABEL'))
  })
  // WCAG 2.5.8 exempts a link inside a sentence; such a link sits in running text.
  const inline = (el) => el.tagName === 'A' && getComputedStyle(el).display === 'inline' && (el.parentElement?.innerText ?? '').trim().length > (el.innerText ?? '').trim().length + 8
  // A checkbox or radio inside a label is tapped through the label, which is the real target.
  const effective = (el) => {
    if (['checkbox', 'radio'].includes(el.type)) { const l = el.closest('label') ?? (el.id && document.querySelector(`label[for="${el.id}"]`)); if (l) return l }
    return el
  }
  const rects = targets.filter((el) => !inline(el)).map((el) => [el, effective(el).getBoundingClientRect()])
  for (const [el, r] of rects) {
    const m = Math.min(r.width, r.height)
    if (m < 24) out.tiny.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    else if (m < 44) { out.small++; out.smallList.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`) }
    if (!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.innerText ?? '').trim() || el.title || el.labels?.length || el.placeholder || el.getAttribute('alt')))
      out.noName.push(desc(el) + ' ' + el.outerHTML.slice(0, 80))
  }
  // Under 44px, two targets closer than 8px are easy to mis-tap.
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, ra] = rects[i], [b, rb] = rects[j]
    if (a.contains(b) || b.contains(a)) continue
    if (Math.min(ra.width, ra.height, rb.width, rb.height) >= 44) continue
    const gx = Math.max(ra.left - rb.right, rb.left - ra.right, 0), gy = Math.max(ra.top - rb.bottom, rb.top - ra.bottom, 0)
    if (gx === 0 && gy === 0) out.crowded.push(`${desc(a)} touches ${desc(b)}`)
    else if (Math.max(gx, gy) < 4 && (gx === 0 || gy === 0) && Math.min(ra.width, ra.height, rb.width, rb.height) < 32) out.crowded.push(`${desc(a)} ${Math.round(Math.max(gx, gy))}px from ${desc(b)}`)
  }
  // Pinned bars: how much of the screen they take for good.
  if (!dialog) {
    let top = 0, bottom = 0
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if ((cs.position !== 'fixed' && cs.position !== 'sticky') || !vis(el)) continue
      if (el.parentElement && ['fixed', 'sticky'].includes(getComputedStyle(el.parentElement).position)) continue
      const r = el.getBoundingClientRect()
      if (r.width < W * 0.5 || r.height > H * 0.9) continue // side drawers and full overlays are judged elsewhere
      if (r.top <= 1) top = Math.max(top, r.bottom)
      else if (r.bottom >= H - 1) bottom = Math.max(bottom, H - r.top)
    }
    if (top + bottom > H * 0.3) out.blocked = `pinned bars take ${Math.round(top)}px top + ${Math.round(bottom)}px bottom of ${H}px`
  }
  // Text too small to read on a phone.
  const tw = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT)
  for (let n; (n = tw.nextNode());) {
    if (!n.textContent.trim()) continue
    const el = n.parentElement
    if (!el || !vis(el) || el.closest('.sr-only,[aria-hidden=true],svg')) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs < 11) out.tinyText.push(`${fs}px "${n.textContent.trim().slice(0, 30)}"`)
  }
  const uniq = (a) => [...new Set(a)].slice(0, 10)
  out.tiny = uniq(out.tiny); out.crowded = uniq(out.crowded); out.tinyText = uniq(out.tinyText); out.noName = uniq(out.noName); out.smallList = uniq(out.smallList)
  return out
}
