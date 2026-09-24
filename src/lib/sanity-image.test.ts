import { describe, expect, it } from 'vitest';
import type { CmsImage } from '../content/types';
import { buildSanitySrcSet, hotspotObjectPosition, parseAspectRatio } from './sanity-image';

describe('parseAspectRatio', () => {
  it('parses a simple "w / h" ratio', () => {
    expect(parseAspectRatio('4 / 5')).toEqual({ w: 4, h: 5 });
  });

  it('parses a ratio with no surrounding spaces', () => {
    expect(parseAspectRatio('1366/850')).toEqual({ w: 1366, h: 850 });
  });

  it('parses decimal values', () => {
    expect(parseAspectRatio('16.5 / 9.2')).toEqual({ w: 16.5, h: 9.2 });
  });

  it('tolerates extra surrounding whitespace', () => {
    expect(parseAspectRatio('   4 / 5   ')).toEqual({ w: 4, h: 5 });
  });

  it.each(['4:5', '', 'a / b'])('returns null for malformed input %j', (input) => {
    expect(parseAspectRatio(input)).toBeNull();
  });
});

describe('buildSanitySrcSet', () => {
  const placeholder: CmsImage = {
    url: 'https://picsum.photos/seed/lh-hero/1366/850',
    alt: 'Retrato de referencia',
    width: 1366,
    height: 850,
  };

  const sanityImage: CmsImage = {
    source: {
      asset: {
        _id: 'image-58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000-jpg',
        url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000.jpg',
      },
    },
    url: '',
    alt: 'Retrato de familia al aire libre',
    width: 1600,
    height: 1000,
  };

  it('returns the placeholder image as-is, with no srcset, when it has no Sanity source', () => {
    const result = buildSanitySrcSet(placeholder, [400, 800, 1200]);

    expect(result).toEqual({
      src: placeholder.url,
      width: placeholder.width,
      height: placeholder.height,
    });
    expect(result.srcset).toBeUndefined();
  });

  it('builds width-only candidates with no height or crop when no aspect ratio is given', () => {
    const widths = [400, 800, 1200];
    const result = buildSanitySrcSet(sanityImage, widths);

    const candidates = (result.srcset ?? '').split(', ');
    expect(candidates).toHaveLength(widths.length);

    candidates.forEach((candidate, index) => {
      const [rawUrl, descriptor] = candidate.split(' ');
      expect(descriptor).toBe(`${widths[index]}w`);

      const url = new URL(rawUrl);
      expect(url.searchParams.get('w')).toBe(String(widths[index]));
      expect(url.searchParams.get('h')).toBeNull();
      expect(url.searchParams.get('fit')).toBeNull();
      expect(url.searchParams.get('auto')).toBe('format');
    });

    expect(result.width).toBe(sanityImage.width);
    expect(result.height).toBe(sanityImage.height);
  });

  it('builds URLs against the injected test project and dataset, not a real project', () => {
    const result = buildSanitySrcSet(sanityImage, [400]);
    const url = new URL(result.src);

    expect(url.host).toBe('cdn.sanity.io');
    expect(url.pathname.startsWith('/images/testproject/testdataset/')).toBe(true);
  });

  it('picks the largest requested width as the src', () => {
    const widths = [400, 800, 1200];
    const result = buildSanitySrcSet(sanityImage, widths);

    const largestCandidate = (result.srcset ?? '').split(', ').at(-1);
    const largestUrl = largestCandidate?.split(' ')[0];

    expect(result.src).toBe(largestUrl);
    expect(new URL(result.src).searchParams.get('w')).toBe('1200');
  });

  it('crops every candidate to the requested aspect ratio and derives the returned height from it', () => {
    const result = buildSanitySrcSet(sanityImage, [400, 800], '4 / 5');

    const candidates = (result.srcset ?? '').split(', ');
    const params = candidates.map((candidate) => new URL(candidate.split(' ')[0]).searchParams);

    expect(params[0].get('w')).toBe('400');
    expect(params[0].get('h')).toBe('500');
    expect(params[0].get('fit')).toBe('crop');
    expect(params[0].get('auto')).toBe('format');

    expect(params[1].get('w')).toBe('800');
    expect(params[1].get('h')).toBe('1000');
    expect(params[1].get('fit')).toBe('crop');
    expect(params[1].get('auto')).toBe('format');

    // `result.height` is derived from `image.width` (1600), not from the
    // requested candidate widths above.
    expect(result.height).toBe(2000);
  });

  it('rounds candidate heights to the nearest pixel in both directions for a non-evenly-dividing ratio', () => {
    const result = buildSanitySrcSet(sanityImage, [640, 960, 1600], '1366 / 850');

    const heights = (result.srcset ?? '')
      .split(', ')
      .map((candidate) => new URL(candidate.split(' ')[0]).searchParams.get('h'));

    // 640 * 850 / 1366 = 398.243...  -> rounds down to 398
    // 960 * 850 / 1366 = 597.363...  -> rounds down to 597
    // 1600 * 850 / 1366 = 995.607... -> rounds up to 996
    expect(heights).toEqual(['398', '597', '996']);

    // `result.height` uses `image.width` (1600) directly, matching the
    // 1600-wide candidate above: round(1600 * 850 / 1366) = 996.
    expect(result.height).toBe(996);
  });

  it('rounds the candidate height for a different aspect ratio (393 / 560)', () => {
    const result = buildSanitySrcSet(sanityImage, [400], '393 / 560');

    const height = new URL((result.srcset ?? '').split(' ')[0]).searchParams.get('h');

    // 400 * 560 / 393 = 569.974... -> rounds up to 570
    expect(height).toBe('570');
  });
});

