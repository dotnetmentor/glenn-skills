# Programmatic pages: the growth engine

Scaling from one landing page to many targeted, ranking pages. Three layers:
use-case/industry pages, a content/guides hub, and per-entity public pages.

## Contents
- Keyword clusters first
- Layer A: use-case / industry landing pages
- Layer B: content/guides hub
- Layer C: per-entity public pages (runtime head injection)
- Internal linking

## Keyword clusters first

List the intents you want to own, split by funnel stage:
- **Commercial** ("booking system for padel", "membership software for gyms",
  "[product] for [industry]") → use-case pages (Layer A).
- **Informational** ("how do I add member discounts", "how to run a padel club")
  → guides (Layer B). These are the questions real prospects ask before they know
  they want you.
- **Local/entity** ("[city] padel book", "[venue name]") → per-entity pages
  (Layer C).

## Layer A: use-case / industry landing pages

One page per vertical/use-case, **data-driven** so adding a vertical is a data
entry, not a new component. Keep a typed array of `{ path, title, metaDescription,
h1, intro, benefits[], faq[], relatedGuides[] }` and a single page component that
renders by path.

Each page **must have genuinely distinct copy** — different pain points, benefits
and FAQ per vertical. Near-duplicate pages get filtered by Google and can hurt the
whole cluster. Add the page paths to routing, the prerender list, the sitemap, and
the public-route/auth bypass.

Per page: an `<h1>` with the key phrase, a real product screenshot, benefit cards,
a **visible** FAQ (rendered as `FAQPage` JSON-LD), and CTAs. Cross-link to related
guides.

## Layer B: content/guides hub

Top-of-funnel articles, separate from product help docs. Checked-in markdown with
frontmatter (`title, category, order, summary, updated`) loaded by a small
registry; rendered at `/guides` + `/guides/:slug`; included in prerender + sitemap.

- **Answer-first**: each article answers its title question in the first
  paragraph (featured-snippet friendly), then expands.
- **Cross-link** every guide to ≥1 relevant use-case page and ≥1 product doc, and
  back. Use real anchors.
- `Article` + `BreadcrumbList` JSON-LD; `updated` feeds sitemap `lastmod`.

## Layer C: per-entity public pages (runtime head injection)

If the product has many public entities (venues, stores, profiles), each deserves
an indexable page at a clean URL (`/k/{slug}`, `/v/{slug}`, ...) with
`LocalBusiness`/subtype schema. **These can't be prerendered** — entities are
created at runtime. Two options:

1. **SSR/SSG-on-demand** if your framework supports it (Next ISR, etc.).
2. **Runtime `<head>` injection** for an SPA served by your own backend:
   middleware matches `GET /{prefix}/{slug}`, looks up the entity, reads the
   cached `index.html` shell, and splices per-entity `<title>`, meta, canonical,
   OG and `LocalBusiness` JSON-LD before `</head>` (strip the shell's static
   `<title>`/description first to avoid duplicates). The SPA then hydrates the
   body, so content is in the raw HTML.

Essentials for Layer C:
- A public, anonymous read endpoint returning everything the schema needs (incl.
  aggregated opening hours: one spec per distinct window).
- Cache the lookup (short TTL `IMemoryCache`, invalidated on entity update) — the
  hot path is hit by crawlers; don't stampede the DB.
- Gate indexing on the entity's visibility flag (noindex + sitemap-exclude when
  unlisted/opted-out).
- Validate any tenant-supplied URLs/images server-side (see SKILL.md security
  note) before they enter the public head.
- A DB-driven `sitemap-entities.xml` with real `lastmod`, excluding non-indexable
  entities.

## Internal linking

Link generously and crawlably: landing nav + footer → use-case pages + guides;
guides ↔ docs ↔ use-case pages; use-case pages → relevant entity pages. Real
anchors only. This both helps users and spreads link equity across the cluster.
