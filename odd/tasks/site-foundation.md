# Feature: site-foundation

Module ID: `site-foundation` (see `CAPABILITY-MAP.md`). Depends on nothing. Unblocks `content-management` and `studio-page`.

## Objective

Establish the Astro + TypeScript project, design tokens, font loading, static site configuration, shared layout, and development-quality placeholder assets so later modules can build the homepage sections on a stable base.

## Problem and why

There is no code yet, only intent docs and mockups. Every later module needs a consistent visual foundation (tokens, fonts, layout shell) and a place for non-CMS configuration (WhatsApp, contact, Instagram, navigation, general copy).

## Scope

In scope:

- Astro project scaffolded with the official `create astro` CLI (minimal template, TypeScript strict), pnpm, git repository connected to `https://github.com/fernandojne20/photo-studio`.
- Design tokens as CSS custom properties (color, type scale, spacing, radii, breakpoints, motion) plus a small global stylesheet.
- Font loading through the Astro fonts API: local Adelia, Futura BT Light, DM Sans Variable, Minion Variable Concept; Montserrat (weight 500) from the Google provider.
- Static configuration module: WhatsApp number and default message, contact email/phone, Instagram URL, navigation items with a visibility flag, general site copy outside the biography.
- Shared `BaseLayout` with `<html lang="es">`, head metadata, header (icons + nav from config) and footer.
- Placeholder image references for development.
- An index page that renders the shell with placeholder section stubs so the layout can be validated.

Out of scope (owned by later modules): Sanity schemas and queries, real homepage sections, lightbox, carousel, contact form, SEO polish, Cloudflare deployment.

## Constraints and decisions

- Language of the site: Spanish. Language of code, comments, and docs: English.
- Header nav keeps the mockup structure; items whose pages do not exist yet (Estudio, Exteriores, Domicilio, Eventos, Temporada) are defined in config but hidden. "Reserva Online" links to WhatsApp.
- Hero is a single image (optional mobile variant), not a slider.
- Design annotation text ("zoom cuando pasas el mouse") must never render as content.
- Font web-use licensing (Futura BT, Adelia, Minion) is still to be confirmed before production; files are used as supplied during development.
- Cost: free tiers only. No paid services.
- Fonts source folder: `~/Downloads/Photography studio` (adelia.ttf, DMSans-VariableFont_opsz,wght.ttf, futura light bt.ttf, MinionVariableConcept-Roman.otf).
- Mockups: `tmp/pdfs/maqueta/page-1.png` (desktop), `page-3.png` (mobile). `page-2.png` is an out-of-scope category template.

## TDD

- Mode: off (no project or session configuration enables it; the user did not request it).
- Source: default.
- Runner: none installed yet. Functional checks are `pnpm astro check` and `pnpm build`.

## Tasks

- [x] SF-01 Scaffold the Astro project with `pnpm create astro@latest` (template `minimal`, no git, install deps) and merge the generated files into the repository root without overwriting existing docs. Initialize git on `main` and add the `origin` remote.
- [x] SF-02 Add design tokens (`src/styles/tokens.css`) and global styles (`src/styles/global.css`): palette from the mockup, fluid type scale, spacing, radii, breakpoints, reduced-motion aware transitions.
- [x] SF-03 Copy the four supplied font files into `src/assets/fonts/` and configure the Astro fonts API in `astro.config.mjs` (local provider for the four files, Google provider for Montserrat 500). Expose role variables: display, body, serif, script, ui.
- [x] SF-04 Create `src/config/site.ts` with typed static configuration: WhatsApp number and default message, contact email/phone, Instagram URL, navigation items with `visible`, and general site copy (welcome heading/paragraphs, section headings, CTA labels, footer).
- [x] SF-05 Build `src/layouts/BaseLayout.astro`, `src/components/Header.astro`, `src/components/Footer.astro`, and `src/pages/index.astro` rendering placeholder section stubs (hero, welcome, portfolio, biography, services, contact, instagram) with the shared layout.
- [x] SF-06 Add development placeholder assets (`src/data/placeholders.ts`) with representative image references and alt text for hero, portfolio, biography portrait, and service cards.
- [x] SF-07 Verify: `pnpm astro check` passes with zero errors, `pnpm build` succeeds, dev server renders the index page.

