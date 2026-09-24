# Feature: biography-design-fidelity

Follow-up to `studio-page` (see `odd/tasks/studio-page.md`). Opened 2026-09-24, after the user compared the running site with the mockups.

## Objective

Make the biography section match the supplied mockups (`tmp/pdfs/maqueta/page-1.png` desktop at 1366 px, `page-3.png` mobile at 393 px) in the four places the user reported, without changing the text sizes and colors the user accepted.

## Problem and why

Measured on 2026-09-24 against the mockups at real size and the live page at 1366 px:

- Desktop: in the mockup the portrait covers the whole section and fades to black on the left (row luminance rises smoothly from 8 at x=0 to about 44 at x=900). The text sits on the dark side. The build places the image in the right grid column, 580×773 at x=787 inside a 1366×965 section, so its edge shows.
- "LAURY HERRERA": mockup Montserrat at about 20 px with about 1.1em tracking, 454 px wide against a 486 px paragraph (93%). Build: 22 px with 0.45em, 322 px against 580 px (56%).
- Call to action: the mockup renders Minion at about 37 px desktop (cap height 24 px) and about 22 px mobile, centered under the text column, with a faint translucent fill and a dim border (about #4a4a4a). The build renders 18 px, left-aligned, transparent, #b5b5b5 border. Minion Variable Concept has an optical-size axis (opsz 6–36) and browsers default to `font-optical-sizing: auto`, so at 18 px it draws the sturdier small-text design; this is why the user saw "a different font".
- Mobile portrait: the mockup is landscape (about 3:2), inset about 40 px per side, with rounded corners (about 24 px). The build is 3:4, full width, square corners.

## Scope

In scope: `src/components/sections/Biography.astro` (markup and styles) and anything a check needs updated because of it.

Out of scope, by the user's decision: body text size and color, heading colors. Also out of scope: other sections, Sanity schema changes, the real portrait upload (content).

## Constraints and decisions

- Desktop portrait is a full-section cover image with a hotspot-aware Sanity crop at the section's frame ratio, the same technique `Hero.astro` uses (`buildSanitySrcSet` with a ratio, `<picture>` with a mobile `<source>`). A left dark gradient guarantees legibility for any photo the editor uploads.
- The text column keeps the shared container's left edge.
- Mobile keeps the stacked order already built (monogram, tagline, portrait, name, body, CTA).
- Accessibility floor unchanged: visible focus ring on the CTA, alt text from Sanity, text contrast unchanged.
- Build verifier and performance budgets must stay green (`pnpm check`).
- TDD: off (no project or session configuration enables it; the user did not request it). Source: default. Runner: Vitest (`pnpm test`).
- One pull request, well under 1000 authored lines.

## Tasks

- [x] BD-01 Desktop: portrait as a full-section background with a hotspot crop, left fade to the section background, text over the dark side.
- [x] BD-02 Name letter spacing about 1.1em at about 20 px, so it spans about the paragraph's width.
- [x] BD-03 Call to action: about 37 px desktop and about 22 px mobile, centered under the text column, faint translucent fill, dim border, tight vertical padding.
- [x] BD-04 Mobile portrait: landscape about 3:2 hotspot crop, inset margins, `--radius-card` corners.
- [x] BD-05 Verify: `pnpm check` green; visual comparison with the mockups at 1366 px and 393 px.

## Acceptance criteria

- At 1366 px the portrait covers the whole section; no image edge is visible.
- The name spans 85–100% of the paragraph width at 1366 px.
- The CTA's cap height is within 15% of the mockup's at 1366 px and 393 px.
- At 393 px the portrait is landscape with rounded corners and side margins.
- `pnpm check` exits 0.

## Progress

- 2026-09-24: measurements taken, branch `fix/biography-design-fidelity` created from `main` 9abb004.
- 2026-09-24: BD-01 to BD-04 written by one writer pass in `src/components/sections/Biography.astro`: `<picture>` with a desktop crop at `1366 / 920` and a mobile `<source>` at `3 / 2`, portrait absolutely positioned behind the text, a `::before` fade, CTA `clamp(1.375rem, 0.981rem + 1.603vw, 2.35rem)` with em padding, translucent fill and dim border, mobile inset `--space-md` plus container padding with `--radius-card`.
- 2026-09-24, parent visual check: the writer's text column (`min(50%, 600px)`) ended at 54% of 1366 px, and the fade (solid to 33%, clear at 62%) left line ends over the photo. Fixed by the parent: the column is `30rem`, the mockup's paragraph width, and the fade is anchored to the column's end through custom properties (solid to the text end plus `--space-lg`, 60% at plus 8vw, clear at plus 20vw). Name tracking recalibrated to 0.95em for the narrower column (the writer's 1.3em was measured against 600 px).
- 2026-09-24, verification. At 1366 px the portrait covers the section (0, 1366×1021), the name spans 97% of the paragraph, the text ends at 46% of the width, and the CTA is 37.6 px, centered on the column. At 393 px the portrait is 313×209 (3:2) at a 40 px inset with 28 px corners, served from the mobile source; the name stays on one line, the CTA is 22 px, and there is no horizontal scroll. `pnpm check`: RC=0, 29 files and 783 tests, budgets ok (stylesheets 6.0 of 7.5 kB). `gentle-ai review assess`: medium (writer self-verification plus the parent's re-run and visual check). RDD off (global).
- Prettier is not idempotent on a multi-line comment placed inside a CSS rule in `.astro` files: each `--write` indents it further. Such comments go above the selector.
- Observed, out of scope: at 393 px the tagline "Creando recuerdos para toda la vida." wraps onto two lines; the mockup shows one line. The tagline styles are unchanged by this branch.

- 2026-09-24: PR #35 opened. CI green (5 of 5).
- 2026-09-24, review bot round 1 (one P2 finding, accepted): the desktop crop requested a fixed `1366 / 920` ratio, but the section's frame follows the text (1366×1021 at 1366 px), so `object-fit: cover` cropped the CDN crop a second time around the center and could clip a subject whose hotspot is near an edge. Fix: desktop requests the full image (the editor's crop still applies as `rect`), and the browser crops it with `object-position` taken from the hotspot, re-expressed inside the editor's crop (`hotspotObjectPosition` in `src/lib/sanity-image.ts`, passed as `--biography-portrait-position` on the wrapper). With `P% Q%` the hotspot is never outside the frame. Mobile keeps the CDN crop because its frame is fixed at 3:2. Tradeoff: a tall photo delivers more pixels on desktop than a cropped one; the portrait is lazy-loaded and outside the byte budgets. Seven new tests; three mutations of the helper were all caught. `pnpm check`: RC=0, 790 tests. Checked live: the portrait still covers 1366×1021, the object position follows the variable (a simulated `80% 20%` was applied), and mobile is unchanged (313×209 from the 3:2 source, no horizontal scroll).

## Next step

The review bot's verdict on the fix; then the user merges.
