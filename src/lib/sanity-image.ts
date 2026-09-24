import { urlFor } from '../sanity/image';
import type { CmsImage } from '../content/types';

/**
 * Shared `src`/`srcset` construction for Sanity-backed images, used by both
 * `SanityImage.astro` (single `<img>`) and `Hero.astro` (which also needs a
 * `<source>` variant for its mobile image inside a `<picture>`). Kept out of
 * `src/sanity/` since that directory is owned by the `content-management`
 * module.
 */

export interface ParsedAspectRatio {
  w: number;
  h: number;
}

/** Parses a CSS `aspect-ratio` value like `"4 / 5"` into its numeric parts. */
export function parseAspectRatio(ratio: string): ParsedAspectRatio | null {
  const match = ratio.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return { w: Number(match[1]), h: Number(match[2]) };
}

interface HotspotSource {
  hotspot?: { x: number; y: number } | null;
  crop?: { top: number; bottom: number; left: number; right: number } | null;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * CSS `object-position` that keeps the editor's hotspot inside a frame whose
 * aspect ratio is not known at build time (it follows the content's height).
 * A fixed-ratio CDN crop would be cropped a second time by `object-fit: cover`
 * around the center; with `P% Q%`, the image point at P%/Q% lands on the same
 * point of the frame, so the hotspot is never cut off. The hotspot is relative
 * to the whole asset, while the delivered image is already cut to the editor's
 * crop, so it is re-expressed inside the crop. `undefined` means "center".
 */
export function hotspotObjectPosition(image: CmsImage): string | undefined {
  const source = image.source as HotspotSource | undefined;
  const hotspot = source?.hotspot;
  if (!hotspot) return undefined;
  const crop = source.crop ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const cropWidth = 1 - crop.left - crop.right;
  const cropHeight = 1 - crop.top - crop.bottom;
  if (cropWidth <= 0 || cropHeight <= 0) return undefined;
  const x = clampUnit((hotspot.x - crop.left) / cropWidth);
  const y = clampUnit((hotspot.y - crop.top) / cropHeight);
  const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;
  return `${percent(x)} ${percent(y)}`;
}

export interface SanitySrcSet {
  src: string;
  srcset?: string;
  width: number;
  height: number;
}

/**
 * Builds a `src`/`srcset` pair for a `CmsImage` through `urlFor()`, applying
 * hotspot-aware cropping when a fixed aspect ratio is requested. Placeholder
 * images (no `source`) have no Sanity asset to derive variants from, so they
 * are returned as-is with their own dimensions and no `srcset`.
 */
export function buildSanitySrcSet(
  image: CmsImage,
  widths: number[],
  aspectRatio?: string,
): SanitySrcSet {
  if (!image.source) {
    return { src: image.url, width: image.width, height: image.height };
  }

  const source = image.source;
  const parsedRatio = aspectRatio ? parseAspectRatio(aspectRatio) : null;

  const buildUrl = (w: number): string => {
    let chain = urlFor(source).width(w);
    if (parsedRatio) {
      const h = Math.round((w * parsedRatio.h) / parsedRatio.w);
      chain = chain.height(h).fit('crop');
    }
    return chain.auto('format').url();
  };

  const largest = widths[widths.length - 1];
  const srcset = widths.map((w) => `${buildUrl(w)} ${w}w`).join(', ');
  const width = parsedRatio ? image.width || largest : image.width;
  const height = parsedRatio ? Math.round((width * parsedRatio.h) / parsedRatio.w) : image.height;

  return { src: buildUrl(largest), srcset, width, height };
}
