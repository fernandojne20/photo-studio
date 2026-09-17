# Feature: content-management

Module ID: `content-management` (see `CAPABILITY-MAP.md`). Depends on `site-foundation`. Unblocks `studio-page`.

## Objective

Define and deploy the Sanity Studio schemas, editorial validation, image metadata, ordering, generated types, content queries, and preview/fallback behavior, so `studio-page` can render the homepage from real content and the photographer can edit it without code changes.

## Problem and why

The site currently renders hard-coded placeholders. The photographer must be able to replace and reorder the hero, portfolio grid, biography, and service cards herself. The frontend needs a typed, stable contract with the CMS and a defined behavior when content is missing or the API fails.

## Scope

In scope:

- `studio/` as a pnpm workspace package in this repo, scaffolded with the official `create sanity` CLI (clean template, TypeScript), connected to project `r781btme` / dataset `production` (public read).
- Schemas: `homePage` singleton (hero image + optional mobile image, biography portrait, body, optional CTA), `portfolioImage` documents (image, alt, optional caption, categories, visibility, drag-and-drop order), `serviceCategory` documents (title, slug, image, visibility, drag-and-drop order).
- Studio UX in Spanish (titles, descriptions, validation messages) for the photographer; code identifiers and comments in English.
- Studio structure with the singleton first and orderable lists for portfolio and services.
- Sanity TypeGen configured in `studio/sanity.cli.ts`, reading queries from `../src` and writing `src/sanity/sanity.types.ts` (committed).
- Astro data layer: `@sanity/client` (no `@sanity/astro`), image URL builder, GROQ queries with `defineQuery`, a content port `getHomeContent()` returning domain types, and the fallback policy below.
- Seeded development content (assets and documents) in the `production` dataset through the Sanity MCP.
- Schema deploy and Studio deploy to Sanity hosting.

Out of scope: wiring the homepage sections to the content port (`studio-page`), lightbox and carousel (`media-interactions`), contact form (`contact-conversion`), CMS editing of contact details, navigation, or general copy (intent).

## Constraints and decisions

- Sanity project `r781btme` ("photo-studio", organization `okwh7zn4l`) and dataset `production` already exist and are reused. The dataset is public, so the static build reads without a token.
- The site uses `@sanity/client` directly instead of `@sanity/astro`: the integration's peer dependencies pull `sanity`, React, and styled-components into the site even without an embedded Studio, which contradicts the zero-React decision. Verified against `@sanity/astro@3.5.1` peer ranges on 2026-09-17.
- Versions verified on 2026-09-17: `sanity@6.15.0` (React 19.2, styled-components 6), `@sanity/client@8.6.2`, `@sanity/image-url@2.1.1`, `groq@6.15.0`, `@sanity/orderable-document-list@2.0.24` (supports sanity 6), `astro-portabletext@1.0.1` (Astro >= 4.6).
- Icons are imported from `@sanity/icons/<Name>` subpaths (root named exports were removed).
- Ordering uses `@sanity/orderable-document-list` (`orderRank` field, drag-and-drop lists) instead of a numeric field the photographer would have to maintain by hand.
- Visibility is a boolean per document, titled "Mostrar en la web", default true.
- Biography body is Portable Text restricted to paragraph blocks with strong and emphasis marks. Rendering belongs to `studio-page` via `astro-portabletext`.
- Every image field enables `hotspot` and carries an `alt` field; alt is required on portfolio, hero, portrait, and service images.
- Queries always project `_key` for arrays, image `asset->{_id, url, metadata{lqip, dimensions}}`, `alt`, `hotspot`, `crop`.
- Fallback policy (`src/content/home.ts`):
  - Development (`import.meta.env.DEV`): a fetch error, a missing `homePage`, or an empty list falls back to `src/data/placeholders.ts` with a `console.warn` naming what was missing.
  - Production build: a fetch error or a missing `homePage` throws with an actionable message so the deploy fails instead of publishing placeholders. Empty portfolio or services return empty arrays; `studio-page` decides how to render them.
- `sanity init` and `sanity deploy` need an interactive Sanity login, so the user runs those commands; the agent never uses ambient credentials.
- Existing CORS origin `http://localhost:3333` covers local Studio dev. The Astro site fetches server-side at build time and needs no CORS entry.
- Generated files: commit `src/sanity/sanity.types.ts`; ignore `studio/schema.json` and `studio/dist`.

