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

## Repository layout

- `src/` — the Astro site: pages, layouts, components, content mapping, and the Sanity client
- `studio/` — the Sanity Studio: schema types, structure, and Studio configuration
- `odd/tasks/` — feature task documents tracking scope, decisions, and progress
- `docs/` — project intent and reference documentation
