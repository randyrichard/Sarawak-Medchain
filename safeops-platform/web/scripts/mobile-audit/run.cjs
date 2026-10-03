#!/usr/bin/env node
/**
 * Mobile layout audit: every page, on iPhone and Android sizes, portrait and landscape,
 * with the keyboard up. Measures the real layout in a browser - which jsdom cannot - and
 * exits non-zero if anything is found.
 *
 *   npx playwright install chromium        # once, if Playwright is not installed
 *   MOBILE_AUDIT_URL=http://localhost:5173 node scripts/mobile-audit/run.cjs
 *
 * Needs the web app running against an API with the demo data (`npm run demo` in api/).
 * Signs in as MOBILE_AUDIT_EMAIL / MOBILE_AUDIT_PASSWORD (default: the demo administrator).
 * The API's login limiter allows a handful of sign-ins per quarter hour; this uses five.
 *
 * What it checks, per page and device:
 * - zoom-out:  the layout is wider than the screen, so the phone shrinks the whole page
 * - sideways:  the page scrolls horizontally
 * - wide:      an element past the screen edge that no scroll box contains
 * - spill:     text running out of its own box
 * - clipped:   text cut off by a fixed-height box that does not scroll
 * - overlap:   text or controls drawn on top of each other
 * - iosZoom:   a text field under 16px, which an iPhone zooms into on focus
 * Navigation: top-bar items overlapping, off-screen or under 44px; the menu drawer reaching
 * its last item. Keyboard: with the screen shrunk by a keyboard's height, each field must
 * be in view and not covered by a pinned bar.
 *
 * It runs Chromium with each device's size, touch and user agent. That is how Android
 * renders; it is not Safari. iOS-specific behaviour (zoom on focus under 16px, the keyboard
 * not resizing the page) is covered by rules rather than by WebKit - check on a real iPhone
 * before a release that matters.
 */
const fs = require('fs')
const path = require('path')

function loadPlaywright() {
  try { return require('playwright') } catch { /* fall through to a global install */ }
  const root = require('child_process').execSync('npm root -g').toString().trim()
  return require(path.join(root, 'playwright'))
}
const { chromium, devices } = loadPlaywright()

const BASE = (process.env.MOBILE_AUDIT_URL || 'http://localhost:5173').replace(/\/$/, '')
const EMAIL = process.env.MOBILE_AUDIT_EMAIL || 'admin@demo.safeops.app'
const PASSWORD = process.env.MOBILE_AUDIT_PASSWORD || 'SafeOpsPlatform2026'
const PROBE = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8')

const DEVICES = [
  // name, Playwright device, keyboard height in CSS px
  ['iPhone SE (320)', devices['iPhone SE'], 336],
  ['iPhone 14 Pro (393)', devices['iPhone 14 Pro'], 336],
  ['Pixel 7 (412)', devices['Pixel 7'], 315],
  ['Galaxy S8 (360)', devices['Galaxy S8'], 290],
  ['iPhone SE landscape', devices['iPhone SE landscape'], 200],
]
const ROUTES = ['/', '/near-miss', '/incidents', '/incidents/new', '/incidents/board', ':incident', '/actions', '/assets',
  '/permits', '/visitors', '/toolbox', '/performance', '/reports', '/audits', '/training', '/employees', '/contractors',
  '/organization', '/admin', '/notifications', '/account']
// page, button that opens the form (optional), field
const FIELDS = [
  ['/near-miss', null, '#nm-what'],
  ['/near-miss', null, '#nm-where'],
  ['/incidents/new', null, 'input:visible >> nth=-1'],
  ['/incidents', null, 'input[aria-label="Search incidents"]'],
  ['/performance', 'button:has-text("Record man-hours")', '[role=dialog] input >> nth=-1'],
  ['/performance', 'button:has-text("Set targets")', '[role=dialog] input >> nth=-1'],
  ['/permits', 'button:has-text("Request permit")', '[role=dialog] input:visible >> nth=-1'],
  ['/visitors', 'button:has-text("Register visitor")', '[role=dialog] input:visible >> nth=-1'],
]

