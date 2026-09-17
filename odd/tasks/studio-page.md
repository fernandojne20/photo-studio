# Feature: studio-page

Module ID: `studio-page` (see `CAPABILITY-MAP.md`). Depends on `site-foundation` and `content-management`. Unblocks `media-interactions` and `contact-conversion`.

## Objective

Build the responsive Spanish homepage that closely follows the supplied desktop (1366) and mobile (393) designs, and connect its hero, welcome, portfolio, biography, services, contact, and footer sections to their approved content sources: `getHomeContent()` for CMS content and `src/config/site.ts` for static copy and links.

## Problem and why

The homepage still renders the `site-foundation` stubs with placeholder images and generous, untuned spacing. The photographer's Studio content is live but unused by the site. This module makes the page look like the design and read from Sanity.

## Scope

In scope:

- Replace the stub sections in `src/pages/index.astro` with section components under `src/components/sections/` that receive typed props from `HomeContent` and `site`.
- A `SanityImage` component that renders CMS images through `urlFor()` with hotspot-aware crops, `srcset`/`sizes`, width/height, lazy loading, LQIP background, and that also accepts placeholder images that only carry a `url`.
- Biography body rendered from Portable Text with `astro-portabletext`.
- Mockup-faithful composition for desktop and mobile: hero, welcome with the "Momentos" pill, edge-to-edge 3-column portfolio grid, dark biography block with the portrait bleeding to the right, four rounded service cards (labels overlaid on desktop, below the card on mobile), contact section with the static form layout, Instagram block, footer rhythm.
- Semantics and accessibility: one `h1`, `h2` per section, header/main/footer landmarks, skip link, visible focus, alt text everywhere, reduced-motion respected.

Out of scope (owned by later modules): lightbox, service carousel, hover zoom and touch/keyboard media behavior (`media-interactions`); form validation, Turnstile, submission and success/error states (`contact-conversion`); SEO metadata, analytics, performance budgets, deployment (`production-delivery`).

## Constraints and decisions

- The mockup is the brief: `tmp/pdfs/maqueta/page-1.png` (desktop 1366x5350) and `page-3.png` (mobile 393x4030). Follow it; do not restyle. Reproduce it responsively, not as a fixed canvas.
- Tokens in `src/styles/tokens.css` are the only source of colors, fonts, spacing, radii and motion; adjust or add tokens rather than hardcoding values in components.
- Font roles: `--font-display` (Montserrat) for the wide-tracked uppercase section headings and service labels; `--font-ui` (Futura Light BT) for nav, form labels, footer line; `--font-body` (DM Sans) for paragraphs; `--font-serif` (Minion) for the pill headings and buttons ("Momentos", "Reserva tu sesión", "Enviar"); `--font-script` (Adelia) for the tagline.
- Logo: the "lh" script monogram in the hero and the biography is not available as an asset. Render it as text in `--font-script` inside a `Monogram` component with `aria-hidden` and the site name for assistive tech, so it can be swapped for the designer's SVG later. Open question for the client.
- Images come from the Sanity CDN with `auto=format`, `fit=max` (or `crop` with hotspot when a fixed aspect is required), never from Astro's build-time image service. Placeholders (no `source`) render their `url` directly.
- Hero: single image; `mobileImage` is used through `<picture>` below 640px when present. The mockup's slider dots are not reproduced (intent decision).
- Services on desktop render as a static row of four cards at the design width; overflow behavior and the carousel belong to `media-interactions`. Cards are not links in version one.
- Contact form: static markup only (`Nombre`, `Apellido`, `E-mail*`, `Teléfono`, `Mensaje`, `Enviar`), labels from `site.copy.contactForm`, no submission wiring, no `action`. `contact-conversion` completes it.
- The design annotation "zoom cuando pasas el mouse" must never render.
- Copy is Spanish from `site.ts`; code, comments and class names in English.
- No non-user-triggered motion; only hover and focus transitions using the motion tokens.

## TDD

- Mode: off (no project or session configuration enables it; the user did not request it).
- Source: default.
- Runner: none. Functional checks: `pnpm astro check`, `pnpm build` (production, no fallbacks), `pnpm content:check`, Playwright screenshots at 1366 and 393 reviewed against the mockup, HTML greps for hidden labels, alt attributes and the annotation text.

## Tasks

