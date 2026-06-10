# Conversion-focused landing page

Rewriting a generic SPA landing page into one that converts the real buyer.

## Contents
- Identify the buyer
- Structure (hero → proof → problem/solution → differentiator → CTA)
- Real product screenshots
- Copy guidelines
- Internal links (crawlable)
- Image performance

## Identify the buyer

First decide *who* the page sells to. A product often has two audiences (e.g. the
operator who pays, and their end-users). The landing page should lead with the
**buyer** (who signs up/pays), and show the end-user experience as a benefit
("your members get an app"), not bury the buyer's value.

Write down: who is the buyer, what's their job, where does it hurt today, and
what does success look like. Every section answers one of those.

## Structure that works

1. **Hero**: one clear value proposition (what + for whom), a primary CTA, and a
   secondary CTA (e.g. "See how it works" scrolling to a product section). Show
   the product immediately — a real screenshot in a browser/phone frame beats an
   abstract illustration.
2. **Product section ("how it works")**: 3–6 feature rows, each = a real
   screenshot + a benefit-led heading + one sentence. Lead with the outcome, not
   the feature name.
3. **Problem → solution**: name the pain the buyer feels today and show the fix.
   Keep it positive and specific; don't strawman.
4. **Differentiator / community / moat**: why you vs. the obvious alternative —
   framed as what you uniquely enable, not as trash-talk.
5. **Social proof** if available (logos, numbers, quotes).
6. **Final CTA** band.
7. **Footer with a real sitemap of internal links** (see below).

## Real product screenshots

Capture actual UI, not mockups. Drive the app with a headless browser
(Playwright), authenticate as a demo/seed user, seed realistic data, navigate to
each screen, and screenshot at a 1280–1600px viewport. Frame desktop shots in a
browser chrome and mobile shots in a phone bezel for polish. Store under the
public assets dir and reference from the feature rows.

Auth gotcha: if the dev auth cookie is `Secure`+`SameSite=None`, it won't be
stored over plain `http://localhost`. Either run over https, or pass the token as
an `Authorization: Bearer` header on the browser context if the API accepts both.

## Copy guidelines

- Match the site's **language** and the buyer's vocabulary. Localize fully.
- **No SaaS clichés** ("all-in-one platform", "everything in one place",
  "supercharge"). No invented claims or fake urgency.
- Benefit-led headings; one idea per sentence. Scannable.
- Frame the alternative positively ("build your own community" beats "X is bad").
- Be honest about what's shipped vs. coming.

## Internal links must be crawlable

A very common SPA mistake: footer/nav "links" are `<button onClick={navigate()}>`,
which crawlers don't follow. Use real anchors (`<a href>` / router `Link` that
renders an `<a>`) for anything you want indexed. Add a **sitemap-style footer**
with columns of links to your use-case pages, guides, docs, and key routes — this
both helps users and gives crawlers a path through the site.

## Image performance (Core Web Vitals)

Marketing screenshots are heavy. For each `<img>`:
- `loading="lazy"` below the fold; `loading="eager"` + `fetchpriority="high"`
  for the 1–2 hero images.
- `decoding="async"`.
- Reserve the aspect ratio (`aspect-ratio` CSS or width/height attrs) so the page
  doesn't shift as images load (CLS).
- Prefer WebP/AVIF; lazy-loading already removes most first-paint cost.
