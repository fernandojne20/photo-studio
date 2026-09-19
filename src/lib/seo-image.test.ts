import { describe, expect, it } from 'vitest';
import { resolveShareImage } from './seo-image';
import type { CmsImage } from '../content/types';

describe('resolveShareImage', () => {
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

  const placeholder: CmsImage = {
    url: 'https://picsum.photos/seed/lh-hero/1366/850',
    alt: 'Retrato de referencia',
    width: 1366,
    height: 850,
  };

  it('is undefined for an undefined image', () => {
    expect(resolveShareImage(undefined)).toBeUndefined();
  });

  it('is undefined for a placeholder image with no Sanity source', () => {
    expect(resolveShareImage(placeholder)).toBeUndefined();
  });

  it('builds a 1200x630 cropped, forced-JPEG URL and reuses the hero alt text', () => {
    const result = resolveShareImage(sanityImage);
    expect(result).toBeDefined();

    const url = new URL(result!.url);
    expect(url.host).toBe('cdn.sanity.io');
    expect(url.searchParams.get('w')).toBe('1200');
    expect(url.searchParams.get('h')).toBe('630');
    expect(url.searchParams.get('fit')).toBe('crop');
    expect(url.searchParams.get('fm')).toBe('jpg');
    expect(result!.width).toBe(1200);
    expect(result!.height).toBe(630);
    expect(result!.alt).toBe(sanityImage.alt);
  });

  it('omits alt when the hero alt text is empty', () => {
    const result = resolveShareImage({ ...sanityImage, alt: '' });
    expect(result).toBeDefined();
    expect('alt' in result!).toBe(false);
  });

  it('omits alt when the hero alt text is whitespace-only', () => {
    const result = resolveShareImage({ ...sanityImage, alt: '   ' });
    expect(result).toBeDefined();
    expect('alt' in result!).toBe(false);
  });
});