## TDD

- Mode: off (no project or session configuration enables it; the user did not request it).
- Source: default.
- Runner: none. Functional checks: `pnpm astro check`, `pnpm build`, `pnpm --filter studio build`, `pnpm typegen`, and `node scripts/print-home-content.ts` (Node 24 type stripping) to exercise the content port against the live dataset.

## Tasks

- [x] CM-01 Workspace and Studio scaffold: add `packages: ['studio']` to `pnpm-workspace.yaml`; the user runs `pnpm dlx sanity@latest init --project=r781btme --dataset=production --template=clean --typescript --output-path=studio --package-manager=pnpm --no-git --no-install --no-mcp --no-skills`; then `pnpm install` at the root, root scripts `studio:dev`, `studio:build`, `typegen`, gitignore for `studio/schema.json` and `studio/dist`.
- [x] CM-02 Schemas and Studio config in `studio/`: `schemaTypes/documents/{home-page,portfolio-image,service-category}.ts`, `schemaTypes/objects/{image-with-alt,call-to-action}.ts`, `schemaTypes/index.ts`, `structure.ts` with the singleton and orderable lists, `sanity.config.ts` (structure tool, vision, orderable plugin, Spanish titles), `sanity.cli.ts` (api + typegen). `pnpm --filter studio build` passes.
- [x] CM-03 Astro data layer: `src/sanity/{env,client,image,queries}.ts`, generated `src/sanity/sanity.types.ts`, `src/content/{types,mappers,home}.ts` implementing the fallback policy, `scripts/print-home-content.ts` (root script `content:check`). `pnpm typegen`, `pnpm astro check` pass; `pnpm build` passes with the dataset empty because the homepage does not consume the port yet. `.env.example` and `.env` are pending (see evidence).
- [x] CM-04 Seed development content through the Sanity MCP: upload placeholder assets from URLs, create and publish `homePage`, four `serviceCategory`, and nine `portfolioImage` documents with Spanish alt text and `orderRank`. `node scripts/print-home-content.ts` reports the seeded counts.
- [x] CM-05 Deploy: the user runs `pnpm --filter studio exec sanity deploy --schema-required --url <hostname>` (Sanity CLI 8 deploys the workspace schema as part of `deploy`; the standalone command is `sanity schemas deploy`). Verify the deployed schema through the MCP and open the hosted Studio.
- [x] CM-06 Verify end to end: `pnpm build` fetches the seeded content without fallbacks; `pnpm astro check` reports zero errors; the task document and its mirror are updated with evidence.

## Acceptance criteria

- The photographer can, in the hosted Studio, replace the hero image, add or reorder portfolio images by drag and drop, hide an image, edit the biography text and portrait, and reorder or hide service cards, all with Spanish labels.
- Every image field requires alt text and supports hotspot cropping.
- `getHomeContent()` returns typed domain objects generated from the schema and queries; no `any` at the boundary.
- A clean production build with the seeded dataset completes without fallbacks; a production build against a missing `homePage` fails with a clear message; a development build against an empty dataset succeeds with placeholders and warnings.
- Generated types are up to date with the schema (running `pnpm typegen` produces no diff).

## Progress and evidence

- 2026-09-17 CM-01 done. `pnpm create sanity@latest -- ...` failed because pnpm forwarded the `--` separator and the CLI read every later flag as a positional argument; `pnpm dlx sanity@latest init` with `=` flags worked. Scaffold: `studio/` clean template (sanity 6.15.0, React 19.2, structure + vision tools, `autoUpdates: true`). The generated package name `photo-studio` collided with the root package, renamed to `studio`. `pnpm install` at the root linked the workspace. Added `@sanity/orderable-document-list` and `@sanity/icons` to the Studio; `@sanity/client`, `@sanity/image-url`, `groq` (runtime) and `astro-portabletext` (dev, for `studio-page`) to the site. Root scripts `studio:dev`, `studio:build`, `typegen`. `sd` installed via Homebrew for in-place edits.

