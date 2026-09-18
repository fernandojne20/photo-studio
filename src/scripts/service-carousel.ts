import EmblaCarousel from 'embla-carousel';
import type { EmblaOptionsType } from 'embla-carousel';

/**
 * Initializes the Embla carousel for one service-cards region. Loaded and
 * called from an inline `<script>` in `ServicesCarousel.astro`, itself only
 * rendered when `shouldUseCarousel` says the card count overflows the
 * static grid, so this module (and the Embla core it imports) never ships
 * on a page where the static grid is enough. Labels are already rendered on
 * the markup by the Astro component (`aria-label` on the region and
 * buttons), so this script never needs `src/config/site.ts`.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const MOBILE_QUERY = '(max-width: 900px)';

export function initServiceCarousel(root: HTMLElement): void {
  const viewport = root.querySelector<HTMLElement>('[data-carousel-viewport]');
  const prevButton = root.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const nextButton = root.querySelector<HTMLButtonElement>('[data-carousel-next]');

  if (!viewport || !prevButton || !nextButton) return;

  const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const mobileQuery = window.matchMedia(MOBILE_QUERY);

  const options: EmblaOptionsType = {
    align: 'start',
    containScroll: 'trimSnaps',
    slidesToScroll: 1,
    // Mobile stays the stacked layout and never runs Embla (see the
    // `@media (max-width: 900px)` override in `ServicesCarousel.astro`).
    breakpoints: {
      [MOBILE_QUERY]: { active: false },
    },
  };
  // Reduced motion: jumps instead of animated scrolling, no carousel
  // easing. A duration of 0 is Embla's own instant-scroll behavior (the
  // same value it substitutes internally for a `jump` call).
  if (prefersReducedMotion) {
    options.duration = 0;
  }

  const emblaApi = EmblaCarousel(viewport, options);

  const updateButtons = (): void => {
    const isMobile = mobileQuery.matches;
    prevButton.hidden = isMobile;
    nextButton.hidden = isMobile;
    prevButton.disabled = !emblaApi.canScrollPrev();
    nextButton.disabled = !emblaApi.canScrollNext();

    // On mobile the cards are a plain stacked list: announcing a carousel
    // or adding a tab stop that scrolls nothing would mislead keyboard and
    // screen reader users, so both are dropped there and restored on desktop.
    if (isMobile) {
      root.removeAttribute('tabindex');
      root.removeAttribute('aria-roledescription');
    } else {
      root.setAttribute('tabindex', '0');
      root.setAttribute('aria-roledescription', 'carousel');
    }
  };

  emblaApi.on('select', updateButtons);
  emblaApi.on('reInit', updateButtons);
  mobileQuery.addEventListener('change', updateButtons);

  prevButton.addEventListener('click', () => emblaApi.scrollPrev());
  nextButton.addEventListener('click', () => emblaApi.scrollNext());

  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      emblaApi.scrollPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      emblaApi.scrollNext();
    }
  });

  // Switches the viewport from the no-JS scroll-snap fallback to Embla's
  // own transform-based scrolling (see the `[data-carousel-ready]` rule in
  // `ServicesCarousel.astro`), and reveals the previously hidden buttons.
  root.dataset.carouselReady = 'true';
  updateButtons();
}