- [x] SP-01 Content wiring and image component: `src/components/SanityImage.astro`, `src/components/Monogram.astro`, `src/components/PortableTextBody.astro`, section components under `src/components/sections/` (`Hero`, `Welcome`, `PortfolioGrid`, `Biography`, `Services`, `Contact`, `Instagram`), and `src/pages/index.astro` calling `getHomeContent()` and passing typed props.
- [x] SP-02 Desktop composition (1366) matching the mockup section by section, including vertical rhythm, container widths, the edge-to-edge grid, the biography portrait bleed, the card row and the contact two-column layout.
- [x] SP-03 Mobile composition (393): stacked biography order (monogram, tagline, portrait, name, text, CTA), three-column grid, stacked service cards with labels below, contact form with paired fields, footer with icons.
- [x] SP-04 Semantics and accessibility: `h1`, `h2` per section, landmarks, skip link, focus-visible styles, alt text, reduced motion.
- [x] SP-05 Verify: `pnpm astro check` zero errors; `pnpm build` with real content and no fallback warnings; screenshots at 1366 and 393 compared with the mockup; built HTML contains no hidden nav labels, no annotation text, and every `<img>` has `alt`.

## Acceptance criteria

- The homepage renders the seeded Sanity content: hero image, nine portfolio images in order, biography portrait and paragraphs, four service cards in order, with the static copy from `site.ts`.
- Desktop and mobile screenshots read as the mockup: same section order, proportions, typography roles, alignment and colors, within the tolerance of placeholder imagery.
- Every image has alt text and a `srcset` (CMS images) or explicit dimensions (placeholders); no layout shift on load.
- `pnpm build` succeeds with `CONTENT_FALLBACKS` unset and prints no `[content]` warnings.
- Keyboard users can skip to content and see focus on every interactive element.

## Progress and evidence

- 2026-09-17 Logo: the "lh" monogram was traced from page 2 of the mockup (black on white) into `src/assets/logo/lh-monogram.svg` (3 paths, `fill="currentColor"`, tight viewBox). Pipeline: crop, 2000 px upscale, Core Image blur + threshold, potrace, viewBox from a bitmap bbox scan. The `Monogram` component inlines it as an Astro SVG component with a visually hidden site name. The user asked for this replication instead of supplying an asset.
- 2026-09-17 SP-01 to SP-04 done by one delegated writer (Sonnet). New: `src/lib/sanity-image.ts` (`buildSanitySrcSet`, hotspot-aware crop when an aspect ratio is requested), `SanityImage`, `Monogram`, `PortableTextBody`, seven section components, `index.astro` rewritten around `getHomeContent()`; `BaseLayout` gained the skip link, `<main id="main">` and header/footer slots; `site.ts` gained `a11y.skipToContent`; tokens gained the two monogram widths. Writer evidence: `astro check` 0 errors; `pnpm build` with real content and no `[content]` warnings; Playwright screenshots at 1366 and 393; HTML greps clean. Writer fixed a real bug: a parent `:global()` override of a child component's `display` lost to the child's scoped rule (higher specificity from the scope attribute); qualified with the ancestor selector. Accepted deviations: submit button is `type="button"` until `contact-conversion`; contact email/phone lines hidden below 900px as in the mobile mockup; single hairline owned by `Services`; biography name from `site.name`; hero monogram hidden below 900px alongside the header's brand text; hero uses the mockup aspect ratios instead of `100vh`.
- 2026-09-17 Parent verification and fixes. Native risk assessment `medium` (SVG asset flagged as executable), satisfied by writer self-verification plus parent readback of `index.astro`, `Hero.astro`, `SanityImage.astro`, `Instagram.astro`, `Footer.astro`, `Biography.astro`. Resolved the duplicate Instagram icon: the footer no longer renders the desktop icon, the Instagram section owns heading + icon and the footer draws the hairline, and the section is hidden below 900px because the mobile mockup has no Instagram block. Stepped the biography tagline down to `--text-md` so it stays on one line at the design width. Final checks: `pnpm astro check` 0 errors / 0 warnings / 0 hints; `pnpm build` complete with no `[content]` warnings; Playwright at 1366 and 393 with all 15 images loaded and 0 console errors or warnings; built HTML has 1 `h1`, 6 `h2`, 15 `<img>` with 15 `alt`, 16 `srcset`, the skip link to `#main`, no hidden nav labels and no annotation text.
- Known differences: the mobile page is taller than the fixed mockup canvas because the fluid type scale keeps body text readable; service labels sit on bright placeholder photos, so contrast depends on the final imagery.

## Next step

Commit as work units, open the PR. Next modules: `media-interactions` (lightbox, service carousel, hover zoom) and `contact-conversion` (form behavior).
