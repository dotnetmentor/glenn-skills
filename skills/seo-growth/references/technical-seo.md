# Technical SEO foundation

The `<head>` layer + structured data. Highest ROI, low effort. A reusable React
hook is in `assets/usePageSeo.ts` — copy and adapt it.

## Contents
- One shared per-page head helper
- Global `<head>` defaults (lang, viewport, defaults)
- Open Graph image (1200×630)
- JSON-LD by page type
- Validation

## One shared per-page head helper

Set everything from a single function so pages stay consistent and nothing is
forgotten. The helper sets, per route: `document.title`, meta description,
`<link rel="canonical">`, `hreflang` alternates, `og:*` and `twitter:*`, and a
`<script type="application/ld+json">`. See `assets/usePageSeo.ts`.

Each page calls it once with its own values:

```ts
usePageSeo({
  title: 'Booking system for padel clubs | Acme',
  description: 'Members book courts in the app...',  // unique, ~140-160 chars
  path: '/use-cases/padel',                          // canonical path
  jsonLd: [/* SoftwareApplication, FAQPage, ... */],
})
```

Rules: titles ~≤60 chars with the keyword in the first half; `{value} | Brand`
format (brand last) except the homepage (brand first); descriptions unique,
benefit + CTA. Canonical + `og:url` use the **production** origin even on dev.

In an SSR/SSG framework use its head API (e.g. Next `metadata` /
`generateMetadata`) instead of a `useEffect` hook — same fields.

## Global `<head>` defaults (index.html)

- `<html lang="xx">` — set the real content language. A wrong/missing `lang`
  hurts ranking and accessibility.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` — do
  **not** add `maximum-scale`/`user-scalable=no` (accessibility + Lighthouse
  penalty).
- Static defaults: `og:site_name`, `og:locale`, `twitter:card=summary_large_image`,
  a default description + title (overridden per page).

## Open Graph image (1200×630)

Don't reuse a bare logo. Generate a branded 1200×630 card. If a headless browser
is already in the build (e.g. for prerendering), render an HTML template to PNG —
no extra tooling. Template: `assets/og-card.html`; generation is shown in
`assets/prerender.mjs`. Emit `og:image:width/height/alt`.

## JSON-LD by page type

Emit only fields you have; validate every block.

- **Homepage** — an `@graph` linking three nodes by `@id`:
  `Organization` (name, url, logo, sameAs), `WebSite` (url, name, inLanguage,
  publisher → Organization), `SoftwareApplication` (applicationCategory,
  operatingSystem, offers).
- **Use-case / comparison pages** — `FAQPage` (from a visible FAQ on the page —
  the Q&A must exist in the DOM, not only in JSON-LD) + `BreadcrumbList`.
  Optionally `SoftwareApplication`.
- **Articles / guides / docs** — `Article` (headline, description, dateModified,
  author/publisher) + `BreadcrumbList`.
- **Per-entity public pages** (venues, stores, profiles) —
  `LocalBusiness` or a subtype like `SportsActivityLocation`: name, url, image,
  description, telephone, `address` (PostalAddress), `geo`, `sport`/category,
  `openingHoursSpecification`, `potentialAction` (e.g. ReserveAction). Emit one
  `OpeningHoursSpecification` per **distinct** window — never collapse disjoint
  windows (07–12 + 16–22) into one 07–22 with min/max.

## Validation

- Google Rich Results Test for every JSON-LD type before merge.
- After building, grep the rendered HTML to confirm tags are present and unique:
  `grep -oE '<title>[^<]*</title>|rel="canonical"[^>]*|application/ld\+json'`.