describe('hotspotObjectPosition', () => {
  const asset = {
    _id: 'image-58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000-jpg',
    url: 'https://cdn.sanity.io/images/testproject/testdataset/58d0568299b6fbbda3ba967e83dd2e0554fe3eda-1600x1000.jpg',
  };
  const imageWith = (source: Record<string, unknown> | undefined): CmsImage => ({
    source: source as CmsImage['source'],
    url: '',
    alt: 'Retrato',
    width: 1600,
    height: 1000,
  });

  it('returns undefined (centered) for a placeholder with no Sanity source', () => {
    expect(hotspotObjectPosition(imageWith(undefined))).toBeUndefined();
  });

  it('returns undefined (centered) when the editor set no hotspot', () => {
    expect(hotspotObjectPosition(imageWith({ asset }))).toBeUndefined();
  });

  it('uses the hotspot as-is when there is no crop', () => {
    expect(
      hotspotObjectPosition(
        imageWith({ asset, hotspot: { x: 0.8, y: 0.25, width: 0.3, height: 0.3 } }),
      ),
    ).toBe('80% 25%');
  });

  it('re-expresses the hotspot inside the editor crop, which the delivered image is already cut to', () => {
    const crop = { top: 0, bottom: 0.2, left: 0.1, right: 0.1 };
    const hotspot = { x: 0.7, y: 0.4, width: 0.2, height: 0.2 };
    // x: (0.7 - 0.1) / 0.8 = 0.75, y: (0.4 - 0) / 0.8 = 0.5
    expect(hotspotObjectPosition(imageWith({ asset, hotspot, crop }))).toBe('75% 50%');
  });

  it('clamps a hotspot that falls outside the crop to the nearest edge', () => {
    const crop = { top: 0.5, bottom: 0, left: 0, right: 0.5 };
    const hotspot = { x: 0.9, y: 0.1, width: 0.1, height: 0.1 };
    expect(hotspotObjectPosition(imageWith({ asset, hotspot, crop }))).toBe('100% 0%');
  });

  it('returns undefined (centered) for a degenerate crop with no area', () => {
    const crop = { top: 0, bottom: 0, left: 0.5, right: 0.5 };
    const hotspot = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
    expect(hotspotObjectPosition(imageWith({ asset, hotspot, crop }))).toBeUndefined();
  });

  it('pairs with a width-only srcset that keeps the editor crop, so the percentages refer to the same pixels', () => {
    const crop = { top: 0, bottom: 0.2, left: 0.1, right: 0.1 };
    const hotspot = { x: 0.7, y: 0.4, width: 0.2, height: 0.2 };
    const url = new URL(buildSanitySrcSet(imageWith({ asset, hotspot, crop }), [800]).src);
    // 1600x1000 asset cut to left 10%, right 10%, bottom 20%: x 160, y 0, 1280x800.
    expect(url.searchParams.get('rect')).toBe('160,0,1280,800');
    expect(url.searchParams.get('fit')).toBeNull();
  });
});
