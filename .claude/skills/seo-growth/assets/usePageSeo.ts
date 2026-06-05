import { useEffect } from 'react'

// ---------------------------------------------------------------------------
// Reusable per-page SEO hook for a client-rendered (Vite) React SPA. Sets the
// document title, meta description, canonical link, hreflang alternates, Open
// Graph + Twitter tags, an optional robots directive, and optional JSON-LD.
//
// Adapt: set SITE_URL, DEFAULT_* and LOCALE. For an SSR/SSG framework (Next,
// Astro), use the framework's head/metadata API instead — same fields.
//
// Runs in useEffect (client). A prerender step (see prerender.mjs) snapshots the
// DOM after effects settle, so these tags end up in the static HTML too.
// ---------------------------------------------------------------------------

export const SITE_URL = 'https://example.com' // production origin (used even on dev)
const LOCALE = 'en'                            // 'sv', 'de', ...
const DEFAULT_IMAGE = '/og/og-default.png'     // 1200x630 card (see prerender.mjs)
const DEFAULT_IMAGE_W = 1200
const DEFAULT_IMAGE_H = 630
const DEFAULT_TITLE = 'Example — product tagline'

export interface PageSeo {
  /** Full <title>, unique per page, key phrase in the first half. */
  title: string
  /** Meta description (~140-160 chars), unique per page. */
  description: string
  /** Canonical path, e.g. '/use-cases/padel'. Combined with SITE_URL. */
  path: string
  type?: 'website' | 'article'
  /** Absolute or root-relative social image; defaults to the branded card. */
  image?: string
  /** 'noindex' to emit a robots meta on client navigation (runtime-gated pages). */
  robots?: 'noindex'
  /** One or more JSON-LD objects. */
  jsonLd?: object | object[]
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string, extraAttr?: [string, string]) {
  const sel = extraAttr ? `link[rel="${rel}"][${extraAttr[0]}="${extraAttr[1]}"]` : `link[rel="${rel}"]`
  let el = document.head.querySelector<HTMLLinkElement>(sel)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    if (extraAttr) el.setAttribute(extraAttr[0], extraAttr[1])
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function usePageSeo({ title, description, path, type = 'website', image, robots, jsonLd }: PageSeo) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : ''
  useEffect(() => {
    const url = `${SITE_URL}${path}`
    const usingDefault = !image
    const img = image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : `${SITE_URL}${DEFAULT_IMAGE}`

    document.title = title
    upsertMeta('meta[name="description"]', 'name', 'description', description)
    upsertLink('canonical', url)
    upsertLink('alternate', url, ['hreflang', LOCALE])
    upsertLink('alternate', url, ['hreflang', 'x-default'])

    if (robots === 'noindex') {
      upsertMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow')
    } else {
      document.head.querySelector('meta[name="robots"]')?.remove()
    }

    upsertMeta('meta[property="og:title"]', 'property', 'og:title', title)
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description)
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', type)
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url)
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', img)
    upsertMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', title)
    if (usingDefault) {
      upsertMeta('meta[property="og:image:width"]', 'property', 'og:image:width', String(DEFAULT_IMAGE_W))
      upsertMeta('meta[property="og:image:height"]', 'property', 'og:image:height', String(DEFAULT_IMAGE_H))
    }
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title)
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description)
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', img)

    const SCRIPT_ID = 'page-jsonld'
    document.getElementById(SCRIPT_ID)?.remove()
    if (jsonLd) {
      const s = document.createElement('script')
      s.id = SCRIPT_ID
      s.type = 'application/ld+json'
      s.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(s)
    }

    return () => {
      document.title = DEFAULT_TITLE
      document.getElementById(SCRIPT_ID)?.remove()
      document.head.querySelector('meta[name="robots"]')?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, type, image, robots, jsonLdKey])
}
