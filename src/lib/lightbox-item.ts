import { urlFor } from '../sanity/image';
import type { SanityImageSource } from '@sanity/image-url';
import type { CmsImage } from '../content/types';

/**
 * Builds the data the portfolio lightbox needs to show a `CmsImage` at full
 * size. Unlike the 4:5 grid thumbnail, the lightbox shows the image as the
 * photographer framed it in the Studio: the Studio `crop` applies, the
 * thumbnail crop does not. See `odd/tasks/media-interactions.md` (MI-01) for
 * the full rationale.
 */

/** Full-image widths offered to the CDN, smallest first. */
const CANDIDATE_WIDTHS = [1200, 1600, 2400];

export interface LightboxItem {
  href: string;
  srcset?: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

interface CropFractions {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCropFractions(value: unknown): value is CropFractions {
  return (
    isRecord(value) &&
    typeof value.left === 'number' &&
    typeof value.right === 'number' &&
    typeof value.top === 'number' &&
    typeof value.bottom === 'number'
  );
}

/**
 * Narrows the CMS image's opaque `source` to its Studio crop fractions, when
 * the source is a plain image object that carries one. `SanityImageSource`
 * also allows a bare asset ID string or reference, neither of which has a
 * `crop`.
 */
function getCropFractions(source: SanityImageSource): CropFractions | null {
  if (!isRecord(source)) return null;
  return isCropFractions(source.crop) ? source.crop : null;
}

/** The widest image the lightbox ever requests. */
const MAX_CANDIDATE_WIDTH = Math.max(...CANDIDATE_WIDTHS);

/**
 * Every `CANDIDATE_WIDTHS` entry that fits inside the displayed width, plus
 * the displayed width itself when it is below the maximum and not already a
 * candidate, so an image between two steps (for example 2000 px) is offered
 * at its full resolution instead of being capped at the step below. Never
 * upscales: every returned value is at most `displayedWidth`.
 */
function buildCandidateWidths(displayedWidth: number): number[] {
  const fitting = CANDIDATE_WIDTHS.filter((candidate) => candidate <= displayedWidth);
  const offersFullWidth = displayedWidth < MAX_CANDIDATE_WIDTH && !fitting.includes(displayedWidth);

  return offersFullWidth ? [...fitting, displayedWidth] : fitting;
}

export function buildLightboxItem(image: CmsImage, caption?: string): LightboxItem {
  const trimmedCaption = caption?.trim();
  const captionField = trimmedCaption ? { caption: trimmedCaption } : {};

  if (!image.source) {
    return {
      href: image.url,
      width: image.width,
      height: image.height,
      alt: image.alt,
      ...captionField,
    };
  }

  const source = image.source;
  const crop = getCropFractions(source);
  const displayedWidth = crop
    ? Math.round(image.width * (1 - crop.left - crop.right))
    : image.width;
  const displayedHeight = crop
    ? Math.round(image.height * (1 - crop.top - crop.bottom))
    : image.height;

  const widths = buildCandidateWidths(displayedWidth);
  const buildUrl = (width: number) => urlFor(source).width(width).auto('format').url();
  const srcset = widths.map((width) => `${buildUrl(width)} ${width}w`).join(', ');

  const largestWidth = widths.at(-1) ?? displayedWidth;
  const height = Math.round((largestWidth * displayedHeight) / displayedWidth);

  return {
    href: buildUrl(largestWidth),
    srcset,
    width: largestWidth,
    height,
    alt: image.alt,
    ...captionField,
  };
}