async function signIn(page) {
  await page.goto(BASE + '/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.locator('input[autocomplete=current-password]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
}

function layoutFindings(r) {
  const f = []
  if (r.zoomOut) f.push(`zoom-out: ${r.zoomOut}`)
  if (r.docW > r.W) f.push(`sideways: page ${r.docW}px on a ${r.W}px screen`)
  for (const k of ['wide', 'clipped', 'spill', 'overlap', 'tallFixed']) if (r[k].length) f.push(`${k}: ${r[k].join(' | ')}`)
  if (r.smallInputs.length) f.push(`iosZoom: ${r.smallInputs.join(' | ')}`)
  return f
}

async function auditDevice(browser, [name, device, keyboard]) {
  const findings = []
  const ctx = await browser.newContext({ ...device })
  await ctx.addInitScript(PROBE)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => findings.push(`script error: ${e.message.slice(0, 160)}`))

  await page.goto(BASE + '/login'); await page.waitForTimeout(800)
  for (const f of layoutFindings(await page.evaluate(() => window.__probe()))) findings.push(`/login ${f}`)
  await signIn(page)

  await page.goto(BASE + '/incidents'); await page.waitForTimeout(1500)
  const incident = await page.locator('a[href^="/incidents/"]').evaluateAll((as) =>
    as.map((a) => a.getAttribute('href')).find((h) => /^\/incidents\/[a-z0-9]{10,}$/.test(h)))

  for (const r of ROUTES) {
    const p = r === ':incident' ? incident : r
    if (!p) continue
    await page.goto(BASE + p); await page.waitForTimeout(1500)
    for (const f of layoutFindings(await page.evaluate(() => window.__probe()))) findings.push(`${r} ${f}`)
  }

  // Navigation: the top bar, and the drawer reaching its last item.
  await page.goto(BASE + '/'); await page.waitForTimeout(1200)
  const bar = await page.evaluate(() => {
    const items = [...document.querySelectorAll('header button, header a')].filter((e) => e.getBoundingClientRect().width > 0)
    const name = (e) => (e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 24)
    const out = []
    items.forEach((a, i) => items.slice(i + 1).forEach((b) => {
      if (a.contains(b) || b.contains(a)) return
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
      if (Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 1 && Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 1) out.push(`top bar overlap: ${name(a)} ✕ ${name(b)}`)
    }))
    for (const e of items) {
      const r = e.getBoundingClientRect()
      if (r.right > screen.width + 1) out.push(`top bar off-screen: ${name(e)}`)
      if (matchMedia('(pointer: coarse)').matches && (r.width < 44 || r.height < 44)) out.push(`top bar target under 44px: ${name(e)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  })
  findings.push(...bar)
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.count()) {
    await menu.click(); await page.waitForTimeout(400)
    const reach = await page.evaluate(() => {
      const aside = [...document.querySelectorAll('aside')].find((e) => e.getBoundingClientRect().width > 0)
      const nav = aside.querySelector('nav'); nav.scrollTop = nav.scrollHeight
      const last = [...aside.querySelectorAll('a')].at(-1).getBoundingClientRect()
      return last.top >= 0 && last.bottom <= innerHeight + 1
    })
    if (!reach) findings.push('drawer: the last menu item cannot be scrolled into view')
    await page.getByRole('button', { name: 'Close menu' }).click()
  }

  // Keyboard: shrink the screen by the keyboard, focus the field, check it is visible and uncovered.
  const full = device.viewport
  for (const [p, opener, sel] of FIELDS) {
    await page.setViewportSize(full)
    await page.goto(BASE + p); await page.waitForTimeout(1200)
    if (opener) { const b = page.locator(opener).first(); if (!(await b.count())) continue; await b.click(); await page.waitForTimeout(500) }
    const field = page.locator(sel).first()
    if (!(await field.count())) continue
    await page.setViewportSize({ width: full.width, height: full.height - keyboard })
    await field.focus(); await page.waitForTimeout(250)
    await field.evaluate((e) => e.scrollIntoView({ block: 'nearest' }))
    const res = await field.evaluate((e) => {
      const r = e.getBoundingClientRect()
      // Where the caret is: a tall box (a textarea taller than the space left) only needs its first line in view.
      const y = r.top + Math.min(r.height / 2, 14)
      const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), y)
      return { firstLineInView: r.top >= 0 && r.top + 24 <= innerHeight, covered: !!hit && !(hit === e || e.contains(hit) || hit.contains(e) || hit.tagName === 'LABEL') }
    })
    if (!res.firstLineInView) findings.push(`keyboard: ${p} ${sel} is out of view with the keyboard up`)
    if (res.covered) findings.push(`keyboard: ${p} ${sel} is covered with the keyboard up`)
  }
  await ctx.close()
  return findings
}

;(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  let total = 0
  for (const d of DEVICES) {
    const f = [...new Set(await auditDevice(browser, d))]
    total += f.length
    console.log(`\n${d[0]}: ${f.length === 0 ? 'no findings' : `${f.length} finding(s)`}`)
    for (const line of f) console.log(`  - ${line}`)
  }
  await browser.close()
  console.log(`\n${total === 0 ? 'PASS' : 'FAIL'}: ${total} finding(s)`)
  process.exit(total === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
