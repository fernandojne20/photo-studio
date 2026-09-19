# Feature: production-delivery

Module ID: `production-delivery` (see `CAPABILITY-MAP.md`). Depends on `media-interactions` and `contact-conversion`, both merged. Last module of version one.

## Objective

Make the site ready to be found, shared, measured and deployed: SEO metadata and social sharing, security headers, analytics-ready hooks without a vendor, performance budgets and automated verification in CI, and a Cloudflare Workers deployment that rebuilds when content changes.

## Problem and why

The site works locally and in CI, but it has a bare `<head>` (title, description, favicon), a placeholder site URL (`https://example.com`), no sitemap or robots file, no security headers, no budget that stops a regression in page weight, and no deployment. The photographer's content lives in Sanity and the site is static, so a content change is invisible until something rebuilds and redeploys the site.

## Scope

In scope:

- An optional production URL that drives indexing: without it the build is safe to deploy anywhere (no canonical, `noindex`, robots disallow); with it the page gets a canonical URL, Open Graph and Twitter metadata, JSON-LD, a sitemap and an allowing robots file.
- A social sharing image derived from the hero image in Sanity (1200 by 630, hotspot-aware) with a static fallback.
- Security and caching headers for Workers static assets, including a Content Security Policy that allows exactly what the page uses (Sanity CDN images, Turnstile, the site's own scripts and styles).
- Analytics-ready hooks: declarative event names on the conversion points and one dispatcher that emits a DOM event. No vendor, no cookies, no personal data.
- Performance budgets and automated verification in CI: size budgets on the built output and assertions on the built HTML.
- A deploy workflow for Cloudflare Workers with a strict content build, inert until the repository has the Cloudflare secrets, plus a rebuild trigger for content changes and a launch checklist.

Out of scope: choosing or installing an analytics vendor, a cookie banner (nothing sets cookies), category pages, buying the domain, creating the Cloudflare and Resend accounts, DNS changes and any remote operation on those accounts (user), paid services.

## Constraints and decisions

- Free tiers only. No new runtime dependency unless it removes real work; prefer a small prerendered endpoint over an integration for a one-page sitemap.
- The production URL is configuration (`PUBLIC_SITE_URL`, optional, build-time). The placeholder `site.url` in `src/config/site.ts` must stop being a source of truth. A build without the variable must never emit a canonical URL or an indexable page, so a preview on `workers.dev` cannot compete with the real domain later.
- SEO copy is static configuration in `src/config/site.ts`: editing general site copy in the CMS is out of scope in the intent document. The sharing image comes from the hero image the editor already manages.
- JSON-LD states only verified facts from the site configuration (name, URL, image, telephone, e-mail, Instagram once the handle is known). No invented address, opening hours or price range.
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

- [ ] PD-01 Production URL and indexing policy: optional `PUBLIC_SITE_URL`, Astro `site`, `noindex` and robots disallow without it; pure helpers with tests.
- [ ] PD-02 Head metadata: canonical, Open Graph, Twitter card, theme color, JSON-LD from verified facts, sharing image from the hero with a static fallback.
- [ ] PD-03 `sitemap.xml` and `robots.txt` as prerendered endpoints driven by the same policy; assertions on the built HTML in both modes.
- [ ] PD-04 Security and caching headers for static assets with a Content Security Policy verified in a browser (Turnstile, PhotoSwipe, Sanity images, fonts).
- [ ] PD-05 Analytics-ready hooks: event names on WhatsApp, e-mail, phone, form success and lightbox open; one dispatcher; no vendor and no personal data.
- [ ] PD-06 Performance budgets and automated verification in CI: size budgets on `dist/client`, built-HTML assertions, documented thresholds.
- [ ] PD-07 Deploy workflow for Cloudflare Workers: strict content build, secrets and variables in the right place, skipped while secrets are missing, manual and content-change triggers.
- [ ] PD-08 Launch checklist: accounts, DNS, Resend domain verification, real Turnstile keys, secrets, font licensing, Instagram handle, first real delivery test, Sanity webhook.

## Acceptance criteria

- Without `PUBLIC_SITE_URL` the built page is `noindex`, has no canonical URL, and `robots.txt` disallows everything; with it the page has a canonical URL, complete sharing metadata, valid JSON-LD, a sitemap and an allowing robots file.
- A shared link shows the studio name, a Spanish description and a 1200 by 630 image.
- The page works under the Content Security Policy with no violation in the console: images, fonts, lightbox, carousel, contact form and Turnstile.
- CI fails when the built output exceeds a documented budget.
- The deploy workflow builds with strict content, deploys only when its secrets exist, and can be triggered by a content change.
- `pnpm check` passes without any secret or optional variable.

## Progress and evidence

- 2026-09-19 Module opened after `contact-conversion` was completed on `main` (d6e7b7a, CI green). Exploration: `BaseLayout.astro` renders only title, description and favicons; `site.url` is the placeholder `https://example.com` and nothing reads it; `public/` holds only the two favicons; the `homePage` schema has no SEO fields; the adapter already injects an immutable cache header for `/_astro/*`.

## Next step

PD-01 to PD-03 on `feat/seo-metadata`.
