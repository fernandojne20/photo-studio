import PhotoSwipeLightbox from 'photoswipe/lightbox';
import { buildLightboxOptions } from '../lib/lightbox-options';
import type { GalleryLabels } from '../lib/lightbox-options';
import { trackAnalyticsEvent } from './analytics';

/**
 * Initializes the PhotoSwipe lightbox for one gallery container. Loaded and
 * called from an inline `<script>` in `PortfolioGrid.astro`, never imported
 * server-side: labels arrive through the gallery's own `data-*` attributes
 * instead of `src/config/site.ts`, and the PhotoSwipe core is loaded lazily
 * through `pswpModule` so it ships only once a photo is opened.
 */

const CAPTION_SELECTOR = '[data-lightbox-caption]';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readLabels(gallery: HTMLElement): GalleryLabels {
  const { closeTitle, zoomTitle, arrowPrevTitle, arrowNextTitle, errorMsg, indexIndicatorSep } =
    gallery.dataset;
  // A missing `data-*` attribute reads as `undefined` here; `buildLightboxOptions`
  // is responsible for dropping those before they ever reach PhotoSwipe.
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

function isHTMLElement(node: Element): node is HTMLElement {
  return node instanceof HTMLElement;
}

/**
 * PhotoSwipe marks its own root `role="dialog"` but never hides the rest of
 * the page from assistive technology, so a screen reader's virtual cursor
 * can still reach the portfolio grid (and every hidden caption span) behind
 * the open lightbox. While open, every other direct child of `document.body`
 * is marked `inert`; only the elements this function itself changed are
 * restored, and only on `close` — which fires before `destroy`.
 *
 * Marking an ancestor of the focused element `inert` forces the browser to
 * blur it immediately. PhotoSwipe's own `returnFocus` option only re-focuses
 * the trigger from `destroy` when its dialog root itself was focused first
 * (`trapFocus`'s `_focusRoot`, which only runs for a keyboard-initiated
 * open, never a pointer click), so for a mouse click it never fires and the
 * trigger element must be re-focused explicitly here instead.
 */
function lockBackgroundWhileOpen(lightbox: PhotoSwipeLightbox): void {
  let inertedChildren: HTMLElement[] = [];
  let previouslyFocusedElement: HTMLElement | null = null;

  // `afterInit` is the PhotoSwipe core's own "opened" event: it fires once
  // the DOM structure (the `.pswp` root) has been created and appended.
  lightbox.on('afterInit', () => {
    const root = lightbox.pswp?.element;
    if (!root) return;

    previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    inertedChildren = Array.from(document.body.children)
      .filter(isHTMLElement)
      .filter((child) => child !== root && !child.inert);

    inertedChildren.forEach((child) => {
      child.inert = true;
    });
  });

  lightbox.on('close', () => {
    inertedChildren.forEach((child) => {
      child.inert = false;
    });
    inertedChildren = [];

    const elementToFocus = previouslyFocusedElement;
    previouslyFocusedElement = null;

    // Deferred: PhotoSwipe's own focus-trap `focusin` listener is still
    // bound during this synchronous `close` dispatch — it is unbound right
    // after, still within the same `close()` call — and would otherwise
    // immediately steal focus back into the (still technically open,
    // mid-close) dialog.
    queueMicrotask(() => {
      elementToFocus?.focus();
    });
  });
}

/** Reports the opened item's 1-based position only, never a caption or URL. */
function trackLightboxOpen(lightbox: PhotoSwipeLightbox): void {
  lightbox.on('afterInit', () => {
    const index = lightbox.pswp?.currIndex;
    if (typeof index === 'number') {
      trackAnalyticsEvent('lightbox_open', { position: index + 1 });
    }
  });
}

export function initLightbox(gallery: HTMLElement): PhotoSwipeLightbox {
  const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const options = buildLightboxOptions({ labels: readLabels(gallery), prefersReducedMotion });

  const lightbox = new PhotoSwipeLightbox({
    gallery,
    children: 'a',
    pswpModule: () => import('photoswipe'),
    ...options,
    trapFocus: true,
    returnFocus: true,
    escKey: true,
    arrowKeys: true,
  });

  registerCaption(lightbox);
  lockBackgroundWhileOpen(lightbox);
  trackLightboxOpen(lightbox);
  lightbox.init();

  return lightbox;
}
