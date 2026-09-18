import { describe, expect, it } from 'vitest';
import type { CmsImage } from '../content/types';
import { buildSanitySrcSet, parseAspectRatio } from './sanity-image';

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