## Acceptance criteria

- The project builds from a clean clone with `pnpm install && pnpm build`.
- `pnpm astro check` reports zero errors.
- All five font roles resolve to the intended families and render on the index page.
- The header shows WhatsApp and Instagram icons plus only the visible nav items (Inicio, Reserva Online); hidden items are not in the DOM.
- No annotation text from the mockup appears in the page output.
- Tokens are the only place colors, fonts, and spacing values are defined; components reference variables.

## Progress and evidence

- 2026-09-17 SF-01 done. `pnpm create astro@latest photo-studio -- --template minimal --install --no-git --no-ai --skip-houston --yes` ran in a scratch directory (the CLI refuses non-empty targets and with `--yes` would create a random-named subfolder), then the output was merged into the repo root with rsync excluding `node_modules`, followed by `pnpm install`. Result: Astro 7.3.3, TypeScript strict preset. `git init -b main` plus `origin` remote `https://github.com/fernandojne20/photo-studio.git` (remote is empty). Added `@astrojs/check` and `typescript` dev deps for `astro check`. Added `tmp/` to `.gitignore` (design references, 8 MB of PNGs). Nothing committed yet.

Mockup findings recorded for later modules: the desktop first nav item is labelled "Lau" (active pill); the mobile header shows "LAURY HERRERA" top-left plus a hamburger icon top-right; the hero shows slider dots under the CTA but the intent fixes a single hero image; the mobile footer shows the email line and WhatsApp/Instagram icons.

- 2026-09-17 SF-02 to SF-06 done by one delegated writer (Sonnet). Files: `src/styles/tokens.css`, `src/styles/global.css`, `src/assets/fonts/*` (4 files), `astro.config.mjs` (fonts API: 4 local families + Montserrat 500 via Google provider), `src/config/site.ts`, `src/data/placeholders.ts`, `src/layouts/BaseLayout.astro`, `src/components/Header.astro`, `src/components/Footer.astro`, `src/components/icons/{WhatsApp,Instagram}.astro`, `src/pages/index.astro`. Writer deviations accepted: `typescript` pinned to `^6.0.3` because TypeScript 7 (native compiler) does not expose the programmatic API `@astrojs/check` needs; DM Sans and Minion weight ranges read from the files' `fvar` tables (100–1000 and 400–700).
- 2026-09-17 Parent verification. Native risk assessment: `medium` (executable change in `astro.config.mjs`), so writer self-verification plus parent readback and spot check. `pnpm astro check`: 0 errors, 0 warnings, 0 hints. `pnpm build`: success, 1 page, Montserrat woff2 downloaded. Preview rendered at 1366 and 393 with Playwright; console: 0 errors, 0 warnings. Built HTML contains only "Lau" and "Reserva Online" nav links; hidden labels and the mockup annotation are absent.
- 2026-09-17 Parent fix after readback: the icon SVGs rendered invisible because a child component's root element does not receive the parent's Astro scoped-style attribute, so the parents' `.header__icon { width; height }` rules never matched. Fixed by giving the icon SVGs `width="1em" height="1em"` and sizing through `font-size` on the wrapping link (Header, Footer, index hero CTA and Instagram link). Also centered the desktop nav (grid `1fr auto 1fr`, icons left as in the mockup) and hid the header icons on mobile (the mobile mockup shows brand + hamburger only). Re-ran `astro check` (0 errors) and `pnpm build` (success); screenshots confirmed icons, centered nav and mobile header.
- Composition notes for `studio-page`: vertical rhythm between sections is generous (about 200px gaps); hero and service card sizing still need mockup-faithful tuning. Placeholders are lazy-loaded picsum images, so full-page screenshots show grey boxes below the fold until scrolled.
- Nothing committed yet. `.atl/` (skill-registry cache) and `.playwright-mcp/` appeared during the session; `.playwright-mcp/` and `tmp/` are gitignored, `.atl/` is left untouched.

## Next step

Feature complete. Pending user decisions: initial commit and push to `main`; Instagram handle; production domain. Next module: `content-management` (Sanity).
