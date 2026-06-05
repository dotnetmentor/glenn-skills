// ---------------------------------------------------------------------------
// Post-build prerender for a Vite SPA: render public routes to static HTML so
// crawlers get full markup, generate a 1200x630 OG card, and write a sitemap.
//
// Usage:  vite build && node prerender.mjs        (e.g. "build:prerender")
//   env:  SITE_URL=https://example.com   (base for the sitemap)
// CI / Docker frontend stage needs a Chromium (e.g. the Playwright base image).
//
// Adapt: the `routes` list (or derive it), the OG card markup, and SITE_URL.
// Indexing is NOT decided here — that's a runtime decision in the backend/host
// (see references/prerender-and-indexing.md), so this artifact is index-ready
// and identical for every environment.
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { preview } from 'vite'
import { chromium } from 'playwright-core'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const distDir = join(root, 'dist')
const SITE_URL = (process.env.SITE_URL || 'https://example.com').replace(/\/$/, '')
const PORT = 4178

// Derive content routes from your content dirs so new articles are auto-included.
const contentSlugs = (dir) =>
  readdirSync(join(root, dir)).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
// const guideSlugs = contentSlugs('src/content/guides')

// Build-time-known public routes (add use-case pages, docs, guides, etc.).
const routes = [
  '/',
  // ...marketingPaths,
  // '/guides', ...guideSlugs.map((s) => `/guides/${s}`),
]

const outPathFor = (route) =>
  route === '/' ? join(distDir, 'index.html') : join(distDir, route.replace(/^\//, ''), 'index.html')

async function renderOgCard(page) {
  // Inline the OG card markup (or read assets/og-card.html). Keep it on-brand.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:1200px;height:630px;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;
      background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;display:flex;flex-direction:column;
      justify-content:center;padding:90px}
    .brand{font-size:40px;font-weight:800}
    h1{font-size:72px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin-top:28px;max-width:950px}
    p{font-size:30px;opacity:.92;margin-top:24px;max-width:900px}
  </style></head><body>
    <div class="brand">Example</div>
    <h1>Your one-line value proposition</h1>
    <p>Who it's for and what they get.</p>
  </body></html>`
  await page.setViewportSize({ width: 1200, height: 630 })
  await page.setContent(html, { waitUntil: 'networkidle' })
  mkdirSync(join(distDir, 'og'), { recursive: true })
  await page.screenshot({ path: join(distDir, 'og', 'og-default.png'), type: 'png' })
  console.log('  ✓ og/og-default.png (1200x630)')
}

async function run() {
  const server = await preview({ root, preview: { port: PORT, strictPort: true } })
  const base = `http://localhost:${PORT}`
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()

  for (const route of routes) {
    await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(400) // let per-page head effects settle
    const out = outPathFor(route)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, await page.content(), 'utf8')
    console.log(`  ✓ ${route}`)
  }
  await renderOgCard(page)
  await browser.close()
  await server.httpServer.close()

  // sitemap-core.xml (static routes). Dynamic entities are served by the backend
  // as a sitemap index; see references/prerender-and-indexing.md.
  const today = new Date().toISOString().slice(0, 10)
  const body = routes
    .map((u) => `  <url>\n    <loc>${SITE_URL}${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`)
    .join('\n')
  writeFileSync(
    join(distDir, 'sitemap-core.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    'utf8',
  )
  console.log(`  ✓ sitemap-core.xml (${routes.length} urls)`)
}

run().catch((err) => {
  console.error('Prerender failed:', err)
  process.exit(1)
})
