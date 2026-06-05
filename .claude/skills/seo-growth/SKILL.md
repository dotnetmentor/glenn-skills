---
name: seo-growth
description: >-
  Rewrite a product's landing/marketing pages to be conversion-focused and add a
  complete modern SEO + organic-growth layer: per-page metadata, structured data
  (JSON-LD), sitemaps, SPA prerendering, per-environment indexing, programmatic
  use-case/industry landing pages, a content/guides hub, per-entity public landing
  pages (e.g. per-venue/per-city) with LocalBusiness schema, Open Graph cards, and
  internal linking. Use when asked to: rewrite or improve a landing page, make a
  site more SEO-friendly or "rank on Google", add structured data / Open Graph /
  sitemaps / canonical / hreflang / robots, build use-case, per-city or
  per-customer landing pages, set up prerendering so crawlers see content in a
  client-rendered SPA, fix a marketing site's discoverability, or keep marketing
  content and SEO from drifting over time.
---

# SEO & organic-growth for product / marketing sites

A playbook for turning a generic SPA marketing surface into a conversion-focused,
crawlable, well-ranked site. Distilled from a real build (React + Vite frontend,
.NET backend) but the patterns are stack-agnostic — adapt the code samples.

## How to use this skill

1. **Audit first.** Curl the rendered HTML (`curl -s <url> | head`) and check the
   `<head>`: is content present in the raw HTML (or only after JS)? Is `lang`
   correct? Are `<title>`/description unique per route? Any canonical, OG,
   structured data, sitemap, robots? Note what's missing — that's the backlog.
2. **Pick the work** from the phases below. They're roughly ordered by ROI; do
   the technical foundation before scaling pages.
3. **Read the matching reference file** for patterns + copy-paste snippets.
4. **Verify**: re-curl the built/prerendered HTML, and validate every JSON-LD
   block in Google's Rich Results Test before claiming done.

## Phases (ordered by ROI)

### Phase 1 — Conversion landing page
Rewrite the landing page around the actual buyer (not features-first). Hero,
real product screenshots, problem→solution sections, a single primary CTA, honest
localized copy, and crawlable internal links.
→ See `references/conversion-landing-page.md`.

### Phase 2 — Technical SEO foundation (highest ROI, low effort)
Per-page `<title>`/description/canonical/hreflang/OG/Twitter via one shared
helper; `lang`; a real Open Graph card; and JSON-LD (Organization + WebSite +
SoftwareApplication on home; FAQPage/BreadcrumbList/Article elsewhere). This
alone usually beats most competitors' head layer.
→ See `references/technical-seo.md`. Reusable hook: `assets/usePageSeo.ts`.

### Phase 3 — Crawlability: prerendering, sitemaps, per-env indexing
Make an SPA's content present in raw HTML (prerender public routes). Generate a
sitemap. Decide indexing **at runtime per environment** (dev = noindex, prod =
indexable) — never bake it into a build if dev and prod ship the same artifact.
→ See `references/prerender-and-indexing.md`. Reusable: `assets/prerender.mjs`,
`assets/og-card.html`.

### Phase 4 — Programmatic pages (the growth engine)
Data-driven **use-case / industry landing pages** (one per vertical, with
genuinely distinct copy + FAQ), a **content/guides hub** (answer-first articles
targeting real questions), and — if the product has many public entities
(venues, stores, profiles) — **per-entity public landing pages** with
`LocalBusiness`/`SportsActivityLocation` schema. For dynamic entities that can't
be prerendered, inject the `<head>` at request time server-side.
→ See `references/programmatic-pages.md`.

### Phase 5 — Keep it fresh
A scheduled agent that keeps landing copy, guides and the SEO layer in sync with
the product, and spots content/keyword gaps.
→ See `references/maintenance-agent.md`.

## Non-negotiable principles

- **Unique per route.** No two indexable pages share a `<title>` or description.
- **Content in raw HTML.** If a crawler must run JS to see your content, prerender
  it (or SSR the head). Don't rely on Googlebot's JS rendering.
- **One source of truth for the head.** A single `usePageSeo`-style helper sets
  title/description/canonical/OG/Twitter/JSON-LD. Don't scatter `<meta>` edits.
- **Indexing is runtime, not build-time** when one image serves multiple
  environments. Default to `noindex`; opt prod in via config.
- **Real anchors, not `onClick` navigation**, for links you want crawled.
- **Distinct copy per programmatic page.** Thin/near-duplicate pages hurt ranking.
  Each vertical/entity page needs its own value props + FAQ.
- **Only emit structured-data fields you have.** Omit empty fields; validate.
- **Canonicals/OG always point at the production domain**, even on dev.
- **Honest, localized copy.** No SaaS clichés ("all in one place"), no invented
  claims; match the site's language and the buyer's vocabulary.

## Security note (tenant/user-supplied content)

If users can supply URLs/images that render into public HTML or OG/JSON-LD
(logos, websites, hero images), validate them server-side: allow only `http(s)`
(reject `javascript:`, `data:`, protocol-relative `//`), and render external
links with `rel="noopener noreferrer nofollow"`. Otherwise it's stored XSS /
open-redirect on your own domain.

## Verification checklist

- `curl -s <prod-url>` shows: correct `lang`, a descriptive unique `<title>`,
  meta description, full OG set (+ `og:image` 1200×630), Twitter card,
  self-canonical, hreflang, and the expected JSON-LD.
- Every indexable route has a unique title + description.
- A sitemap exists, lists the real public routes, and is referenced by robots.txt.
- Dev/staging return `noindex`; prod allows crawling and blocks private funnels.
- All JSON-LD passes Google's Rich Results Test.
- Lighthouse SEO ≥ 95 on home and a sample programmatic page.
