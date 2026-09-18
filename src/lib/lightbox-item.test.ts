import { describe, expect, it } from 'vitest';
import type { CmsImage } from '../content/types';
import { buildLightboxItem } from './lightbox-item';

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
    // the uncropped 4000x3000 asset gives three candidates (first test
    // above), so this proves the crop, not the original width, drives it.
    const result = buildLightboxItem(sanityImage({}, { left: 0.4, right: 0.4, top: 0, bottom: 0 }));

    expect(widthDescriptors(result.srcset)).toEqual(['800w']);
    expect(result.width).toBe(800);
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
