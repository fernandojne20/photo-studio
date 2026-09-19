# Feature: production-delivery

Module ID: `production-delivery` (see `CAPABILITY-MAP.md`). Depends on `media-interactions` and `contact-conversion`, both merged. Last module of version one.

## Objective

Make the site ready to be found, shared, measured and deployed: SEO metadata and social sharing, security headers, analytics-ready hooks without a vendor, performance budgets and automated verification in CI, and a Cloudflare Workers deployment that rebuilds when content changes.

## Problem and why

The site works locally and in CI, but it has a bare `<head>` (title, description, favicon), a placeholder site URL (`https://example.com`), no sitemap or robots file, no security headers, no budget that stops a regression in page weight, and no deployment. The photographer's content lives in Sanity and the site is static, so a content change is invisible until something rebuilds and redeploys the site.

## Scope

In scope:

- An optional production URL that drives indexing: without it the build is safe to deploy anywhere (`noindex`, no canonical, no sitemap); with it the page gets a canonical URL, `og:url`, a sitemap and a `Sitemap:` line in the robots file. Sharing metadata and JSON-LD are present in both modes.
- A social sharing image derived from the hero image in Sanity (1200 by 630, hotspot-aware) with a static fallback.
- Security and caching headers for Workers static assets, including a Content Security Policy that allows exactly what the page uses (Sanity CDN images, Turnstile, the site's own scripts and styles).
- Analytics-ready hooks: declarative event names on the conversion points and one dispatcher that emits a DOM event. No vendor, no cookies, no personal data.
- Performance budgets and automated verification in CI: size budgets on the built output and assertions on the built HTML.
- A deploy workflow for Cloudflare Workers with a strict content build, inert until the repository has the Cloudflare secrets, plus a rebuild trigger for content changes and a launch checklist.

Out of scope: choosing or installing an analytics vendor, a cookie banner (nothing sets cookies), category pages, buying the domain, creating the Cloudflare and Resend accounts, DNS changes and any remote operation on those accounts (user), paid services.

## Constraints and decisions

- Free tiers only. No new runtime dependency unless it removes real work; prefer a small prerendered endpoint over an integration for a one-page sitemap.
- The production URL is configuration (`PUBLIC_SITE_URL`, optional, build-time), read in exactly one way: from `astro:env/client`, through `resolveSiteUrl`. Astro's `site` option is NOT used: the config file is loaded by plain Node before Vite reads `.env`, so a value in `.env` would validate and still leave `Astro.site` undefined. The value must be a bare `https` origin; userinfo, a path, a query or a hash make it invalid instead of being trimmed, so a misconfiguration stays visible. A build without a valid value never emits a canonical URL or an indexable page, so a preview on `workers.dev` cannot compete with the real domain later.
- Non-indexable does NOT mean blocking crawlers. Google only honors `noindex` on pages it may crawl; `Disallow: /` plus `noindex` can leave a bare URL in the index when the preview is linked from elsewhere. So `robots.txt` always allows crawling (and disallows `/api/`), the page carries `noindex, nofollow`, and the headers slice adds `X-Robots-Tag: noindex` for non-indexable builds.
- No sitemap file exists without a valid URL: the sitemaps schema requires at least one `<url>`, so an empty `<urlset>` is invalid. The endpoint answers a bodyless 404; the Cloudflare adapter's prerender step still writes a 0-byte file for it, which a small `astro:build:done` hook deletes.
- Workers static assets choose the content type from the file extension, so headers set by a prerendered endpoint only affect `astro dev`.
- SEO copy is static configuration in `src/config/site.ts`: editing general site copy in the CMS is out of scope in the intent document. The sharing image comes from the hero image the editor already manages.
- JSON-LD states only verified facts from the site configuration (name, URL, image, E.164 telephone, e-mail, Instagram once the handle is known). No invented address, opening hours or price range. The type is `Organization`: `LocalBusiness` means a physical place and needs an `address` for Google, and the studio has none in the project.
- `PUBLIC_TURNSTILE_SITE_KEY` is build-time and the four contact values are runtime Worker values (see `odd/tasks/contact-conversion.md`); the deploy workflow must provide each where it is read.
- Remote operations need explicit user authorization: the deploy workflow is written and verified locally with `wrangler deploy --dry-run`, and it skips itself while the secrets are missing. Nothing is deployed by the agents.
- Pull requests under 1000 authored lines, stacked when needed; independent read-only review before opening; ready means CI green and the review bot's verdict in.
- TDD: off (no project or session configuration enables it; the user did not request it). Source: default. Runner: Vitest (`pnpm test`). Pure logic gets unit tests; head metadata is asserted on the built HTML; headers and the policy are verified in a real browser.

## Delivery strategy

1. `feat/seo-metadata` into `main`: PD-01 to PD-03.
2. `feat/security-headers`: PD-04.
3. `feat/analytics-hooks`: PD-05.
4. `feat/performance-budgets`: PD-06.
5. `feat/deploy-workflow`: PD-07 and PD-08.

Slices 2 to 5 are independent of each other and branch from `main` once slice 1 is merged, unless one is ready earlier.

## Tasks

- [x] PD-01 Production URL and indexing policy: optional `PUBLIC_SITE_URL` read from `astro:env/client`, `noindex` without it; pure helpers with tests.
- [x] PD-02 Head metadata: canonical, Open Graph, Twitter card, theme color, JSON-LD from verified facts, sharing image from the hero with a static fallback.
- [x] PD-03 `sitemap.xml` and `robots.txt` as prerendered endpoints driven by the same policy. Assertions on the built output in both modes moved to PD-06.
- [ ] PD-04 Security and caching headers for static assets with a Content Security Policy verified in a browser (Turnstile, PhotoSwipe, Sanity images, fonts), plus `X-Robots-Tag: noindex` for non-indexable builds.
- [ ] PD-05 Analytics-ready hooks: event names on WhatsApp, e-mail, phone, form success and lightbox open; one dispatcher; no vendor and no personal data.
- [ ] PD-06 Performance budgets and automated verification in CI: size budgets on `dist/client`, documented thresholds, and assertions on the built output in BOTH indexing modes (acceptance test: rewiring `sitemap.xml.ts` to ignore the URL must fail CI; a set but invalid `PUBLIC_SITE_URL` must fail the build).
- [ ] PD-07 Deploy workflow for Cloudflare Workers: strict content build, secrets and variables in the right place, skipped while secrets are missing, manual and content-change triggers.
- [ ] PD-08 Launch checklist: accounts, DNS, Resend domain verification, real Turnstile keys, secrets, font licensing, Instagram handle, first real delivery test, Sanity webhook.

## Acceptance criteria

- Without a valid `PUBLIC_SITE_URL` the built page is `noindex`, has no canonical URL, `robots.txt` allows crawling without a `Sitemap:` line and no `sitemap.xml` exists; with it the page has a canonical URL, `og:url`, a one-URL sitemap and the `Sitemap:` line. Sharing metadata and valid JSON-LD exist in both modes.
- A shared link shows the studio name, a Spanish description and a 1200 by 630 image.
- The page works under the Content Security Policy with no violation in the console: images, fonts, lightbox, carousel, contact form and Turnstile.
- CI fails when the built output exceeds a documented budget.
- The deploy workflow builds with strict content, deploys only when its secrets exist, and can be triggered by a content change.
- `pnpm check` passes without any secret or optional variable.

## Progress and evidence

- 2026-09-19 Module opened after `contact-conversion` was completed on `main` (d6e7b7a, CI green). Exploration: `BaseLayout.astro` renders only title, description and favicons; `site.url` is the placeholder `https://example.com` and nothing reads it; `public/` holds only the two favicons; the `homePage` schema has no SEO fields; the adapter already injects an immutable cache header for `/_astro/*`.

- 2026-09-19 PD-01 to PD-03 by a delegated writer. `src/lib/seo.ts` holds the pure policy and builders, `src/lib/seo-image.ts` the 1200 by 630 sharing image (hotspot-aware crop, forced to JPEG because link-preview crawlers do not negotiate formats; verified as `200`, `image/jpeg`, 1200 by 630, about 52 KB), `src/components/Seo.astro` the head tags; `robots.txt.ts` and `sitemap.xml.ts` are one-line readers of the variable over pure body builders. The `seo.ts` and `seo-image.ts` split is deliberate: anything that reaches `src/sanity/env.ts` throws at import time without the Sanity variables.
- Independent review before the pull request, with primary sources, no blockers. Fixed: the robots and `noindex` anti-pattern, the invalid empty sitemap, the two behaviors of the variable (it was fed to Astro's `site` from `process.env` in the config, which also imported a TypeScript file through Node type stripping below the promised `engines` floor; both are gone), `LocalBusiness` without an address, a display-format telephone, silent trimming of a misconfigured URL, an empty `og:image:alt`, endpoint headers documented as effective when they are inert in production. Parent verification on real content: both modes built and inspected, a URL with a path stays non-indexable, the robots mutation fails four tests; the writer's thirteen mutations are all caught. `pnpm check` exit 0, 17 files and 358 tests. Native risk assessment `medium`.
- 2026-09-19 Review bot on the pull request, one valid finding in two parts. The page declared `summary_large_image` even without an image: the card type now follows the presence of the image (`buildTwitterCard`). The promised static fallback was missing: `public/og-fallback.png` is a 1200 by 630 brand card, the `lh` monogram in `--color-text` on `--color-bg`, generated by the committed `scripts/generate-share-fallback.ts` (`pnpm share-image:generate`, deterministic on one platform; `sharp` added as a devDependency at the version already resolved, three lockfile lines). No text on the card, because the brand fonts are not available to a rasterizer. `resolveShareImage` returns it only when the hero has no Sanity source AND the production URL is valid, because Open Graph images must be absolute; otherwise the image tags stay omitted and the card is `summary`. A test reads the PNG header to pin the dimensions. Four built cases verified (Sanity image with and without the URL, fallback with the URL, nothing without it). Delivered as a stacked pull request to keep the first one under the size limit. The deploy build is strict, so in production the Sanity hero is the normal path and the card is a safety net.
- Known gaps, by decision: no automated test covers the wiring between the variable and the built files, and CI never builds the indexable mode (PD-06). The hero alt text in the dataset is development reference content and ships as `og:image:alt` until the editor replaces it (PD-08 checklist). The user must add `PUBLIC_SITE_URL=` to `.env.example` (write-protected for the agents).

## Next step

PD-04 on `feat/security-headers`.
