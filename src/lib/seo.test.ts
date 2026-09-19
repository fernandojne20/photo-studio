import { describe, expect, it } from 'vitest';
import {
  buildJsonLd,
  buildOpenGraphLocale,
  buildRobotsMetaContent,
  buildTwitterCard,
  buildRobotsTxt,
  buildSitemapXml,
  hasRealInstagramHandle,
  resolveIndexingPolicy,
  resolveSiteUrl,
  robotsTxtForSiteUrl,
  serializeJsonLd,
  sitemapXmlForSiteUrl,
} from './seo';

describe('resolveSiteUrl', () => {
  it('accepts a bare https origin', () => {
    const url = resolveSiteUrl('https://www.lauryherrera.example');
    expect(url?.toString()).toBe('https://www.lauryherrera.example/');
  });

  it('accepts a bare origin with a trailing slash', () => {
    const url = resolveSiteUrl('https://www.lauryherrera.example/');
    expect(url?.toString()).toBe('https://www.lauryherrera.example/');
  });

  it('rejects a URL with a path beyond the root', () => {
    expect(resolveSiteUrl('https://www.lauryherrera.example/foo/bar')).toBeUndefined();
  });

  it('rejects a URL with a query string', () => {
    expect(resolveSiteUrl('https://www.lauryherrera.example/?x=1')).toBeUndefined();
  });

  it('rejects a URL with a hash', () => {
    expect(resolveSiteUrl('https://www.lauryherrera.example/#section')).toBeUndefined();
  });

  it('rejects a URL carrying userinfo (a leaked credential), even to an otherwise valid origin', () => {
    expect(resolveSiteUrl('https://user:pass@www.lauryherrera.example/')).toBeUndefined();
    expect(resolveSiteUrl('https://user@www.lauryherrera.example/')).toBeUndefined();
  });

  it('accepts an uppercase scheme and host, normalized to lowercase', () => {
    const url = resolveSiteUrl('HTTPS://WWW.LAURYHERRERA.EXAMPLE');
    expect(url?.toString()).toBe('https://www.lauryherrera.example/');
  });

  it('accepts an explicit port', () => {
    const url = resolveSiteUrl('https://www.lauryherrera.example:8443');
    expect(url?.toString()).toBe('https://www.lauryherrera.example:8443/');
  });

  it('accepts an internationalized hostname, normalized to punycode', () => {
    const url = resolveSiteUrl('https://café.example');
    expect(url?.toString()).toBe('https://xn--caf-dma.example/');
  });

  it('rejects a non-local http:// production URL', () => {
    expect(resolveSiteUrl('http://www.lauryherrera.example')).toBeUndefined();
  });

  it('accepts http://localhost and http://127.0.0.1 for local checks', () => {
    expect(resolveSiteUrl('http://localhost:4321')?.toString()).toBe('http://localhost:4321/');
    expect(resolveSiteUrl('http://127.0.0.1:4321')?.toString()).toBe('http://127.0.0.1:4321/');
  });

  it('rejects a path on the local http exception too', () => {
    expect(resolveSiteUrl('http://localhost:4321/preview')).toBeUndefined();
  });

  it('rejects a non-http(s) scheme', () => {
    expect(resolveSiteUrl('ftp://example.com')).toBeUndefined();
    expect(resolveSiteUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('rejects a malformed or relative value', () => {
    expect(resolveSiteUrl('not a url')).toBeUndefined();
    expect(resolveSiteUrl('/relative/path')).toBeUndefined();
  });

  it('rejects undefined and empty input without throwing', () => {
    expect(resolveSiteUrl(undefined)).toBeUndefined();
    expect(resolveSiteUrl('')).toBeUndefined();
  });
});

describe('resolveIndexingPolicy', () => {
  it('is not indexable and has no canonical when there is no site URL', () => {
    expect(resolveIndexingPolicy(undefined)).toEqual({ indexable: false });
  });

  it('is indexable with a canonical equal to the site URL when one is known', () => {
    const siteUrl = new URL('https://www.lauryherrera.example/');
    expect(resolveIndexingPolicy(siteUrl)).toEqual({
      indexable: true,
      canonical: 'https://www.lauryherrera.example/',
    });
  });

  it('forceNonIndexable overrides a valid site URL (e.g. the 404 page)', () => {
    const siteUrl = new URL('https://www.lauryherrera.example/');
    expect(resolveIndexingPolicy(siteUrl, { forceNonIndexable: true })).toEqual({
      indexable: false,
    });
  });

  it('forceNonIndexable: false behaves like the default', () => {
    const siteUrl = new URL('https://www.lauryherrera.example/');
    expect(resolveIndexingPolicy(siteUrl, { forceNonIndexable: false })).toEqual({
      indexable: true,
      canonical: 'https://www.lauryherrera.example/',
    });
  });
});

describe('buildRobotsMetaContent', () => {
  it('is "noindex, nofollow" when not indexable', () => {
    expect(buildRobotsMetaContent(false)).toBe('noindex, nofollow');
  });

  it('is "index, follow" when indexable', () => {
    expect(buildRobotsMetaContent(true)).toBe('index, follow');
  });
});

describe('buildTwitterCard', () => {
  it('is the large image card when a sharing image exists', () => {
    expect(buildTwitterCard(true)).toBe('summary_large_image');
  });

  it('is the plain summary card when there is no sharing image', () => {
    expect(buildTwitterCard(false)).toBe('summary');
  });
});

describe('buildOpenGraphLocale', () => {
  it('converts the hyphen BCP 47 form to the underscore Open Graph form', () => {
    expect(buildOpenGraphLocale('es-AR')).toBe('es_AR');
  });
});

describe('hasRealInstagramHandle', () => {
  it('is false for the bare instagram.com placeholder used in site.ts today', () => {
    expect(hasRealInstagramHandle('https://www.instagram.com/')).toBe(false);
  });

  it('is false for the platform homepage without a trailing slash', () => {
    expect(hasRealInstagramHandle('https://www.instagram.com')).toBe(false);
  });

  it('is true once a real handle path is configured', () => {
    expect(hasRealInstagramHandle('https://www.instagram.com/lauryherrera/')).toBe(true);
  });

  it('is false for a malformed URL', () => {
    expect(hasRealInstagramHandle('not a url')).toBe(false);
  });
});

describe('buildJsonLd', () => {
  const baseInput = {
    name: 'Laury Herrera',
    telephone: '+5491126821220',
    email: 'lauryherrera.photo@gmail.com',
    instagramUrl: 'https://www.instagram.com/',
  };

  it('includes only the verified facts and omits url/image/sameAs when unknown', () => {
    const jsonLd = buildJsonLd(baseInput);

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: baseInput.name,
      telephone: baseInput.telephone,
      email: baseInput.email,
    });
    expect('url' in jsonLd).toBe(false);
    expect('image' in jsonLd).toBe(false);
    expect('sameAs' in jsonLd).toBe(false);
  });

  it('never includes sameAs for the today-placeholder Instagram URL', () => {
    const jsonLd = buildJsonLd({ ...baseInput, instagramUrl: 'https://www.instagram.com/' });
    expect('sameAs' in jsonLd).toBe(false);
  });

  it('includes sameAs once a real Instagram handle is configured', () => {
    const jsonLd = buildJsonLd({
      ...baseInput,
      instagramUrl: 'https://www.instagram.com/lauryherrera/',
    });
    expect(jsonLd.sameAs).toEqual(['https://www.instagram.com/lauryherrera/']);
  });

  it('includes url and image once both are resolved', () => {
    const jsonLd = buildJsonLd({
      ...baseInput,
      siteUrl: 'https://www.lauryherrera.example/',
      image: 'https://cdn.sanity.io/images/testproject/testdataset/abc-1200x630.jpg',
    });

    expect(jsonLd.url).toBe('https://www.lauryherrera.example/');
    expect(jsonLd.image).toBe(
      'https://cdn.sanity.io/images/testproject/testdataset/abc-1200x630.jpg',
    );
  });
});

describe('serializeJsonLd', () => {
  it('escapes every "<" so a value can never close the surrounding <script> element', () => {
    const evil = { name: 'Hola </script><script>alert(1)</script>' };
    const serialized = serializeJsonLd(evil);

    expect(serialized).not.toContain('<');
    expect(serialized).toContain('\\u003c/script>');
    expect(serialized).toContain('\\u003cscript>');
  });

  it('round-trips back to the original value through JSON.parse', () => {
    const evil = { name: 'Hola </script>', safe: 'sin nada raro' };
    const serialized = serializeJsonLd(evil);

    expect(JSON.parse(serialized)).toEqual(evil);
  });

  it('produces plain JSON.stringify output when there is nothing to escape', () => {
    const value = { a: 1, b: 'sin angulares' };
    expect(serializeJsonLd(value)).toBe(JSON.stringify(value));
  });
});

describe('buildRobotsTxt', () => {
  it('allows crawling and has no Sitemap line without a canonical URL', () => {
    const robots = buildRobotsTxt({ indexable: false });
    expect(robots).toBe('User-agent: *\nAllow: /\nDisallow: /api/\n');
    expect(robots).not.toContain('Sitemap:');
  });

  it('allows crawling, disallows /api/, and links the sitemap once a canonical URL is known', () => {
    const robots = buildRobotsTxt({
      indexable: true,
      canonical: 'https://www.lauryherrera.example/',
    });

    expect(robots).toBe(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Sitemap: https://www.lauryherrera.example/sitemap.xml',
        '',
      ].join('\n'),
    );
  });

  it('never lists /api/contact as allowed', () => {
    const robots = buildRobotsTxt({
      indexable: true,
      canonical: 'https://www.lauryherrera.example/',
    });
    expect(robots).not.toContain('/api/contact');
    expect(robots).toContain('Disallow: /api/');
  });
});

