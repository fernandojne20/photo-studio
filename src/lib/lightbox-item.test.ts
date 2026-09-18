import { describe, expect, it } from 'vitest';
import type { CmsImage } from '../content/types';
import { buildLightboxItem } from './lightbox-item';
import type { LightboxItem } from './lightbox-item';

interface CropFractions {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function sanityImage(overrides: Partial<CmsImage> = {}, crop?: CropFractions): CmsImage {
  return {
    source: {
      asset: {
        _id: 'image-58d0568299b6fbbda3ba967e83dd2e0554fe3eda-4000x3000-jpg',
        url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-4000x3000.jpg',
      },
      ...(crop ? { crop: { _type: 'sanity.imageCrop', ...crop } } : {}),
    },
    url: '',
    alt: 'Retrato de familia al aire libre',
    width: 4000,
    height: 3000,
    ...overrides,
  };
}

function widthDescriptors(srcset: string | undefined): string[] {
  return (srcset ?? '').split(', ').map((candidate) => candidate.split(' ')[1]);
}

describe('buildLightboxItem', () => {
  it('builds three candidates for an uncropped 4000x3000 asset, largest is 2400x1800', () => {
    const result = buildLightboxItem(sanityImage());

    expect(widthDescriptors(result.srcset)).toEqual(['1200w', '1600w', '2400w']);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1800);
  });

  it('gives 1200w and 1600w for a 1600x1000 asset, with no upscaling beyond it', () => {
    const result = buildLightboxItem(sanityImage({ width: 1600, height: 1000 }));

    expect(widthDescriptors(result.srcset)).toEqual(['1200w', '1600w']);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1000);
  });

  it('offers an image that sits between two steps at its full width, not capped at the step below', () => {
    const result = buildLightboxItem(sanityImage({ width: 2000, height: 1500 }));

    expect(widthDescriptors(result.srcset)).toEqual(['1200w', '1600w', '2000w']);
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1500);
  });

  it('gives a single 800w candidate for an 800x600 asset smaller than every candidate width', () => {
    const result = buildLightboxItem(sanityImage({ width: 800, height: 600 }));

    expect(widthDescriptors(result.srcset)).toEqual(['800w']);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('applies the Studio crop before computing the displayed dimensions and candidates', () => {
    // displayed width = 4000 * (1 - 0.1 - 0.1) = 3200
    // displayed height = 3000 * (1 - 0 - 0.2) = 2400
    const result = buildLightboxItem(
      sanityImage({}, { left: 0.1, right: 0.1, top: 0, bottom: 0.2 }),
    );

    expect(widthDescriptors(result.srcset)).toEqual(['1200w', '1600w', '2400w']);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1800);
  });

  it('shrinks the candidate set when a wide crop leaves a small displayed width', () => {
    // displayed width = 4000 * (1 - 0.4 - 0.4) = 800, below every candidate;
    // displayed height = 3000 * (1 - 0 - 0) = 3000, untouched (top/bottom
    // are both 0); the uncropped 4000x3000 asset gives three candidates
    // (first test above), so this proves the crop, not the original width,
    // drives it.
    const result = buildLightboxItem(sanityImage({}, { left: 0.4, right: 0.4, top: 0, bottom: 0 }));

    expect(widthDescriptors(result.srcset)).toEqual(['800w']);
    expect(result.width).toBe(800);
    expect(result.height).toBe(3000);
  });

  it('applies the width and height crop fractions to their own axis, not swapped', () => {
    // displayed width = 4000 * (1 - 0.1 - 0.1) = 3200
    // displayed height = 3000 * (1 - 0 - 0.5) = 1500
    // Unlike the crop test above, left+right (0.2) differs from top+bottom
    // (0.5), so swapping the axis pairs in the production math would change
    // this result — it would not for that other test.
    const result = buildLightboxItem(
      sanityImage({}, { left: 0.1, right: 0.1, top: 0, bottom: 0.5 }),
    );

    expect(widthDescriptors(result.srcset)).toEqual(['1200w', '1600w', '2400w']);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1125);
  });

  it('builds URLs with width and auto=format only, no height or fit, against testproject/testdataset', () => {
    const result = buildLightboxItem(sanityImage());
    const candidates = (result.srcset ?? '').split(', ');

    candidates.forEach((candidate, index) => {
      const [rawUrl, descriptor] = candidate.split(' ');
      const url = new URL(rawUrl);

      expect(url.host).toBe('cdn.sanity.io');
      expect(url.pathname.startsWith('/images/testproject/testdataset/')).toBe(true);
      expect(url.searchParams.get('w')).toBe(descriptor.replace('w', ''));
      expect(url.searchParams.get('auto')).toBe('format');
      expect(url.searchParams.get('h')).toBeNull();
      expect(url.searchParams.get('fit')).toBeNull();
      if (index === candidates.length - 1) {
        expect(result.href).toBe(rawUrl);
      }
    });
  });

  it('passes a placeholder image through unchanged, with no srcset', () => {
    const placeholder: CmsImage = {
      url: 'https://picsum.photos/seed/lh-p1/480/600',
      alt: 'Fotografía de portafolio de referencia 1.',
      width: 480,
      height: 600,
    };

    const result = buildLightboxItem(placeholder);

    expect(result).toEqual({
      href: placeholder.url,
      width: placeholder.width,
      height: placeholder.height,
      alt: placeholder.alt,
    });
    expect(result.srcset).toBeUndefined();
  });

  it('trims a caption and omits it when blank or missing', () => {
    const image = sanityImage();

    expect(buildLightboxItem(image, '  Sesión en exteriores  ').caption).toBe(
      'Sesión en exteriores',
    );
    expect(buildLightboxItem(image, '   ').caption).toBeUndefined();
    expect(buildLightboxItem(image).caption).toBeUndefined();
  });
});

