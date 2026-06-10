# Prerendering, sitemaps & per-environment indexing

Make a client-rendered SPA crawlable, ship a sitemap, and control indexing
per environment. Reusable: `assets/prerender.mjs`, `assets/og-card.html`.

## Contents
- Prerender static public routes
- Sitemaps (static core + dynamic index)
- Per-environment indexing at RUNTIME (the shared-image gotcha)
- robots.txt

## Prerender static public routes

Crawlers should see content in the **raw HTML**. For a build-time-known route set
(landing, use-case pages, docs, guides), prerender to static HTML:

1. `vite build` (or your bundler) to produce the SPA.
2. Serve `dist` locally (`vite preview`), drive a headless browser (Playwright)
   to each public route, wait for network idle + a short settle so the per-page
   head effects run, and write `page.content()` to `dist/<route>/index.html`.
3. The backend/host then serves these static files; the SPA hydrates on load.

`assets/prerender.mjs` does exactly this, plus writes the sitemap and the OG card.
The Docker/CI frontend stage needs a Chromium (e.g. the Playwright base image).

If you use an SSG/SSR framework (Next, Astro, Remix), you get this for free — skip
the manual prerender and use the framework's static/SSR output.

## Sitemaps

- Build-time routes → write `sitemap-core.xml` during prerender (derive doc/guide
  routes from the content dir so new articles are auto-included).
- If you also have **dynamic** entities (per-venue pages from a DB), the backend
  serves `/sitemap.xml` as a **sitemap index** referencing `sitemap-core.xml`
  plus a `sitemap-entities.xml` generated from the DB (only indexable entities,
  real per-entity `lastmod`).
- Reference the sitemap from robots.txt.

## Per-environment indexing — decide it at RUNTIME

**The gotcha:** if dev and prod deploy the *same build artifact* (same Docker
image), you cannot bake indexing into the build — dev would become indexable too.
Decide it at runtime in the backend/host from config:

- A flag like `Seo:Indexable` (default **false** = safe).
- When **not** indexable (dev/staging): every response gets
  `X-Robots-Tag: noindex, nofollow` and `/robots.txt` returns `Disallow: /`. The
  site stays fully usable in a browser; only indexing is blocked.
- When indexable (prod): no noindex header; `/robots.txt` returns `Allow: /`,
  disallows private funnels (login/signup/api/admin), and advertises the sitemap.

Default-false means any environment that forgets to opt in is safe. Canonicals
and `og:url` still point at the production domain everywhere.

For per-entity pages, also gate indexing on the entity's own visibility flag
(e.g. `IsPublicListed` / `IsSearchEngineIndexable`): unlisted/opted-out entities
get `noindex` and are excluded from the sitemap. Mirror that on client navigation
(a `robots: 'noindex'` option on the head helper) so JS-rendering crawlers see it
too.

## robots.txt (production example)

```
User-agent: *
Allow: /
Disallow: /signup
Disallow: /api/
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
```
