import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveShareImage } from './seo-image';
import type { CmsImage } from '../content/types';

const FALLBACK_ALT = 'Monograma de Laury Herrera';

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

  const siteUrl = new URL('https://www.lauryherrera.example/');

  it('is undefined for an undefined image with no site URL', () => {
    expect(resolveShareImage(undefined, undefined, FALLBACK_ALT)).toBeUndefined();
  });

  it('builds a 1200x630 cropped, forced-JPEG URL from a Sanity-backed hero and reuses its alt text', () => {
    const result = resolveShareImage(sanityImage, siteUrl, FALLBACK_ALT);
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

  it('never produces the fallback for a Sanity-backed hero, even without a site URL', () => {
    const result = resolveShareImage(sanityImage, undefined, FALLBACK_ALT);
    expect(result).toBeDefined();
    expect(result!.url).toContain('cdn.sanity.io');
  });

  it('omits alt when the hero alt text is empty', () => {
    const result = resolveShareImage({ ...sanityImage, alt: '' }, siteUrl, FALLBACK_ALT);
    expect(result).toBeDefined();
    expect('alt' in result!).toBe(false);
  });

  it('omits alt when the hero alt text is whitespace-only', () => {
    const result = resolveShareImage({ ...sanityImage, alt: '   ' }, siteUrl, FALLBACK_ALT);
    expect(result).toBeDefined();
    expect('alt' in result!).toBe(false);
  });

  it('returns the static fallback card for a placeholder image (no Sanity source) once a site URL is known', () => {
    const result = resolveShareImage(placeholder, siteUrl, FALLBACK_ALT);
    expect(result).toEqual({
      url: 'https://www.lauryherrera.example/og-fallback.png',
      width: 1200,
      height: 630,
      alt: FALLBACK_ALT,
    });
  });

  it('returns the static fallback for an undefined image too, once a site URL is known', () => {
    const result = resolveShareImage(undefined, siteUrl, FALLBACK_ALT);
    expect(result).toEqual({
      url: 'https://www.lauryherrera.example/og-fallback.png',
      width: 1200,
      height: 630,
      alt: FALLBACK_ALT,
    });
  });

  it('produces the exact same fallback URL from a site origin with or without a trailing slash', () => {
    const withSlash = resolveShareImage(
      placeholder,
      new URL('https://www.lauryherrera.example/'),
      FALLBACK_ALT,
    );
    const withoutSlash = resolveShareImage(
      placeholder,
      new URL('https://www.lauryherrera.example'),
      FALLBACK_ALT,
    );

    expect(withSlash?.url).toBe('https://www.lauryherrera.example/og-fallback.png');
    expect(withoutSlash?.url).toBe('https://www.lauryherrera.example/og-fallback.png');
  });

  it('is undefined for a placeholder image with no site URL: an image tag must be absolute', () => {
    expect(resolveShareImage(placeholder, undefined, FALLBACK_ALT)).toBeUndefined();
  });

  it('omits alt on the fallback when the fallback alt text is blank', () => {
    const result = resolveShareImage(placeholder, siteUrl, '   ');
    expect(result).toEqual({
      url: 'https://www.lauryherrera.example/og-fallback.png',
      width: 1200,
      height: 630,
    });
    expect('alt' in result!).toBe(false);
  });
});

describe('public/og-fallback.png', () => {
  // Reads the IHDR chunk directly (width/height are big-endian uint32 at
  // byte offsets 16 and 20, right after the 8-byte PNG signature and the
  // 4-byte length + 4-byte "IHDR" type of the first chunk) so a wrong-size
  // replacement file is caught without needing an image-decoding library.
  it('is exactly 1200 by 630, per its own IHDR chunk', () => {
    const pngPath = fileURLToPath(new URL('../../public/og-fallback.png', import.meta.url));
    const buffer = readFileSync(pngPath);

    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });
});
