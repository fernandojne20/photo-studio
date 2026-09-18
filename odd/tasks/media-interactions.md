# Feature: media-interactions

Module ID: `media-interactions` (see `CAPABILITY-MAP.md`). Depends on `studio-page`. Can run in parallel with `contact-conversion`; both feed `production-delivery`.

## Objective

Provide the portfolio lightbox, the service carousel, the hover zoom, and their touch, keyboard, focus and reduced-motion behavior, as enhancements over content that stays usable when client-side JavaScript fails.

## Problem and why

The homepage shows the portfolio grid and the service cards as static images. A prospective client needs to inspect photographs at full size comfortably on phone and desktop, and the service row must keep working when the photographer adds more than four services.

## Scope

In scope:

- Lightbox for the portfolio grid: open from any thumbnail, previous and next, keyboard (arrows, Escape), swipe and pinch zoom on touch, accessible dismissal with focus returned to the trigger, optional captions, Spanish control labels, reduced-motion behavior, full-size responsive images from the Sanity CDN.
- Progressive enhancement: each thumbnail is a plain link to the full image, so the photo still opens without JavaScript.
- Service carousel on desktop when the cards exceed the available width (about four cards at the design width), with previous and next controls, keyboard support and reduced-motion behavior. Mobile keeps the stacked layout.
- Restrained hover zoom on portfolio thumbnails and service cards for hover-capable, fine-pointer devices only, disabled under reduced motion.
- Unit tests for the pure logic; browser verification of the interactions.

Out of scope: category pages or filtering, links on service cards, video, deep links to a specific photo, analytics events (`production-delivery`).

## Constraints and decisions

- Lightbox library: PhotoSwipe 5 (`photoswipe@5.4.4`, MIT, no dependencies; verified from the published package on 2026-09-18: loader 4.5 KB gzip loaded with the page, core 16.4 KB gzip loaded on first open through a dynamic import, CSS 2.4 KB gzip). Chosen over a custom `<dialog>` lightbox because swipe, pinch zoom, preloading and focus management are where hand-rolled lightboxes fail, and pinch zoom matters on a photography site. Tradeoff accepted: the last release is from May 2024. The user was offered both options and asked to continue without choosing, so the recommendation proceeds and is called out in the pull request.
- Carousel library: Embla (`embla-carousel@8.6.0`, MIT, no dependencies), fixed by the intent document.
- The lightbox shows the image as the photographer framed it in the Studio: the Studio `crop` applies, the 4:5 thumbnail crop does not. Full-image dimensions are computed from the asset dimensions and the crop fractions; candidates never exceed the available width. Thumbnails and full images have different ratios, so links carry `data-cropped="true"` for a correct opening animation.
- Captions come from the CMS `caption`; they are rendered inside the link as visually hidden text so they exist without the lightbox, and shown in the lightbox through PhotoSwipe's `uiRegister` API. No extra caption plugin.
- Client scripts do not import `src/config/site.ts` (that would ship the whole copy to the browser). Labels reach the script through `data-*` attributes rendered by the component.
- Reduced motion: no open, close or zoom animation in the lightbox, no carousel easing, no hover zoom.
- Styling through tokens only; PhotoSwipe is themed through its CSS variables.
- Browser scripts are linted with browser globals only and `no-undef` on (see `eslint.config.mjs`).
- TDD: off by default. Tests accompany the pure logic; interactions are verified in a real browser with Playwright.

## Delivery strategy

User rule: pull requests under 1000 authored lines, stacked when bigger; generated or mechanical diffs (lockfile) are valid exceptions. Planned before writing:

1. `feat/media-lightbox` into `main`: tasks MI-01 to MI-04. Estimated 450 to 600 authored lines including tests.
2. `feat/media-carousel` stacked on 1: tasks MI-05 to MI-07. Estimated 350 to 500 authored lines. Stacked rather than parallel because both add a dependency and would conflict in `pnpm-lock.yaml`.

Each pull request is reported as ready only after CI is green and the review bot has had about ten minutes to respond.

## Tasks

