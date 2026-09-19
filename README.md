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
  - **Locally**: `.env` or `.dev.vars` both work (`pnpm dev`/`pnpm build` load `.dev.vars`-and-`wrangler.jsonc` `vars` into the build environment the same way `wrangler dev` would, in addition to `.env`; `.dev.vars` wins if both set the same variable).
  - **In a deploy pipeline**: it must be exported as a real environment variable (or committed to a `.env` the pipeline reads) for the build step itself — setting it only as a deployed Worker `vars` entry has no effect on a bundle that was already built without it.

`.dev.vars.example` documents every variable and ships with Cloudflare's official Turnstile _test_ keys, safe to keep as-is for development (see the comments in the file for the always-fails/always-blocks alternates, and for the same runtime/build-time explanation).

## Production URL and indexing

`PUBLIC_SITE_URL` is optional and build-time: the absolute production origin (e.g. `https://www.example.com`, no path). It drives whether the built site claims to be indexable — the canonical link, Open Graph/JSON-LD URL, an allowing `robots.txt` with a `Sitemap:` line, and `sitemap.xml` itself all depend on it.

Unset (or an invalid value, such as a non-`https` origin or a URL with a path), the build defaults to safe and non-indexable: `noindex, nofollow`, no canonical URL, and no `sitemap.xml` file at all — so a preview deployed anywhere (`workers.dev`, a branch preview) can never compete with the real domain in search results. `pnpm build` and `pnpm check` need it unset.

Like `PUBLIC_TURNSTILE_SITE_KEY` above, it is inlined at build time, so it must be set in whatever environment actually runs `astro build`, not only as a deployed Worker variable. See `src/lib/seo.ts` (`resolveSiteUrl`) for the exact validation rules.

## Repository layout

- `src/` — the Astro site: pages, layouts, components, content mapping, and the Sanity client
- `studio/` — the Sanity Studio: schema types, structure, and Studio configuration
- `odd/tasks/` — feature task documents tracking scope, decisions, and progress
- `docs/` — project intent and reference documentation
