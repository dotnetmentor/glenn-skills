// ---------------------------------------------------------------------------
// Onboarding recorder. Drives the REAL app through the whole get-started flow:
// name your business (/signup) → passwordless OTP login → server provisioning →
// the 7-step setup wizard (resources → hours → rules → pricing → memberships →
// staff → done "Ni är live!"). Captures per beat a screenshot, an optional
// post-interaction reveal shot, the focal element box, and cursor targets.
// Writes out/record/timeline.json so compose.mjs renders it unchanged.
// ---------------------------------------------------------------------------
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
import { mkdirSync, writeFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out', 'record')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:5173'
const EMAIL = 'test@test.com' // dev login (the form prefills this; dev OTP below)
const OTP = '123456'
const ORG = `Padel Center ${Date.now().toString().slice(-5)}` // unique so provisioning always succeeds
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

// --- helpers (shared shape with record.mjs) --------------------------------
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
        if (r.width > 4 && r.height > 4 && r.top >= 0) {
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
    const cands = [...document.querySelectorAll('.MuiModal-root .MuiPaper-root, [role="dialog"], .MuiDialog-paper')]
      .filter((el) => !el.classList.contains('MuiBackdrop-root'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 140 && r.height > 140)
    if (!cands.length) return null
    cands.sort((a, b) => b.width * b.height - a.width * a.height)
    const r = cands[0]
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })

const buttonAt = (reSrc) =>
  page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i')
    const b = [...document.querySelectorAll('button,a')].find((el) => rx.test(el.textContent || ''))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, reSrc)