describe('buildLightboxItem — degenerate crop fractions', () => {
  // Every crop below is degenerate and must be ignored entirely, falling
  // back to the uncropped 4000x3000 result: three candidates, largest
  // 2400x1800 (same as the first `buildLightboxItem` test above).
  const expectUncropped = (result: LightboxItem) => {
    expect(widthDescriptors(result.srcset)).toEqual(['1200w', '1600w', '2400w']);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1800);
  };

  it('ignores a crop whose fractions sum to exactly 1 on an axis', () => {
    expectUncropped(
      buildLightboxItem(sanityImage({}, { left: 0.5, right: 0.5, top: 0, bottom: 0 })),
    );
  });

  it('ignores a crop whose fractions sum above 1 on an axis', () => {
    expectUncropped(
      buildLightboxItem(sanityImage({}, { left: 0.6, right: 0.6, top: 0, bottom: 0 })),
    );
  });

  it('ignores a crop with a negative fraction', () => {
    // left + right = -0.2 + 0.1 = -0.1, which would pass a sum-only check
    // and *widen* the displayed width past the original (an upscale) if the
    // per-fraction `>= 0` guard were missing; a canceling pair like
    // `-0.1/0.1` would net to the same uncropped width either way and not
    // actually prove this guard.
    expectUncropped(
      buildLightboxItem(sanityImage({}, { left: -0.2, right: 0.1, top: 0, bottom: 0 })),
    );
  });

  it('ignores a crop with a NaN fraction (typeof NaN === "number", so a plain typeof check is not enough)', () => {
    expectUncropped(
      buildLightboxItem(sanityImage({}, { left: 0.1, right: 0.1, top: NaN, bottom: 0 })),
    );
  });
});

describe('buildLightboxItem — unusable base dimensions', () => {
  it('passes a Sanity-backed image with zero width through unchanged, with no srcset and no NaN', () => {
    const image = sanityImage({
      width: 0,
      url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-4000x3000.jpg',
    });

    const result = buildLightboxItem(image);

    expect(result).toEqual({
      href: image.url,
      width: 0,
      height: 3000,
      alt: image.alt,
    });
    expect(result.srcset).toBeUndefined();
    expect(Number.isNaN(result.width)).toBe(false);
    expect(Number.isNaN(result.height)).toBe(false);
  });

  it('passes a Sanity-backed image with zero height through unchanged, with no srcset and no NaN', () => {
    const image = sanityImage({
      height: 0,
      url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-4000x3000.jpg',
    });

    const result = buildLightboxItem(image);

    expect(result).toEqual({
      href: image.url,
      width: 4000,
      height: 0,
      alt: image.alt,
    });
    expect(result.srcset).toBeUndefined();
    expect(Number.isNaN(result.width)).toBe(false);
    expect(Number.isNaN(result.height)).toBe(false);
  });
});