- [x] MI-01 Pure lightbox data: `src/lib/lightbox-item.ts` builds the full-image `href`, `srcset`, width and height for a `CmsImage` (crop-aware, no upscaling, placeholders pass through), with unit tests.
- [x] MI-02 Grid markup: thumbnails become links with `data-pswp-*` attributes, `data-cropped`, hidden captions, keyboard focus styles; the page still works with JavaScript disabled.
- [x] MI-03 Lightbox behavior: `src/scripts/lightbox.ts` initializes PhotoSwipe lazily with Spanish labels from `data-*` attributes, the caption element, reduced-motion options and token-based theming.
- [x] MI-04 Verify the lightbox: unit tests, `pnpm check`, and Playwright on the production build: open, next with the keyboard, caption visible for a captioned item, Escape closes and focus returns to the trigger, the core chunk loads only on first open, the link works with JavaScript disabled.
- [ ] MI-05 Service carousel with Embla on desktop when cards overflow; stacked layout unchanged on mobile; controls, keyboard support, reduced motion; pure logic unit-tested.
- [ ] MI-06 Hover zoom on portfolio thumbnails and service cards, gated by `(hover: hover) and (pointer: fine)` and reduced motion.
- [ ] MI-07 Verify the carousel and hover zoom: `pnpm check`, Playwright with four services (static row) and with more than four (carousel active), mobile unaffected.

## Acceptance criteria

- A visitor can open any portfolio photo, move through all photos with arrows, swipe or keys, read the caption when one exists, and close with Escape, the close button or a tap outside, landing back on the thumbnail they opened.
- With JavaScript disabled, clicking a thumbnail opens the full photo.
- With reduced motion requested, nothing animates.
- The page ships no lightbox core code until a photo is opened.
- With more than four visible services the desktop row scrolls as a carousel with reachable controls; with four or fewer it is a static row; mobile stays stacked.
- All checks in `pnpm check` pass; new pure logic has unit tests that fail under mutation.

## Progress and evidence

- 2026-09-18 MI-01 to MI-03 done by one delegated writer (Sonnet) on `feat/media-lightbox`. New: `src/lib/lightbox-item.ts` (pure, crop-aware, type-guarded, no `any`) with tests, `src/scripts/lightbox.ts` (lazy PhotoSwipe init, labels from `data-*`, text-only caption through `uiRegister`, explicit reduced-motion options, focus trap and return, Escape and arrow keys). Modified: `PortfolioGrid.astro` (links with `data-pswp-width`, `data-pswp-height`, `data-pswp-srcset`, `data-cropped`, hidden captions, focus style, `.pswp` theming through tokens), `site.ts` (six Spanish lightbox labels), `placeholders.ts` (a caption on the first placeholder for parity when developing without the CMS), `package.json` and lockfile (`photoswipe@5.4.4`). All PhotoSwipe option names matched the installed types. Writer evidence: `pnpm test` 5 files and 63 tests; `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (39 files, 0 errors) and `pnpm check` exit 0. The writer found that the crop example in the brief preserved the aspect ratio and could not detect an ignored crop, and added a second case (crop left and right 0.4 gives a single `800w` candidate); mutations "ignore the crop" and "drop the no-upscale filter" both fail tests and were reverted. Build: the PhotoSwipe core is its own chunk (`photoswipe.esm.*.js`, about 59 KB raw) and `dist/index.html` references only the small entry script, with no `modulepreload` for the core. Browser on the production preview, 1366x900 and 393x800: no core request before the first click; after clicking the first thumbnail the lightbox opens with the counter `1 de 9`, the close title `Cerrar` and the caption "Sesión en exteriores"; ArrowRight gives `2 de 9` with an empty hidden caption; Escape closes and `document.activeElement` is the first `portfolio__link`; 0 console errors or warnings.
- 2026-09-18 MI-04 and parent fixes. Native risk assessment `medium` (configuration change in `package.json`), satisfied by writer self-verification plus parent readback of `lightbox.ts` and `lightbox-item.ts` and a spot check (`pnpm test` 63 passed, `pnpm lint` clean). Readback found a real flaw in the sizing rule: the condition guarding the "offer the full width" case could never be true, so an image between two steps (2000 px wide) was capped at 1600. Fixed so the displayed width is offered whenever it is below the 2400 maximum and not already a candidate; new test: a 2000x1500 asset gives `1200w`, `1600w`, `2000w` and 2000x1500. No-JavaScript path verified on the built page: the first link's `href` is a Sanity CDN image that returns `200 image/jpeg`; 9 links, all with `target="_blank"`, 3 hidden captions matching the three seeded captions.
- Known limits: reduced motion was verified by reading the options passed to PhotoSwipe, not by emulating the media query in the browser; swipe and pinch were not exercised by automation and rely on PhotoSwipe's own behavior.

## Next step

Open the pull request from `feat/media-lightbox` into `main`; report it ready after CI is green and the review bot has had about ten minutes. Then MI-05 to MI-07 on `feat/media-carousel`, stacked.
