# Photo Studio

A Spanish-language photography studio website built with Astro and content managed through a Sanity Studio. The site renders a single-page homepage (hero, biography, portfolio, services, contact) from content fetched from Sanity, with development and CI-time fallbacks to local placeholder imagery when the Sanity dataset is unavailable or incomplete.

## Requirements

- Node 24 (see `.nvmrc`)
- pnpm 10 (see the `packageManager` field in `package.json`)

## Setup

```sh
pnpm install
cp .env.example .env
```

Fill in `.env` with the Sanity project configuration (see `.env.example` for the required variables).

## Scripts

| Command              | Action                                                      |
| -------------------- | ----------------------------------------------------------- |
| `pnpm dev`           | Start the Astro dev server                                  |
| `pnpm build`         | Build the production site to `./dist/`                      |
| `pnpm studio:dev`    | Start the Sanity Studio dev server                          |
| `pnpm typegen`       | Regenerate Sanity schema and query types                    |
| `pnpm content:check` | Fetch live content and report which sections used fallbacks |
| `pnpm test`          | Run the unit tests once                                     |
| `pnpm test:watch`    | Run the unit tests in watch mode                            |

## Checks

Every pull request and every push to `main` runs the following in GitHub Actions (`.github/workflows/ci.yml`):

- **lint**: `pnpm lint`, `pnpm format:check`, `pnpm --filter studio lint`, `pnpm --filter studio format:check`
- **typecheck**: `pnpm typecheck`, `pnpm --filter studio typecheck`, `pnpm typegen:check`
- **build**: `pnpm build` (with `CONTENT_FALLBACKS=true`, so an editor's content change or a Sanity outage cannot fail the build) and `pnpm studio:build`
- **test**: `pnpm test`

Run the same checks locally with:

```sh
pnpm check
```

which runs lint, format check, typecheck, the unit tests, the generated-types drift check, and the site build, then the Studio lint, format check, typecheck, and build, in order, failing fast.

One difference is intentional: locally the site build runs without `CONTENT_FALLBACKS`, so it fetches the real Sanity content from your `.env` and fails on a broken content contract, while CI builds with fallbacks enabled.

## Contact form configuration

The homepage stays a static, prerendered site; only `POST /api/contact` runs on demand, through the `@astrojs/cloudflare` adapter, to validate a submission, verify a Cloudflare Turnstile captcha, and deliver it by email through Resend. All five variables are optional, and they split into two genuinely different kinds:

| Variable                    | Used by                        | When it's read                                     |
| --------------------------- | ------------------------------ | -------------------------------------------------- |
| `TURNSTILE_SECRET_KEY`      | Verifying the captcha (server) | **Runtime**, from the Worker environment           |
| `RESEND_API_KEY`            | Sending the email (server)     | **Runtime**, from the Worker environment           |
| `CONTACT_FROM_EMAIL`        | Sending the email (server)     | **Runtime**, from the Worker environment           |
| `CONTACT_TO_EMAIL`          | Sending the email (server)     | **Runtime**, from the Worker environment           |
| `PUBLIC_TURNSTILE_SITE_KEY` | Rendering the widget (client)  | **Build time** — inlined into the built JavaScript |

Until `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, and `CONTACT_TO_EMAIL` are all set, the endpoint answers `503 { ok: false, code: 'not_configured' }` — it never pretends to have sent anything. `pnpm build` and `pnpm check` need none of these set.

The runtime/build-time split matters for where each variable actually has to live:

- The four **runtime** variables (`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`) are declared `access: 'secret'` in `astro.config.mjs`'s `env.schema`, so Astro never bakes a value for them into the build; the route reads them from the Worker's own environment when the Worker starts. Changing one needs no rebuild of the site, only the Worker picking up its new environment.
  - **Locally**: set them in `.dev.vars` (copy from `.dev.vars.example`, gitignored).
  - **In production**: set with `wrangler secret put <NAME>` (or as a `vars` entry in `wrangler.jsonc` for the two addresses, which are not sensitive) — this can be done independently of any build or deploy.
- `PUBLIC_TURNSTILE_SITE_KEY` is declared `access: 'public'`, which Astro inlines as a literal string into the built JavaScript at build time (this is Astro's own behavior for every `access: 'public'` `astro:env` variable, not specific to this project). It must therefore exist in the environment that actually **runs** `astro build` — whichever build produces the artifact that gets deployed.
  - **Locally**: `.env` or `.dev.vars` both work (`pnpm dev`/`pnpm build` load `.dev.vars`-and-`wrangler.jsonc` `vars` into the build environment the same way `wrangler dev` would, in addition to `.env`). `.dev.vars` wins over both `.env` and an already-exported shell variable of the same name: `@astrojs/cloudflare` unconditionally overwrites `process.env` from it before the build runs (`loadWranglerEnv`, `utils/wrangler-config.js`).
  - **In a deploy pipeline**: it must be exported as a real environment variable (or committed to a `.env` the pipeline reads), with no `.dev.vars` present to override it — setting it only as a deployed Worker `vars` entry has no effect on a bundle that was already built without it.

`.dev.vars.example` documents every variable and ships with Cloudflare's official Turnstile _test_ keys, safe to keep as-is for development (see the comments in the file for the always-fails/always-blocks alternates, and for the same runtime/build-time explanation).

## Production URL and indexing

`PUBLIC_SITE_URL` is optional and build-time: the absolute production origin (e.g. `https://www.example.com`, no path). It drives whether the built site claims to be indexable — the canonical link, Open Graph/JSON-LD URL, an allowing `robots.txt` with a `Sitemap:` line, and `sitemap.xml` itself all depend on it.

Unset (or an invalid value, such as a non-`https` origin or a URL with a path), the build defaults to safe and non-indexable: `noindex, nofollow`, no canonical URL, and no `sitemap.xml` file at all — so a preview deployed anywhere (`workers.dev`, a branch preview) can never compete with the real domain in search results. `pnpm build` and `pnpm check` need it unset.

Like `PUBLIC_TURNSTILE_SITE_KEY` above, it is inlined at build time, so it must be set in whatever environment actually runs `astro build`, not only as a deployed Worker variable. See `src/lib/seo.ts` (`resolveSiteUrl`) for the exact validation rules.

When the homepage hero has no Sanity image (the repository fallback content), the sharing image falls back to the static brand card `public/og-fallback.png` — the `lh` monogram, no photo — generated deterministically by `pnpm share-image:generate` (`scripts/generate-share-fallback.ts`) from `src/assets/logo/lh-monogram.svg`; re-run it whenever that SVG changes.

## Security headers

Every static response (the homepage, the 404 page, `robots.txt`, `og-fallback.png`, `/_astro/*`) is served with a fixed set of security headers plus a strict Content Security Policy, generated into `dist/client/_headers` by the `inject-security-headers` build hook in `astro.config.mjs`, from the pure logic in `src/lib/security-headers.mjs` (unit-tested in `security-headers.test.ts`). `/api/contact` is a Worker route, not a static asset: `_headers` never applies to it (Cloudflare does not run `_headers` rules against a Worker's own responses), so it keeps setting its own headers in `src/contact/http.ts`. A path that matches no page (e.g. `/no-existe`) is served by `src/pages/404.astro` — using the same layout, header and footer as the homepage — which still gets every `_headers` rule, since Astro emits it as a real static asset (`dist/client/404.html`), not a Worker fallback.

The Content Security Policy is delivered TWICE, deliberately: as Astro's own `<meta http-equiv="content-security-policy">` on every page (`security.csp` in `astro.config.mjs`, which computes the per-page script/style hashes), and as a real `Content-Security-Policy` header in `_headers`. Astro can only deliver a header directly for adapters that declare `adapterFeatures.staticHeaders`, which `@astrojs/cloudflare` does not, so the meta element is the only way to get the hashes at all; but a meta element only protects markup that comes _after_ it in `<head>`, and cannot carry `frame-ancestors`, `report-uri` or `sandbox` at all. The build hook reads every built page's meta content, verifies all pages agree on every non-hash directive, unions their `script-src`/`style-src` hashes into one policy valid for every page, appends `frame-ancestors 'none'`, and writes that as the one `Content-Security-Policy` header — checking it stays under Cloudflare's 2,000-character `_headers` line limit. The header is a superset of what any single page's meta declares, so the two never conflict; browsers enforce the intersection either way.

`_headers` also carries `X-Content-Type-Options`, `Referrer-Policy`, a `Permissions-Policy` that turns off every device/sensor API this site never uses, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, and `Strict-Transport-Security` (180 days, no `includeSubDomains` or `preload` — the domain is not bought yet). The build adds `X-Robots-Tag: noindex, nofollow` to every static response of a non-indexable build (see "Production URL and indexing" above), from the same built-output check `remove-empty-sitemap` uses — it never re-reads `PUBLIC_SITE_URL` itself — and cross-checks that against the homepage's own `<meta name="robots">`, failing the build if they ever disagree. The 404 page is always `noindex, nofollow` with no canonical or `og:url`, in both indexing modes (`forceNonIndexable` on `BaseLayout`/`Seo.astro`), and is never listed in `sitemap.xml` (which only ever lists the homepage).

Directives, and the script/style resources, live as exported constants in `src/lib/security-headers.mjs` (`CSP_DIRECTIVES`, `SCRIPT_RESOURCES`, `STYLE_RESOURCES`) imported by `astro.config.mjs`, and are pinned in tests — a change that widens them (adding `'unsafe-inline'`, a new script origin, dropping `default-src 'none'`, and so on) fails a test. Rationale: `default-src 'none'` as the base, with `img-src 'self' https://cdn.sanity.io data:` for Sanity photos and the blur-up placeholders; `font-src 'self'` because every font, including the Google-provided one, is downloaded and self-hosted by Astro's Font API at build time; `connect-src 'self'` for the contact form's own `fetch`; `frame-src`/`script-src` add `https://challenges.cloudflare.com` for Turnstile; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`; `upgrade-insecure-requests`; `script-src` also keeps `'self'` for Astro's own same-origin `<script src="/_astro/....js">` tags (they carry no `integrity` attribute, so a hash alone would not admit them). Each photo's blur-up `style="background-image:url(data:...)"` attribute cannot be hash-listed (a different value on every build, computed after `astro.config.mjs` already ran), so `style-src-attr` narrowly allows `'unsafe-inline'` — scoped to the `style` HTML attribute only, never to `<style>` blocks or scripts, and never fed by user input anywhere in this codebase.

To allow a new third-party origin (another API, a widget, a CDN), add it to the relevant constant in `src/lib/security-headers.mjs`, update its test, and re-verify in a real browser (`astro dev`/`preview` do not apply `_headers`, and `security.csp` is not evaluated in `astro dev` at all; use `pnpm build` + `wrangler dev --local` or `pnpm preview`).

## Analytics hooks

The site is analytics-READY, not analytics-equipped: no vendor is installed, nothing sets a cookie or touches `localStorage`/`sessionStorage`, and no personal data (a URL, a phone number, an e-mail address, a submitted field value, a field name, free text, a timestamp or any identifier) is ever part of an event. `src/lib/analytics-events.ts` is the closed, pure vocabulary — event names, placements and detail shapes, unit-tested against hostile input — and `src/scripts/analytics.ts` is the one dispatcher, loaded once from `BaseLayout.astro`. It delegates a single `click`/`auxclick` listener on `document`, validates the activated element's `data-analytics-event`/`data-analytics-placement` attributes through the vocabulary, and dispatches a `studio:analytics` `CustomEvent` on `document`; it never prevents or delays navigation, throws, logs, stores anything or makes a request. `src/lib/analytics-markup.test.ts` scans every conversion component's `.astro` source as text and fails if a `data-analytics-*` value drifts from the closed vocabulary or an expected attribute goes missing.

Event vocabulary:

- `whatsapp_click`, `instagram_click`, `email_click`, `phone_click` — `{ placement }`, one of `header`, `mobile_menu`, `hero`, `biography`, `contact`, `footer`, `instagram_section`.
- `contact_form_submit` — `{}`, dispatched once a locally valid submission attempt begins (see `src/scripts/contact-form.ts`).
- `contact_form_result` — `{ outcome }`, one of `success`, `field_errors`, `captcha_failed`, `not_configured`, `delivery_failed`, `network`; a rejected field never names which field.
- `lightbox_open` — `{ position }`, the 1-based index of the opened photo (see `src/scripts/lightbox.ts`).

A future vendor script would subscribe passively, never replacing the dispatcher:

```js
document.addEventListener('studio:analytics', (event) => {
  const { name, detail } = event.detail;
  // send `name`/`detail` to the vendor here
});
```

Adding a vendor also means: extending `script-src` and `connect-src` in `src/lib/security-headers.mjs` (and `astro.config.mjs`'s `SCRIPT_RESOURCES`) for its script and reporting origins, and revisiting consent — none of that is done here. No personal data may ever be added to the vocabulary above, whatever the vendor asks for.

## Build verification and budgets

`pnpm build:verify --mode=indexable|non-indexable [--origin=https://...]` (PD-06) reads `dist/client` after a build and asserts what the `astro:build:done` hooks in `astro.config.mjs` do not. Every check reads pages through `src/lib/built-dom.ts`, which uses `parse5`, the HTML standard's own parsing algorithm, so the verifier sees a page as a browser does: an editor's own `>` inside `alt="antes > después"` is text, a robots meta or a link commented out or trapped inside `<noscript>` is not live, and a required tag only counts inside `<head>`:

- **Indexing** (`src/lib/build-verification-indexing.ts`): the exact policy in both modes (canonical, `og:url`, `robots.txt` — including `Allow: /`/`Disallow: /api/`/no `Disallow: /` in BOTH modes, decided the way a crawler decides it: per group, the matching rule with the longest pattern wins and an Allow wins a tie, so a broad `Disallow: /api/` next to an equally specific `Allow: /api/` still fails the build — `sitemap.xml` (an XML comment hides a `<url>` from the count, as it does from a search engine), `_headers`' `X-Robots-Tag` under its `/*` rule, the 404 page, the JSON-LD block). More than one robots meta or canonical fails loudly: a search engine combines them.
- **Policy** (`src/lib/build-verification-policy.ts`): the homepage and 404 page's Content Security Policy, compared directive-by-directive against `CSP_DIRECTIVES`/`SCRIPT_RESOURCES`/`STYLE_RESOURCES` in `src/lib/security-headers.mjs` — the single source of truth, so there is no separate hardcoded list of our own to fall out of sync or be quietly weakened. `_headers`' policy is then compared AGAINST the pages: identical non-hash tokens per directive, every page hash present, `frame-ancestors 'none'` its only addition. The security headers and the policy must sit under `_headers`' `/*` rule, not only `/_astro/*`.
- **Markup** (`src/lib/build-verification-markup.ts`): every WhatsApp (`wa.me`, `api.whatsapp.com`, the `whatsapp:` scheme)/mailto/tel/Instagram link's `data-analytics-event`/`data-analytics-placement` on the BUILT pages, through the SAME `analyticsEventForHref` (`src/lib/analytics-events.ts`) the page itself uses to decide which links get those attributes in the first place — one function decides for both, so they cannot drift. The Instagram link counts as the configured profile when, after parsing both with `URL`, the scheme is `http:` or `https:`, the host matches ignoring case and one leading `www.`, the port is the default one, and the path matches ignoring case and trailing slashes; query and fragment (a tracking `?igsh=...` from the app) are ignored, but this stays an EQUALITY of the path, never a prefix. A source-text scan cannot see a new link with no attributes, or a wrong condition around them. Page hygiene lives here too: `<img>` `width`/`height`, exactly one non-lazy image, no cross-origin script or stylesheet.
- **Budgets** (`src/lib/performance-budgets.ts`, measured by `src/lib/build-measurement.ts` + `scripts/measure-build.ts`): printed and checked on every run, table below. Eager JavaScript counts every executable external `<script>` of the homepage — a classic script (with or without `defer`/`async`) as much as a `type="module"` one, `importmap`/`speculationrules` excluded since neither is fetched — and follows a module's own static imports (a classic script has none to follow); "executable" is decided in one place (`src/lib/script-type.ts`) shared with the CSP inline-hash check. Total font bytes adds the `@font-face` rules of every LINKED stylesheet to those of the homepage's own inline styles, resolving a relative `url(...)` against that stylesheet's own path, deduplicated across both sources; a `data:` font or another origin's names no file of the site and is skipped. A linked stylesheet that uses `@import` fails the measuring, because neither the CSS budget nor the font budget could follow it.

`scripts/verify-build.ts` wraps every check and the measuring individually: one throwing check becomes a single problem line naming it, and every other check still runs and reports. If `PUBLIC_SITE_URL` is set, in the shell or in a dotenv file the build reads, while verifying non-indexable, or while the built output is not actually indexable (an invalid value degrades silently instead of failing `astro build`), the check fails and names the variable. `pnpm check` and the `build` CI job run it in non-indexable mode right after their `pnpm build`; the `verify` CI job builds and runs it in indexable mode only, so nothing is built twice.

Run it locally:

```sh
pnpm build && pnpm build:verify --mode=non-indexable
PUBLIC_SITE_URL=https://www.example.com pnpm build && \
  PUBLIC_SITE_URL=https://www.example.com pnpm build:verify --mode=indexable --origin=https://www.example.com
```

Budgets (`src/lib/performance-budgets.ts`), measured on real content 2026-09-19. Each byte/count budget a broken measurement could silently read as zero also has a `min` — a measurement below it, missing, non-finite or negative fails as "the measurement is probably broken", never as an empty pass:

| Budget               | Measured | Limit                  | Why                                                                                                                                                               |
| -------------------- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage HTML, gzip  | 15.9 kB  | 20 kB + 1 kB per image | 10 kB without images and about 0.7 kB per photo, so a portfolio of any size never fails a build; catches accidental inlining.                                     |
| Eager JS, gzip       | 10.1 kB  | 24.0 kB                | `ServicesCarousel.astro` loads with a plain `<script>`, not `import()` — it is EAGER, and the editor's 5th service adds it (measured with the carousel: 17.8 kB). |
| Lazy JS, gzip        | 16.9 kB  | 23.0 kB                | PhotoSwipe only: the carousel is eager, never lazy (see above). Headroom for a PhotoSwipe upgrade.                                                                |
| Stylesheets, gzip    | 5.7 kB   | 7.5 kB                 | One design system; a jump usually means an unscoped or duplicated rule.                                                                                           |
| Eager script files   | 4        | 6                      | Measured with a 5th placeholder service: 5 files (the carousel bundles Embla itself, no separate chunk). One spare.                                               |
| Preloaded font bytes | 53.8 kB  | 70.0 kB                | Montserrat and Futura Light BT only (see "Font preloading").                                                                                                      |
| Total font bytes     | 726.7 kB | 735.0 kB               | Montserrat is fetched from Google at build time and can drift a little with no code change; the headroom is for that, not a new font.                             |

Raising a budget needs a new `reason` in the table, not a bigger number with the same one.

### Font preloading

Only Montserrat (`--font-display`) and Futura Light BT (`--font-ui`) are marked `preload` in `BaseLayout.astro`: the header brand on mobile, the desktop nav, and the hero CTA all need one of them in the homepage's first viewport at both 1366 and 393 wide. DM Sans (`--font-body`) also paints text in that viewport — the Welcome section's first paragraph sits at about 725 px on a 393×800 phone — but stays unpreloaded on purpose: its 239 kB at high priority would compete with the hero photo, the page's actual largest contentful paint, for bandwidth. `font-display: swap` shows that line immediately in the fallback font instead, with no layout shift, because Astro's font API already emits a metric-adjusted fallback (`size-adjust`/`ascent-override`/`descent-override`) for DM Sans (as it does for Montserrat, Futura Light BT and Minion — Adelia is the one family with no such fallback block in the built output). Revisit this trade-off if the owner licenses DM Sans for WOFF2. This preload set cut preloaded bytes from all five fonts (726.7 kB) to two (53.8 kB).

The four other font files are uncompressed desktop formats (`adelia.ttf` 135 kB, `futura-light-bt.ttf` 37 kB, `dm-sans-variable.ttf` 239 kB, `minion-variable-concept-roman.otf` 299 kB). Adelia, Futura Light BT and Minion are commercial fonts whose web licensing the owner has not confirmed, and converting a font's format is a licensing decision, so they are deliberately left as they are. DM Sans is open-licensed (SIL OFL): it can be served as WOFF2 through Astro's Google provider, like Montserrat, which is a follow-up and would make preloading it on mobile cheap. As an estimate, not a measurement, WOFF2 for all four would bring the total from about 727 kB to about 515 kB. The total font budget has almost no headroom for that reason: it must only go down.

## Repository layout

- `src/` — the Astro site: pages, layouts, components, content mapping, and the Sanity client
- `studio/` — the Sanity Studio: schema types, structure, and Studio configuration
- `odd/tasks/` — feature task documents tracking scope, decisions, and progress
- `docs/` — project intent and reference documentation