describe('robotsTxtForSiteUrl', () => {
  it('produces the non-indexable body from an unset/invalid raw value', () => {
    expect(robotsTxtForSiteUrl(undefined)).toBe('User-agent: *\nAllow: /\nDisallow: /api/\n');
    expect(robotsTxtForSiteUrl('not a url')).toBe('User-agent: *\nAllow: /\nDisallow: /api/\n');
  });

  it('produces the indexable body with a Sitemap line from a valid raw URL', () => {
    const robots = robotsTxtForSiteUrl('https://www.lauryherrera.example');
    expect(robots).toContain('Sitemap: https://www.lauryherrera.example/sitemap.xml');
  });
});

describe('buildSitemapXml', () => {
  it('is undefined without a canonical URL (an empty urlset is not a valid sitemap)', () => {
    expect(buildSitemapXml({ indexable: false })).toBeUndefined();
  });

  it('lists exactly the homepage once a canonical URL is known', () => {
    const sitemap = buildSitemapXml({
      indexable: true,
      canonical: 'https://www.lauryherrera.example/',
    });

    expect(sitemap).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url>\n    <loc>https://www.lauryherrera.example/</loc>\n  </url>\n' +
        '</urlset>\n',
    );
  });
});

describe('sitemapXmlForSiteUrl', () => {
  it('is undefined from an unset/invalid raw value', () => {
    expect(sitemapXmlForSiteUrl(undefined)).toBeUndefined();
    expect(sitemapXmlForSiteUrl('not a url')).toBeUndefined();
  });

  it('lists the homepage from a valid raw URL', () => {
    const sitemap = sitemapXmlForSiteUrl('https://www.lauryherrera.example');
    expect(sitemap).toContain('<loc>https://www.lauryherrera.example/</loc>');
  });
});

// `resolveShareImage` is tested in `seo-image.test.ts`, next to the module
// that owns it (see `src/lib/seo-image.ts` for why it is a separate file).
