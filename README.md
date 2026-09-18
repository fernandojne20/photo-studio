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

which runs lint, format check, typecheck, the unit tests, the generated-types drift check, and both the site and Studio production builds, in order, failing fast.

## Repository layout

- `src/` — the Astro site: pages, layouts, components, content mapping, and the Sanity client
- `studio/` — the Sanity Studio: schema types, structure, and Studio configuration
- `odd/tasks/` — feature task documents tracking scope, decisions, and progress
- `docs/` — project intent and reference documentation
