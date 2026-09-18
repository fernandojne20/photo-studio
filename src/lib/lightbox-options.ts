/**
 * Pure PhotoSwipe option building for `src/scripts/lightbox.ts`, kept free
 * of any `photoswipe` import so it can be unit-tested in Node.
 *
 * PhotoSwipe's core merges options as `{ ...defaultOptions, ...options }`
 * (see `_prepareOptions` in `photoswipe/dist/photoswipe.esm.js`): a key that
 * is *present* with value `undefined` still overwrites a perfectly good
 * default, it does not fall back to it. A stray `showAnimationDuration:
 * undefined` renders as the CSS custom property `"undefinedms"` (no
 * animation plays), and a stray `closeTitle: undefined` erases PhotoSwipe's
 * own English default title. Every key `buildLightboxOptions` returns is
 * guaranteed to have a real, defined value; a label or an animation setting
 * that does not apply is left out of the object entirely, never set to
 * `undefined`.
 */

export interface GalleryLabels {
  closeTitle?: string;
  zoomTitle?: string;
  arrowPrevTitle?: string;
  arrowNextTitle?: string;
  errorMsg?: string;
  indexIndicatorSep?: string;
}

export interface BuildLightboxOptionsInput {
  labels: GalleryLabels;
  prefersReducedMotion: boolean;
}

export interface LightboxOptions extends GalleryLabels {
  showHideAnimationType?: 'none';
  showAnimationDuration?: number;
  hideAnimationDuration?: number;
  zoomAnimationDuration?: number;
}

/** Drops every key whose value is `undefined`, keeping the rest untouched. */
function withoutUndefined<T extends object>(input: T): Partial<T> {
  const result: Partial<T> = {};

  (Object.keys(input) as Array<keyof T>).forEach((key) => {
    const value = input[key];
    if (value !== undefined) {
      result[key] = value;
    }
  });

  return result;
}

export function buildLightboxOptions({
  labels,
  prefersReducedMotion,
}: BuildLightboxOptionsInput): LightboxOptions {
  const definedLabels = withoutUndefined(labels);

  if (!prefersReducedMotion) {
    return definedLabels;
  }

  return {
    ...definedLabels,
    showHideAnimationType: 'none',
    showAnimationDuration: 0,
    hideAnimationDuration: 0,
    zoomAnimationDuration: 0,
  };
}
