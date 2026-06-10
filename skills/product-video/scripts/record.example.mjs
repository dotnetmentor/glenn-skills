// ---------------------------------------------------------------------------
// Members-domain recorder. Drives the REAL app (Playwright) through the member
// register: list, live search, a member profile, årsavgift-vs-tillval levels,
// the renewals view (automatic reminders), and adding a member. Captures per
// beat: a screenshot, an optional post-interaction "reveal" screenshot, the
// focal element box (for the eased zoom), and cursor/click targets.
// ---------------------------------------------------------------------------
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
import { mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out', 'record')
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:5173'
const SLUG = 'e2e-test'
const VW = 1440
const VH = 900
const DSF = 2

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: DSF,
  recordVideo: { dir: OUT, size: { width: VW, height: VH } },
})
const page = await ctx.newPage()

await page.goto(`${BASE}/t/${SLUG}/members`)
await page.waitForLoadState('domcontentloaded')
const ok = await page.evaluate(async () => {
  const r = await fetch(window.location.origin + '/api/Auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.com', otpCode: '111111' }),
  })
  return r.ok
})
if (!ok) throw new Error('admin auth failed')

// grab a member id (Anna Andersson — has both årsavgift + a tillval) for the profile beat
const annaId = await page.evaluate(async (org) => {
  const r = await fetch(`${location.origin}/api/organisations/${org}/members`)
  if (!r.ok) return null
  const data = await r.json()
  const list = Array.isArray(data) ? data : data.items || data.members || []
  const a = list.find((m) => (m.lastName || '').includes('Andersson')) || list[0]
  return a?.id ?? null
}, SLUG)

// --- in-page geometry helpers ----------------------------------------------
const measureText = (strings) =>
  page.evaluate((strings) => {
    const deepest = (str) => {
      const needle = str.toLowerCase()
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
      let best = null
      while (w.nextNode()) {
        const el = w.currentNode
        if (!(el.textContent || '').toLowerCase().includes(needle)) continue
        const r = el.getBoundingClientRect()
        if (r.left > 270 && r.width > 4 && r.height > 4) {
          const a = r.width * r.height
          if (!best || a < best.a) best = { r, a }
        }
      }
      return best ? best.r : null
    }
    const rects = strings.map(deepest).filter(Boolean)
    if (!rects.length) return null
    const x = Math.min(...rects.map((r) => r.left))
    const y = Math.min(...rects.map((r) => r.top))
    const right = Math.max(...rects.map((r) => r.right))
    const bottom = Math.max(...rects.map((r) => r.bottom))
    return { x, y, width: right - x, height: bottom - y }
  }, strings)

const measureDialog = () =>
  page.evaluate(() => {
    const vcx = window.innerWidth / 2
    const cands = [...document.querySelectorAll('.MuiModal-root .MuiPaper-root, [role="dialog"], .MuiDialog-paper')]
      .filter((el) => !el.classList.contains('MuiBackdrop-root'))
      .map((el) => el.getBoundingClientRect())
      .map((r) => ({ r, cx: r.left + r.width / 2 }))
      .filter((c) => c.r.width > 140 && c.r.height > 140 && c.cx > 220 && c.cx < window.innerWidth - 220)
    if (!cands.length) return null
    cands.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
    const { r } = cands[0]
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })

const buttonAt = (re) =>
  page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i')
    const b = [...document.querySelectorAll('button,a')].find((el) => rx.test(el.textContent || ''))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, re.source)

const inputCenter = () =>
  page.evaluate(() => {
    const i = document.querySelector('main input, [role="main"] input, input')
    if (!i) return null
    const r = i.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })

const settle = async (ms = 1600) => {
  await page.waitForLoadState('networkidle').catch(() => {})
  // wait out the "Laddar organisation…" splash if present
  await page.waitForFunction(() => !document.body.textContent.includes('Laddar organisation'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const center = (r) => (r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null)
const fallback = (r, fb) => (r && r.width > 40 && r.height > 24 ? r : fb)
const shoot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  return `${name}.png`
}

async function openDialog(name, buttonRe, fill) {
  const btn = await buttonAt(buttonRe)
  try {
    await page.getByRole('button', { name: buttonRe }).first().click({ timeout: 4000 })
    await page.waitForTimeout(1000)
    if (fill) await fill().catch((e) => console.log(`  fill(${name}): ${(e.message || '').split('\n')[0]}`))
    await page.waitForTimeout(450)
    const focus = await measureDialog()
    if (!focus) throw new Error('no modal dialog measured')
    const revealImage = await shoot(name)
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
    return { revealImage, focus, btn }
  } catch (e) {
    console.log(`  dialog(${name}) skipped: ${(e.message || '').split('\n')[0]}`)
    await page.keyboard.press('Escape').catch(() => {})
    return { revealImage: null, focus: null, btn }
  }
}

const timeline = []

// === BEAT 1 — the register =================================================
await page.goto(`${BASE}/t/${SLUG}/members`)
await page.getByRole('heading', { name: /medlemmar/i }).waitFor({ timeout: 15000 }).catch(() => {})
await settle()
{
  const table = fallback(
    await measureText(['Namn', 'Email', 'Medlemsnummer', 'Andersson', 'Eriksson', 'Rows per page']),
    { x: 290, y: 210, width: 1100, height: 470 },
  )
  timeline.push({
    id: 'register',
    kicker: 'MEDLEMSREGISTER',
    title: 'Alla medlemmar samlade',
    narration:
      'Medlemsregistret i GlennBook samlar alla era medlemmar på ett ställe — med medlemskap, kontaktuppgifter och historik.',
    image: await shoot('01-register'),
    focus: table,
    zoom: 1.18,
    cursor: { x: VW * 0.5, y: VH * 0.5 },
  })
}

// === BEAT 2 — search & filter ==============================================
{
  const search = (await inputCenter()) ?? { x: 360, y: 150 }
  const table = fallback(
    await measureText(['Namn', 'Email', 'Andersson', 'Eriksson']),
    { x: 290, y: 150, width: 1100, height: 380 },
  )
  const img = await shoot('02-search')
  let revealImg = null
  try {
    const box = page.getByPlaceholder(/sök/i)
    await box.click()
    await box.type('Eriks', { delay: 120 })
    await page.waitForTimeout(900)
    revealImg = await shoot('02b-search')
    await box.fill('')
  } catch (e) {
    console.log('  search skipped:', e.message.split('\n')[0])
  }
  timeline.push({
    id: 'search',
    kicker: 'SÖK & FILTRERA',
    title: 'Hitta vem som helst',
    narration:
      'Sök fram vem som helst på sekunden — skriv ett namn eller en e-postadress, så filtreras listan direkt.',
    image: img,
    revealImage: revealImg,
    focus: { x: 285, y: 120, width: 700, height: 120 }, // search bar region
    zoom: 1.7,
    cursor: search,
    click: search,
  })
}

// === BEAT 3 — member profile ===============================================
let profileFocus = { x: 290, y: 220, width: 1100, height: 420 }
if (annaId) {
  await page.goto(`${BASE}/t/${SLUG}/members/${annaId}`)
  await settle(1800)
  profileFocus = fallback(
    await measureText(['Medlemskap', 'Lägg till', 'Gold', 'Årsmedlemskap', 'Belopp']),
    { x: 850, y: 265, width: 415, height: 335 },
  )
  timeline.push({
    id: 'profile',
    kicker: 'MEDLEMSPROFIL',
    title: 'Hela medlemmen på ett ställe',
    narration: 'Klicka på en medlem för att se hela profilen: medlemskap, betalningar och aktivitet.',
    image: await shoot('03-profile'),
    focus: profileFocus,
    zoom: 1.3,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
  })
}

// === BEAT 4 — årsavgift vs tillval =========================================
await page.goto(`${BASE}/t/${SLUG}/membership-levels`)
await page.getByRole('heading', { name: /medlemsniv/i }).waitFor({ timeout: 15000 }).catch(() => {})
await settle()
{
  const table = fallback(
    await measureText(['Årsmedlemskap', 'Gold', 'Silver', 'Bronze', 'Tillval', 'Pris']),
    { x: 290, y: 150, width: 1100, height: 320 },
  )
  timeline.push({
    id: 'levels',
    kicker: 'ÅRSAVGIFT & TILLVAL',
    title: 'Två sorters medlemskap',
    narration:
      'Det finns två sorters medlemskap. Ett årsmedlemskap är den årliga avgiften som ger tillgång till klubben. Ett tillval är en löpande prenumeration ovanpå — som Gold, Silver eller Bronze — med extra förmåner.',
    image: await shoot('04-levels'),
    focus: table,
    zoom: 1.26,
    cursor: { x: VW * 0.5, y: VH * 0.4 },
  })
}

// === BEAT 5 — renewals / automatic reminders ===============================
await page.goto(`${BASE}/t/${SLUG}/members/renewals`)
await settle(2000)
{
  const list = fallback(
    await measureText(['Anna Andersson', 'Karin Olsson', 'Maria Nilsson', 'Utgångsdatum', 'Påminnelser']),
    { x: 290, y: 200, width: 1100, height: 300 },
  )
  const remindBtn = await buttonAt(/påminnelse|skicka/i)
  timeline.push({
    id: 'renewals',
    kicker: 'AUTOMATISKA PÅMINNELSER',
    title: 'Inga förnyelser glöms bort',
    narration:
      'När ett medlemskap närmar sig förnyelse dyker det upp här automatiskt, och GlennBook skickar påminnelser åt er — så att ingen medlem glöms bort och inga intäkter tappas.',
    image: await shoot('05-renewals'),
    focus: list,
    zoom: 1.28,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
    cursorTo: remindBtn,
  })
}

// === BEAT 6 — add a member =================================================
await page.goto(`${BASE}/t/${SLUG}/members`)
await page.getByRole('heading', { name: /medlemmar/i }).waitFor({ timeout: 15000 }).catch(() => {})
await settle()
{
  const img = await shoot('06-members-base')
  const dlg = await openDialog('06b-add-member', /lägg till medlem/i, async () => {
    const modal = page.locator('.MuiModal-root').filter({ hasText: /lägg till medlem/i })
    await modal.locator('input[type="email"]').fill('johanna.lind@example.se')
    await page.waitForTimeout(1000)
    const txt = modal.locator('input[type="text"]:visible')
    const n = await txt.count()
    if (n > 0) await txt.nth(0).fill('Johanna')
    if (n > 1) await txt.nth(1).fill('Lind')
  })
  if (dlg.revealImage && dlg.focus) {
    timeline.push({
      id: 'add-member',
      kicker: 'LÄGG TILL MEDLEM',
      title: 'Ny medlem på sekunder',
      narration: 'Och att lägga till en ny medlem tar bara några sekunder.',
      image: img,
      revealImage: dlg.revealImage,
      focus: dlg.focus,
      zoom: 1.16,
      cursor: dlg.btn,
      click: dlg.btn,
    })
  }
}

// --- finalize ---------------------------------------------------------------
writeFileSync(
  join(OUT, 'timeline.json'),
  JSON.stringify({ base: BASE, slug: SLUG, viewport: { w: VW, h: VH }, dsf: DSF, beats: timeline }, null, 2),
)
await ctx.close()
await browser.close()
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'))
if (webm) renameSync(join(OUT, webm), join(OUT, 'session.webm'))
console.log('RECORD_DONE', annaId ? `(profile=${annaId})` : '(no profile id)')
console.log(timeline.map((b) => `${b.id.padEnd(12)} focus=${JSON.stringify(b.focus)} reveal=${!!b.revealImage}`).join('\n'))
