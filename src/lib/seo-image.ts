import type { SanityImageSource } from '@sanity/image-url';
import type { CmsImage } from '../content/types';
import { urlFor } from '../sanity/image';

/**
 * The Open Graph/Twitter Card sharing image builder. Kept out of `seo.ts`
 * because it needs `urlFor` from `src/sanity/image.ts`, which throws at
 * import time when the Sanity project id/dataset env vars are missing;
 * `seo.ts` stays free of that dependency so its tests never need them.
 */

export interface ShareImage {
  url: string;
  width: number;
  height: number;
  /** Omitted when the hero's alt text is empty or whitespace-only. */
  alt?: string;
}

const SHARE_IMAGE_WIDTH = 1200;
const SHARE_IMAGE_HEIGHT = 630;

/**
 * Builds the 1200x630 Open Graph/Twitter Card sharing image from the
 * homepage hero. Only a Sanity-backed image (`source` present) can produce
 * an editor-controlled, hotspot-aware crop (hotspot cropping requires
 * `width()` + `height()` + `fit('crop')` together, confirmed in
 * `sanity-image.ts`'s `buildSanitySrcSet`); a placeholder image (the
 * dev/CI fallback in `src/data/placeholders.ts`, used when Sanity content
 * is unavailable and `CONTENT_FALLBACKS=true`) has no `source` and is
 * explicitly a development reference image, not a real photograph of the
 * studio, so no share image is produced for it — see `resolveShareImage`'s
 * caller in `Seo.astro` for how a missing result omits the image tags
 * entirely instead of emitting a placeholder or an empty value.
 *
 * `format('jpg')` (`fm=jpg`) is forced here, unlike the `auto('format')`
 * used for on-page `<img>` srcsets in `sanity-image.ts`: a real browser
 * negotiates its own `Accept` header correctly, but link-preview fetchers
 * (Facebook, Twitter/X, LinkedIn, WhatsApp, Slack) fetch the image once,
 * often without an `Accept` header that reliably advertises AVIF/WebP
 * support, so `auto=format` risks a format some unfurlers cannot render.
 * JPEG is universally supported for link previews.
 */
export function resolveShareImage(image: CmsImage | undefined): ShareImage | undefined {
  if (!image?.source) return undefined;

  const source: SanityImageSource = image.source;
  const url = urlFor(source)
    .width(SHARE_IMAGE_WIDTH)
    .height(SHARE_IMAGE_HEIGHT)
    .fit('crop')
    .format('jpg')
    .url();

  const alt = image.alt.trim();
  return {
    url,
    width: SHARE_IMAGE_WIDTH,
    height: SHARE_IMAGE_HEIGHT,
    ...(alt ? { alt } : {}),
  };
}