const settle = async (ms = 1400) => {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForFunction(() => !document.body.textContent.includes('Laddar organisation'), { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const shoot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  return `${name}.png`
}
const fallback = (r, fb) => (r && r.width > 40 && r.height > 24 ? r : fb)
const center = (r) => (r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: VW / 2, y: VH / 2 })
const clickNext = async (re = /nästa|fortsätt/i) => {
  await page.getByRole('button', { name: re }).first().click({ timeout: 6000 }).catch((e) => console.log('  next click:', (e.message || '').split('\n')[0]))
  await settle(1200)
}

const timeline = []

// === BEAT 1 — name your business =========================================
await page.goto(`${BASE}/signup`)
await page.getByText(/vad heter din verksamhet/i).waitFor({ timeout: 15000 }).catch(() => {})
await settle()
{
  const img = await shoot('01-name')
  let reveal = null
  try {
    const box = page.getByPlaceholder(/malmö squash|t\.ex\./i).first()
    await box.click()
    await box.type(ORG, { delay: 60 })
    await page.waitForTimeout(1200) // let slug + "ledig" resolve
    reveal = await shoot('01b-name')
  } catch (e) {
    console.log('  name fill skipped:', e.message.split('\n')[0])
  }
  const card = fallback(await measureText(['Vad heter din verksamhet', 'Din länk', 'Fortsätt']), { x: 430, y: 210, width: 580, height: 430 })
  const cont = (await buttonAt('fortsätt')) ?? center(card)
  timeline.push({
    id: 'name',
    kicker: 'KOM IGÅNG',
    title: 'Döp din verksamhet',
    narration: 'Att komma igång tar bara minuter. Börja med att döpa din verksamhet — länken till er portal skapas direkt.',
    image: img,
    revealImage: reveal,
    focus: card,
    zoom: 1.25,
    cursor: { x: VW * 0.5, y: VH * 0.5 },
    cursorTo: cont,
    click: true,
  })
}

// === BEAT 2 — passwordless OTP login ======================================
await page.getByRole('button', { name: /fortsätt/i }).first().click({ timeout: 6000 }).catch((e) => console.log('  open login:', e.message.split('\n')[0]))
await page.getByText(/välkommen tillbaka|logga in|e-?post/i).first().waitFor({ timeout: 10000 }).catch(() => {})
await page.waitForTimeout(900)
{
  // email step — clear any prefilled dev value first, then type for the animation
  const emailBox = page.getByPlaceholder(/e-?post/i).first()
  await emailBox.click().catch(() => {})
  await emailBox.fill('').catch(() => {})
  await emailBox.type(EMAIL, { delay: 50 }).catch(() => {})
  await page.waitForTimeout(500)
  const img = await shoot('02-otp-email')
  // submit email → code step
  await page.locator('.MuiModal-root, [role="dialog"]').getByRole('button', { name: /fortsätt/i }).first().click({ timeout: 6000 }).catch((e) => console.log('  send otp:', e.message.split('\n')[0]))
  await page.getByText(/kolla din e-?post|kod/i).first().waitFor({ timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(800)
  const codeBox = page.getByPlaceholder(/0{4,}/).first()
  await codeBox.click().catch(() => {})
  await codeBox.type(OTP, { delay: 90 }).catch(() => {})
  await page.waitForTimeout(600)
  const reveal = await shoot('02b-otp-code')
  const dlg = fallback(await measureDialog(), { x: 470, y: 200, width: 500, height: 460 })
  timeline.push({
    id: 'login',
    kicker: 'SÄKER INLOGGNING',
    title: 'Logga in utan lösenord',
    narration: 'Du loggar in säkert med din e-post, helt utan lösenord. Vi skickar en engångskod — inget kort behövs.',
    image: img,
    revealImage: reveal,
    focus: dlg,
    zoom: 1.35,
    cursor: center(dlg),
  })
  // verify → provisioning → setup wizard
  await page.getByRole('button', { name: /verifiera/i }).first().click({ timeout: 6000 }).catch((e) => console.log('  verify:', e.message.split('\n')[0]))
}

// wait for provisioning to drop us into the setup wizard
await page.waitForURL(/\/setup(\/|$)/, { timeout: 30000 }).catch(() => console.log('  no /setup redirect — url:', page.url()))
await settle(2200)
const SLUG = (page.url().match(/\/t\/([^/]+)\//) || [])[1] || 'e2e-test'
console.log('  provisioned slug:', SLUG, 'url:', page.url())

// helper to land on a wizard step by url (robust even if a Next button is gated)
const goStep = async (step) => {
  await page.goto(`${BASE}/t/${SLUG}/setup/${step}`)
  await settle(1500)
}

// === BEAT 3 — resources ===================================================
await goStep('resources')
await page.getByText(/vad ska gå att boka/i).waitFor({ timeout: 12000 }).catch(() => {})
{
  // give the first category a name so the page looks alive
  try {
    const nameBox = page.getByPlaceholder(/bastu|padelbana|mötesrum|t\.ex\./i).first()
    await nameBox.click({ timeout: 6000 })
    await nameBox.type('Padelbana', { delay: 60 })
    await page.waitForTimeout(700)
  } catch (e) { console.log('  resource fill:', e.message.split('\n')[0]) }
  const card = fallback(await measureText(['Vad ska gå att boka', 'Antal deltagare', 'Lägg till en kategori']), { x: 360, y: 180, width: 760, height: 430 })
  timeline.push({
    id: 'resources',
    kicker: 'STEG 1 · RESURSER',
    title: 'Vad ska gå att boka?',
    narration: 'Sen beskriver du vad som ska gå att boka — banor, salar eller andra resurser. Allt går att ändra senare.',
    image: await shoot('03-resources'),
    focus: card,
    zoom: 1.2,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
  })
}

// === BEAT 4 — hours =======================================================
await goStep('hours')
await page.getByText(/när har du öppet/i).waitFor({ timeout: 12000 }).catch(() => {})
{
  const card = fallback(await measureText(['När har du öppet', 'Måndag', 'Tisdag', 'Öppet']), { x: 360, y: 180, width: 760, height: 440 })
  timeline.push({
    id: 'hours',
    kicker: 'STEG 2 · ÖPPETTIDER',
    title: 'När har du öppet?',
    narration: 'Ställ in era öppettider, så vet systemet exakt när det går att boka.',
    image: await shoot('04-hours'),
    focus: card,
    zoom: 1.22,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
  })
}

// === BEAT 5 — booking rules ===============================================
await goStep('rules')
await page.getByText(/hur vill du att bokningar/i).waitFor({ timeout: 12000 }).catch(() => {})
{
  const card = fallback(await measureText(['Hur vill du att bokningar', 'avbok', 'Tidslängd', 'minuter']), { x: 360, y: 180, width: 760, height: 440 })
  timeline.push({
    id: 'rules',
    kicker: 'STEG 3 · BOKNINGSREGLER',
    title: 'Så fungerar bokningar',
    narration: 'Bestäm hur bokningar ska fungera — tidslängder, avbokningsregler och hur långt fram man kan boka.',
    image: await shoot('05-rules'),
    focus: card,
    zoom: 1.2,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
  })
}

// === BEAT 6 — pricing =====================================================
await goStep('pricing')
await page.getByText(/vad kostar en bokning/i).waitFor({ timeout: 12000 }).catch(() => {})
{
  try {
    const priceBox = page.locator('main input, [role="main"] input, input').first()
    await priceBox.click({ timeout: 6000 }); await priceBox.fill('200'); await page.waitForTimeout(500)
  } catch (e) { console.log('  price fill:', e.message.split('\n')[0]) }
  const card = fallback(await measureText(['Vad kostar en bokning', 'pris', 'kr']), { x: 360, y: 180, width: 720, height: 360 })
  timeline.push({
    id: 'pricing',
    kicker: 'STEG 4 · PRIS',
    title: 'Vad kostar en bokning?',
    narration: 'Sätt ett pris för en bokning. Du kan lägga till mer avancerad prissättning när som helst.',
    image: await shoot('06-pricing'),
    focus: card,
    zoom: 1.3,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
  })
}

// === BEAT 7 — memberships =================================================
await goStep('memberships')
await page.getByText(/vilka medlemskap/i).waitFor({ timeout: 12000 }).catch(() => {})
{
  try {
    const tier = page.getByPlaceholder(/guld|student|vuxen|t\.ex\./i).first()
    await tier.click({ timeout: 6000 }); await tier.type('Guld', { delay: 60 }); await page.waitForTimeout(600)
  } catch (e) { console.log('  membership fill:', e.message.split('\n')[0]) }
  const card = fallback(await measureText(['Vilka medlemskap', 'kr/mån', 'Lägg till medlemskap']), { x: 360, y: 180, width: 760, height: 420 })
  timeline.push({
    id: 'memberships',
    kicker: 'STEG 5 · MEDLEMSKAP',
    title: 'Vilka medlemskap vill ni sälja?',
    narration: 'Skapa de medlemskap ni vill sälja — medlemmarna köper och betalar dem direkt i portalen.',
    image: await shoot('07-memberships'),
    focus: card,
    zoom: 1.22,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
  })
}

// === BEAT 8 — staff =======================================================
await goStep('staff')
await page.getByText(/vill du bjuda in personal/i).waitFor({ timeout: 12000 }).catch(() => {})
{
  try {
    const mail = page.getByPlaceholder(/kollega@|exempel\.se/i).first()
    await mail.click({ timeout: 6000 }); await mail.type('kollega@klubben.se', { delay: 50 }); await page.waitForTimeout(500)
  } catch (e) { console.log('  staff fill:', e.message.split('\n')[0]) }
  const card = fallback(await measureText(['Vill du bjuda in personal', 'Administratör', 'Reception', 'Lägg till kollega']), { x: 360, y: 180, width: 760, height: 420 })
  timeline.push({
    id: 'staff',
    kicker: 'STEG 6 · PERSONAL',
    title: 'Bjud in ditt team',
    narration: 'Bjud in kollegor och ge dem rätt behörighet — administratör eller reception.',
    image: await shoot('08-staff'),
    focus: card,
    zoom: 1.22,
    cursor: { x: VW * 0.5, y: VH * 0.45 },
  })
}

// === BEAT 9 — done / live =================================================
await goStep('done')
await page.getByText(/allt redo|ni är live|slutför/i).first().waitFor({ timeout: 12000 }).catch(() => {})
{
  const img = await shoot('09-review')
  let reveal = null
  try {
    await page.getByRole('button', { name: /slutför/i }).first().click({ timeout: 6000 })
    await page.getByText(/ni är live/i).waitFor({ timeout: 30000 })
    await settle(1800)
    reveal = await shoot('09b-live')
  } catch (e) {
    console.log('  finish skipped:', e.message.split('\n')[0])
  }
  const card = fallback(await measureText(['Ni är live', 'medlemsportal', 'Kopiera']), { x: 360, y: 150, width: 760, height: 480 })
  timeline.push({
    id: 'live',
    kicker: 'KLART',
    title: 'Ni är live!',
    narration: 'Klart! Er medlemsportal är live. Dela länken så kan medlemmarna hitta er, boka och betala direkt.',
    image: reveal ? img : img, // base shot; reveal cross-dissolves to the live screen
    revealImage: reveal,
    focus: card,
    zoom: 1.18,
    cursor: { x: VW * 0.5, y: VH * 0.5 },
  })
}

// --- finalize --------------------------------------------------------------
writeFileSync(
  join(OUT, 'timeline.json'),
  JSON.stringify({ base: BASE, slug: SLUG, viewport: { w: VW, h: VH }, dsf: DSF, beats: timeline }, null, 2),
)
await ctx.close()
await browser.close()
const webm = readdirSync(OUT).find((f) => f.endsWith('.webm'))
if (webm) renameSync(join(OUT, webm), join(OUT, 'session.webm'))
console.log('RECORD_DONE — beats:', timeline.length, 'slug:', SLUG)
console.log(timeline.map((b) => `${b.id.padEnd(12)} focus=${JSON.stringify(b.focus)} reveal=${!!b.revealImage}`).join('\n'))
