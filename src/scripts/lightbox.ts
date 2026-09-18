import PhotoSwipeLightbox from 'photoswipe/lightbox';

/**
 * Initializes the PhotoSwipe lightbox for one gallery container. Loaded and
 * called from an inline `<script>` in `PortfolioGrid.astro`, never imported
 * server-side: labels arrive through the gallery's own `data-*` attributes
 * instead of `src/config/site.ts`, and the PhotoSwipe core is loaded lazily
 * through `pswpModule` so it ships only once a photo is opened.
 */

const CAPTION_SELECTOR = '[data-lightbox-caption]';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface GalleryLabels {
  closeTitle?: string;
  zoomTitle?: string;
  arrowPrevTitle?: string;
  arrowNextTitle?: string;
  errorMsg?: string;
  indexIndicatorSep?: string;
}

function readLabels(gallery: HTMLElement): GalleryLabels {
  const { closeTitle, zoomTitle, arrowPrevTitle, arrowNextTitle, errorMsg, indexIndicatorSep } =
    gallery.dataset;
  return { closeTitle, zoomTitle, arrowPrevTitle, arrowNextTitle, errorMsg, indexIndicatorSep };
}

/**
 * Registers a text-only caption UI element (PhotoSwipe has no built-in
 * caption), updated on every slide change from the current slide's trigger
 * element (the `<a>` clicked to open it), which carries the hidden caption
 * span rendered by `PortfolioGrid.astro`.
 */
function registerCaption(lightbox: PhotoSwipeLightbox): void {
  lightbox.on('uiRegister', () => {
    lightbox.pswp?.ui?.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (element, pswp) => {
        element.classList.add('pswp__custom-caption');

        const updateCaption = () => {
          const triggerElement = pswp.currSlide?.data.element;
          const captionElement = triggerElement?.querySelector<HTMLElement>(CAPTION_SELECTOR);
          // Captions are CMS content: set as text, never as HTML.
          element.textContent = captionElement?.textContent?.trim() ?? '';
        };

        updateCaption();
        pswp.on('change', updateCaption);
      },
    });
  });
}

export function initLightbox(gallery: HTMLElement): PhotoSwipeLightbox {
  const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;

  const lightbox = new PhotoSwipeLightbox({
    gallery,
    children: 'a',
    pswpModule: () => import('photoswipe'),
    ...readLabels(gallery),
    trapFocus: true,
    returnFocus: true,
    escKey: true,
    arrowKeys: true,
    showHideAnimationType: prefersReducedMotion ? 'none' : 'zoom',
    showAnimationDuration: prefersReducedMotion ? 0 : undefined,
    hideAnimationDuration: prefersReducedMotion ? 0 : undefined,
    zoomAnimationDuration: prefersReducedMotion ? 0 : undefined,
  });

  registerCaption(lightbox);
  lightbox.init();

  return lightbox;
}