- 2026-09-17 CM-02 and CM-03 done by one delegated writer (Sonnet). Writer evidence: `pnpm --filter studio build` succeeded (366 ms); `pnpm typegen` generated 3 queries and 18 schema types; `pnpm astro check` 0 errors / 0 warnings / 0 hints (19 files); content port against the empty dataset returned four `placeholder` sections with warnings; `getHomeContent({fallbacks: 'deny'})` threw `Missing "hero" content: create the "Página de inicio" document (with a hero image) in the Sanity Studio.`; `pnpm build` succeeded with and without `CONTENT_FALLBACKS` because `index.astro` does not consume the port yet (expected failure deferred to `studio-page`). Deviations accepted: the extraction subcommand is `sanity schemas extract --force --enforce-required-fields`; `studio/sanity.cli.ts` adds `vite.ssr.external: ['lexorank']` because Vite 8.3's SSR transform in the schema-extraction worker cannot shim that CommonJS dependency of `@sanity/orderable-document-list` (`exports is not defined`), while the Studio bundle itself builds fine; root `tsconfig.json` excludes `studio/` so `astro check` does not type-check the Studio project; `tsx` added because Node's native ESM loader requires explicit extensions on relative imports, so `content:check` runs `node --env-file=.env --import tsx scripts/print-home-content.ts`; `@types/node` and `@portabletext/types` added as direct dev dependencies; `typegen.enabled` left `false` for explicit generation; the placeholder biography CTA targets WhatsApp.
- 2026-09-17 Parent verification: `pnpm astro check` 0 errors; `pnpm typegen` run twice produced an identical `src/sanity/sanity.types.ts` (same SHA-1). Native risk assessment: `medium` (executable change in `.gitignore`), satisfied by writer self-verification plus parent readback of the three document schemas, the queries, the content port and the CLI config.
- Permission note: the writer could not create `.env.example` or `.env` (writes to `.env*` paths are blocked in this project) and left a stray `.env.example.draft` containing the text `test`. Both are surfaced to the user rather than worked around.

- 2026-09-17 CM-04 done by the parent through the Sanity MCP: 16 picsum images uploaded as assets (hero desktop and mobile, portrait, 9 portfolio, 4 services) with lqip and dimensions; documents created and published: `homePage` (hero + mobile image, portrait, four biography paragraphs as Portable Text, CTA to WhatsApp), four `serviceCategory` (Estudio, Exterior, Domicilio, Eventos with LexoRank values from the `lexorank` package), nine `portfolioImage` linked to categories. First attempt to create the portfolio images failed with "references non-existent document" because the categories were still drafts; publishing the categories first fixed it. Evidence: `PUBLIC_SANITY_PROJECT_ID=r781btme PUBLIC_SANITY_DATASET=production node --import tsx scripts/print-home-content.ts` printed hero, biography, portfolio (9), services (4) all from `sanity`, warnings none, exit 0. GROQ cross-check with the published perspective: `homePage` hero asset defined, 9 visible portfolio images, services ordered Estudio, Exterior, Domicilio, Eventos.

- 2026-09-17 CM-05 done by the user: `pnpm --filter studio exec sanity deploy --schema-required --url laury-herrera` created the hostname, built the Studio (378 ms), deployed 1/1 schemas and published `https://laury-herrera.sanity.studio/` (application id `pafio1dfnssyspf3p4kpwwu6`, now set in `studio/sanity.cli.ts` under `deployment.appId`). MCP `list_workspace_schemas` shows a Studio-deployed `default` workspace titled "Laury Herrera · Contenido" with that application id.
- 2026-09-17 CM-06 done. With `.env` in place: `pnpm content:check` reported hero, biography, portfolio (9), services (4) all from `sanity`, warnings none; `pnpm astro check` 0 errors / 0 warnings / 0 hints; `pnpm build` completed (1 page). `.env` is untracked and ignored; `.env.example` is committed. The stray `.env.example.draft` is still present and must be deleted by the user (permission block on `.env*` paths).

- 2026-09-17 Review fix (PR #1, Codex P2 on `call-to-action.ts`): `target` had no validation while `mapCta()` drops a CTA without a target, so a label-only CTA could be published and never render. Added a custom rule on `target` mirroring the `label` rule (Spanish error message). Commit `f27a137` on `feat/content-management`; Studio build, typegen (no type diff) and `astro check` pass. The hosted Studio needs a redeploy (user-run `sanity deploy`) to pick up the new rule.

## Next step

PR #1 open at https://github.com/fernandojne20/photo-studio/pull/1. After merge, redeploy the Studio. `studio-page` wires the homepage sections to `getHomeContent()` and renders the biography Portable Text with `astro-portabletext`.
