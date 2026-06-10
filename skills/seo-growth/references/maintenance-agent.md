# Maintenance agent (keep content & SEO fresh)

Marketing copy, guides and the SEO layer rot as the product ships. A scheduled
(e.g. nightly) agent is the safety net. Below is a generic task prompt to adapt
and point a scheduled trigger at (e.g. Claude Code on the web scheduled session).

Run it incrementally: store the last processed commit SHA and diff
`git log --since=<last-run>` over the app source so each run only checks what
changed. Make safe mechanical fixes directly; for anything ambiguous or an
intentional-looking product change, summarize instead of guessing. Keep diffs
minimal.

---

## Prompt template

> You keep the public content and SEO of this site from drifting. Read the SEO
> setup docs first. Work the three sections in order and commit safe fixes;
> summarize anything ambiguous.
>
> **1. Landing + use-case pages.** For features touched since the last run,
> confirm the landing and use-case copy still describe them correctly. Check
> every use-case page still has distinct copy, a visible FAQ, an `<h1>` with its
> key phrase, and valid FAQPage/Breadcrumb JSON-LD. Only edit marketing page
> content.
>
> **2. Guides / content hub.** For each guide: accuracy vs. the current product,
> answer-first first paragraph, resolving cross-links (to docs + use-case pages),
> and frontmatter (`updated` bumped when the body changes). Add guides for newly
> shipped features without a how-to and for obvious keyword-cluster gaps. Only
> edit the guides content dir.
>
> **3. SEO surface.** Every indexable public route emits a unique
> title/description, self-canonical, hreflang and the right OG/JSON-LD (no two
> routes share a title/description). The prerender route list + sitemap cover all
> public routes; new routes are added to both, plus the public-route/auth bypass.
> Per-environment indexing still holds (dev `noindex`, prod allows content +
> blocks private funnels) — never bake indexing into the build. Per-entity pages:
> the schema exposes every needed field, noindex/sitemap-exclude for
> unlisted/opted-out entities. Re-run the prerender build and validate any changed
> JSON-LD. SEO edits are additive — never silent UX/product changes.
>
> Guardrails: only touch content + SEO surfaces, never product behaviour.
> Canonicals/og:url always point at the production domain; never let dev become
> indexable. Keep copy in the site's language, honest, no clichés. Minimal diffs.

---

Tailor the bracketed specifics (paths, route table, the indexing flag name, the
production domain) to the target project before scheduling.
