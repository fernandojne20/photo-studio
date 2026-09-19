import { describe, expect, it } from 'vitest';
import {
  checkEnvironmentConsistency,
  checkIndexingPolicy,
  effectivePublicSiteUrl,
} from './build-verification-indexing';

const JSON_LD_NO_INSTAGRAM =
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"x","telephone":"+1","email":"a@b.co"}</script>';

function homepage({
  robots = '<meta name="robots" content="noindex, nofollow">',
  canonical = '',
  ogUrl = '',
  jsonLd = JSON_LD_NO_INSTAGRAM,
}: { robots?: string; canonical?: string; ogUrl?: string; jsonLd?: string } = {}): string {
  return `<!doctype html><html><head>${robots}${canonical}${ogUrl}${jsonLd}</head><body></body></html>`;
}

const NOT_FOUND_OK =
  '<!doctype html><html><head><meta name="robots" content="noindex, nofollow"></head></html>';
const ROBOTS_TXT = 'User-agent: *\nAllow: /\nDisallow: /api/\n';

const HEADERS_NON_INDEXABLE = [
  '/_astro/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/*',
  '  X-Content-Type-Options: nosniff',
  "  Content-Security-Policy: default-src 'none'; frame-ancestors 'none'",
  '  X-Robots-Tag: noindex, nofollow',
  '',
].join('\n');

const HEADERS_INDEXABLE = HEADERS_NON_INDEXABLE.split('\n')
  .filter((line) => !line.includes('X-Robots-Tag'))
  .join('\n');

describe('checkIndexingPolicy — non-indexable', () => {
  it('passes a correctly non-indexable build', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result).toEqual({ problems: [], indexable: false });
  });

  it('ignores a robots meta commented out before the real one', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage({
        robots:
          '<!-- <meta name="robots" content="index, follow"> --><meta name="robots" content="noindex, nofollow">',
      }),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result).toEqual({ problems: [], indexable: false });
  });

  it('fails when the only robots meta is trapped inside <noscript>', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage({
        robots: '<noscript><meta name="robots" content="noindex, nofollow"></noscript>',
      }),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain('Homepage has no live <meta name="robots"> tag.');
  });

  it('fails on two robots meta tags', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage({
        robots:
          '<meta name="robots" content="noindex, nofollow"><meta name="robots" content="index, follow">',
      }),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain(
      'Homepage has 2 robots meta tags; there must be at most one.',
    );
  });

  it('flags a canonical link that should not be there', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage({ canonical: '<link rel="canonical" href="https://x.test/">' }),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain(
      'Homepage must have no canonical link, found "https://x.test/".',
    );
  });

  it('flags a sitemap.xml that should not exist', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: '<urlset></urlset>',
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain('sitemap.xml must not exist.');
  });

  it('flags a missing X-Robots-Tag under the /* rule', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE.replace('  X-Robots-Tag: noindex, nofollow\n', ''),
    });
    expect(result.problems.some((p) => p.includes('/* rule must set X-Robots-Tag'))).toBe(true);
  });

  it('ignores an X-Robots-Tag placed only under /_astro/*, not /*', () => {
    const headers = [
      '/_astro/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '  X-Robots-Tag: noindex, nofollow',
      '',
      '/*',
      "  Content-Security-Policy: default-src 'none'",
      '',
    ].join('\n');
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: headers,
    });
    expect(result.problems.some((p) => p.includes('/* rule must set X-Robots-Tag'))).toBe(true);
  });
});

describe('checkIndexingPolicy — indexable', () => {
  const ORIGIN = 'https://www.example.com';

  function indexableHomepage(extra: { jsonLd?: string } = {}) {
    return homepage({
      robots: '<meta name="robots" content="index, follow">',
      canonical: `<link rel="canonical" href="${ORIGIN}/">`,
      ogUrl: `<meta property="og:url" content="${ORIGIN}/">`,
      ...extra,
    });
  }

  it('passes a correctly indexable build', () => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}Sitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_INDEXABLE,
    });
    expect(result).toEqual({ problems: [], indexable: true });
  });

  it('flags a missing sitemap.xml (the sitemap.xml.ts ignoring the URL mutation)', () => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}Sitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: undefined,
      headersText: HEADERS_INDEXABLE,
    });
    expect(result.problems).toContain('sitemap.xml must exist.');
  });

  it('fails on Disallow: / even when indexable', () => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `User-agent: *\nDisallow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_INDEXABLE,
    });
    expect(result.problems).toContain(
      'robots.txt must not disallow "/" in either mode, found it for *.',
    );
  });

  it('requires Allow: / and Disallow: /api/ in indexable mode too', () => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `User-agent: *\nSitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_INDEXABLE,
    });
    expect(result.problems).toContain('robots.txt must allow "/" for every crawler.');
    expect(result.problems).toContain('robots.txt must disallow "/api/" for every crawler.');
  });

  it.each([
    ['/', 'a rule for the homepage alone'],
    ['/*', 'a second /* rule'],
  ])('flags an X-Robots-Tag set under %s (%s)', (path) => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}Sitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: `${HEADERS_INDEXABLE}\n${path}\n  x-robots-tag: noindex\n`,
    });
    expect(result.problems).toEqual([
      `_headers' ${path} rule must not set X-Robots-Tag, found "noindex".`,
    ]);
  });

  it.each(['googlebot', 'Googlebot-News', 'bingbot'])(
    'flags a <meta name="%s"> that blocks indexing beside an indexable robots meta',
    (name) => {
      const result = checkIndexingPolicy({
        mode: 'indexable',
        origin: ORIGIN,
        homepageHtml: homepage({
          robots: `<meta name="robots" content="index, follow"><meta name="${name}" content="NOINDEX">`,
          canonical: `<link rel="canonical" href="${ORIGIN}/">`,
          ogUrl: `<meta property="og:url" content="${ORIGIN}/">`,
        }),
        notFoundHtml: NOT_FOUND_OK,
        robotsTxt: `${ROBOTS_TXT}Sitemap: ${ORIGIN}/sitemap.xml\n`,
        sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
        headersText: HEADERS_INDEXABLE,
      });
      expect(result.problems).toEqual([
        `Homepage must not carry a <meta name="${name}"> that blocks indexing.`,
      ]);
    },
  );

  it('accepts a crawler meta that does not block, and editor text that merely says noindex', () => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: homepage({
        robots:
          '<meta name="robots" content="index, follow"><meta name="googlebot" content="notranslate">' +
          '<meta name="description" content="noindex">',
        canonical: `<link rel="canonical" href="${ORIGIN}/">`,
        ogUrl: `<meta property="og:url" content="${ORIGIN}/">`,
      }),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}Sitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_INDEXABLE,
    });
    expect(result.problems).toEqual([]);
  });

  it('flags a lingering X-Robots-Tag header', () => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}Sitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems.some((p) => p.includes('/* rule must not set X-Robots-Tag'))).toBe(true);
  });
});

describe('checkIndexingPolicy — both modes', () => {
  it('flags an indexable 404 page', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      notFoundHtml:
        '<!doctype html><html><head><meta name="robots" content="index, follow"></head></html>',
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems.some((p) => p.startsWith('404 page robots meta'))).toBe(true);
  });

  it('flags a JSON-LD block that is not Organization', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage({
        jsonLd: '<script type="application/ld+json">{"@type":"LocalBusiness"}</script>',
      }),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems.some((p) => p.startsWith('JSON-LD @type must be "Organization"'))).toBe(
      true,
    );
  });

  it('flags a sameAs entry while the Instagram URL is still the bare placeholder', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage({
        jsonLd:
          '<script type="application/ld+json">{"@type":"Organization","sameAs":["https://www.instagram.com/"]}</script>',
      }),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain(
      'JSON-LD must have no sameAs while the Instagram URL is the bare placeholder.',
    );
  });

  it('never throws on a homepage with no robots meta at all', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: '<!doctype html><html><head></head></html>',
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: '',
      sitemapXml: undefined,
      headersText: '',
    });
    expect(result.indexable).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
  });
});

describe('checkEnvironmentConsistency', () => {
  it('is silent when PUBLIC_SITE_URL is unset', () => {
    expect(
      checkEnvironmentConsistency({
        mode: 'non-indexable',
        publicSiteUrlRaw: undefined,
        indexable: false,
      }),
    ).toEqual([]);
  });

  it('names the variable when it is set while verifying non-indexable', () => {
    const problems = checkEnvironmentConsistency({
      mode: 'non-indexable',
      publicSiteUrlRaw: 'https://example.com/blog',
      indexable: false,
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('PUBLIC_SITE_URL');
  });

  it('names the variable when it is set but the output is not indexable', () => {
    const problems = checkEnvironmentConsistency({
      mode: 'indexable',
      publicSiteUrlRaw: 'https://example.com/blog',
      indexable: false,
    });
    expect(problems[0]).toContain('PUBLIC_SITE_URL');
  });

  it('is silent when the variable is set and the output really is indexable', () => {
    expect(
      checkEnvironmentConsistency({
        mode: 'indexable',
        publicSiteUrlRaw: 'https://x.test',
        indexable: true,
      }),
    ).toEqual([]);
  });
});

describe('effectivePublicSiteUrl', () => {
  const dotenv = '# site\nPUBLIC_SITE_URL="https://from-env.test/blog"\nOTHER=1\n';

  it('reads the value from a dotenv file when the shell has none', () => {
    expect(effectivePublicSiteUrl(undefined, [dotenv])).toBe('https://from-env.test/blog');
  });

  it('lets the last dotenv file that sets it win, skipping files that do not', () => {
    const local = 'PUBLIC_SITE_URL=https://local.test\n';
    expect(effectivePublicSiteUrl(undefined, [dotenv, local, 'OTHER=2\n'])).toBe(
      'https://local.test',
    );
  });

  it('lets the shell win, even with an empty value', () => {
    expect(effectivePublicSiteUrl('https://shell.test', [dotenv])).toBe('https://shell.test');
    expect(effectivePublicSiteUrl('', [dotenv])).toBe('');
  });

  it('is undefined when nothing sets it', () => {
    expect(effectivePublicSiteUrl(undefined, ['OTHER=1\n', ''])).toBeUndefined();
  });
});

describe('robots.txt rules belong to the group every crawler reads', () => {
  const robotsProblems = (robotsTxt: string) =>
    checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    }).problems;

  it('accepts the rules under User-agent: *, whatever the case, comments or line endings', () => {
    expect(
      robotsProblems('# crawlers\r\nuser-agent: *\r\nALLOW: /\r\nDisallow: /api/ # endpoint\r\n'),
    ).toEqual([]);
  });

  it('rejects the rules when they only apply to one crawler', () => {
    expect(robotsProblems('User-agent: Googlebot\nAllow: /\nDisallow: /api/\n')).toEqual([
      'robots.txt must have a "User-agent: *" group.',
    ]);
  });

  it('rejects rules that precede any User-agent line, which apply to nobody', () => {
    expect(robotsProblems('Allow: /\nDisallow: /api/\nUser-agent: *\n')).toEqual([
      'robots.txt must allow "/" for every crawler.',
      'robots.txt must disallow "/api/" for every crawler.',
    ]);
  });

  it('rejects a crawler that is shut out in its own group', () => {
    expect(
      robotsProblems(
        'User-agent: *\nAllow: /\nDisallow: /api/\n\nUser-agent: Bingbot\nDisallow: /\n',
      ),
    ).toEqual(['robots.txt must not disallow "/" in either mode, found it for bingbot.']);
  });

  it('rejects a crawler group that does not repeat Disallow: /api/', () => {
    const own = 'User-agent: Googlebot\nAllow: /\n';
    expect(robotsProblems(`${ROBOTS_TXT}\n${own}`)).toEqual([
      'robots.txt must disallow "/api/" for googlebot too.',
    ]);
    expect(robotsProblems(`${ROBOTS_TXT}\n${own}Disallow: /api/\n`)).toEqual([]);
  });

  it('reads several User-agent lines as one group', () => {
    expect(
      robotsProblems('User-agent: Googlebot\nUser-agent: *\nAllow: /\nDisallow: /api/\n'),
    ).toEqual([]);
  });
});

describe('a forbidden tag is forbidden even when it is empty', () => {
  const problemsFor = (
    extra: { canonical?: string; ogUrl?: string },
    notFoundHtml = NOT_FOUND_OK,
  ) =>
    checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(extra),
      notFoundHtml,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    }).problems;

  it.each([
    ['an empty href', '<link rel="canonical" href="">'],
    ['no href at all', '<link rel="canonical">'],
  ])('rejects a canonical link with %s on a non-indexable homepage', (_label, canonical) => {
    expect(problemsFor({ canonical })).toEqual(['Homepage must have no canonical link, found "".']);
  });

  it('rejects an empty og:url on a non-indexable homepage', () => {
    expect(problemsFor({ ogUrl: '<meta property="og:url" content="">' })).toEqual([
      'Homepage must have no og:url, found "".',
    ]);
  });

  it('rejects an empty canonical on the 404 page', () => {
    const notFound = NOT_FOUND_OK.replace('</head>', '<link rel="canonical" href=""></head>');
    expect(notFound).not.toBe(NOT_FOUND_OK);
    expect(problemsFor({}, notFound)).toEqual(['404 page must have no canonical link.']);
  });
});

describe("a tag written outside <head> does not count as the page's own", () => {
  const ORIGIN = 'https://www.example.com';

  it('reports a robots meta written in the body, for the homepage', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml:
        '<!doctype html><html><head></head><body>' +
        '<meta name="robots" content="noindex, nofollow"></body></html>',
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain(
      'Homepage has a <meta name="robots"> outside <head>, which must not be there.',
    );
    expect(result.problems).toContain('Homepage has no live <meta name="robots"> tag.');
    expect(result.indexable).toBe(false);
  });

  it('reports a robots meta written in the body, for the 404 page', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      notFoundHtml:
        '<!doctype html><html><head></head><body>' +
        '<meta name="robots" content="noindex, nofollow"></body></html>',
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain(
      '404 page has a <meta name="robots"> outside <head>, which must not be there.',
    );
    expect(result.problems).toContain('404 page robots meta must be noindex, found "none".');
  });

  it('does not count a required canonical that only appears in the body, in indexable mode', () => {
    const result = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml:
        `<!doctype html><html><head>` +
        `<meta name="robots" content="index, follow">` +
        `<meta property="og:url" content="${ORIGIN}/">${JSON_LD_NO_INSTAGRAM}</head>` +
        `<body><link rel="canonical" href="${ORIGIN}/"></body></html>`,
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}Sitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_INDEXABLE,
    });
    expect(result.problems).toContain(`Homepage canonical must be "${ORIGIN}/", found "none".`);
  });

  it('still fails a forbidden canonical that only appears in the body, in non-indexable mode', () => {
    const result = checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml:
        '<!doctype html><html><head><meta name="robots" content="noindex, nofollow"></head>' +
        '<body><link rel="canonical" href="https://x.test/"></body></html>',
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: ROBOTS_TXT,
      sitemapXml: undefined,
      headersText: HEADERS_NON_INDEXABLE,
    });
    expect(result.problems).toContain(
      'Homepage must have no canonical link, found "https://x.test/".',
    );
  });
});

describe('directives are read as crawlers read them', () => {
  const ORIGIN = 'https://www.example.com';
  const indexableHomepage = () =>
    homepage({
      robots: '<meta name="robots" content="index, follow">',
      canonical: `<link rel="canonical" href="${ORIGIN}/">`,
      ogUrl: `<meta property="og:url" content="${ORIGIN}/">`,
    });
  const base = {
    notFoundHtml: NOT_FOUND_OK,
    sitemapXml: undefined,
    headersText: HEADERS_NON_INDEXABLE,
  } as const;
  const nonIndexable = (overrides: {
    homepageHtml?: string;
    robotsTxt?: string;
    notFoundHtml?: string;
  }) =>
    checkIndexingPolicy({
      mode: 'non-indexable',
      homepageHtml: homepage(),
      robotsTxt: ROBOTS_TXT,
      ...base,
      ...overrides,
    }).problems;

  it('sees a canonical declared with two rel tokens', () => {
    expect(
      nonIndexable({
        homepageHtml: homepage({
          canonical: '<link rel="alternate canonical" href="https://x.test/">',
        }),
      }),
    ).toEqual(['Homepage must have no canonical link, found "https://x.test/".']);
  });

  it.each([['/*'], ['*'], ['/$'], ['/*$']])(
    'rejects a crawler group whose Disallow %s matches the homepage',
    (pattern) => {
      expect(
        nonIndexable({
          robotsTxt: `${ROBOTS_TXT}\nUser-agent: Bingbot\nDisallow: /api/\nDisallow: ${pattern}\n`,
        }),
      ).toEqual(['robots.txt must not disallow "/" in either mode, found it for bingbot.']);
    },
  );

  it('accepts a Disallow that an equally specific Allow overrides, and one that does not match the homepage', () => {
    expect(
      nonIndexable({
        robotsTxt: `${ROBOTS_TXT}\nUser-agent: Bingbot\nAllow: /\nDisallow: /\nDisallow: /privado/*.pdf$\n`,
      }),
    ).toEqual([]);
  });

  it('does not take noindexing or not-noindex for noindex on the 404 page', () => {
    const notFound = NOT_FOUND_OK.replace(/content="[^"]*"/, 'content="noindexing, not-noindex"');
    expect(notFound).not.toBe(NOT_FOUND_OK);
    expect(nonIndexable({ notFoundHtml: notFound })).toEqual([
      '404 page robots meta must be noindex, found "noindexing, not-noindex".',
    ]);
  });

  it('accepts NOINDEX in any case and the none directive', () => {
    expect(
      nonIndexable({
        notFoundHtml: NOT_FOUND_OK.replace(/content="[^"]*"/, 'content="NoIndex , follow"'),
      }),
    ).toEqual([]);
    expect(
      nonIndexable({ notFoundHtml: NOT_FOUND_OK.replace(/content="[^"]*"/, 'content="none"') }),
    ).toEqual([]);
  });

  it('does not count a commented Sitemap line, in either direction', () => {
    expect(
      nonIndexable({ robotsTxt: `${ROBOTS_TXT}# Sitemap: https://x.test/sitemap.xml\n` }),
    ).toEqual([]);
    const indexable = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}# Sitemap: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_INDEXABLE,
    });
    expect(indexable.problems).toEqual([`robots.txt must have "Sitemap: ${ORIGIN}/sitemap.xml".`]);
  });

  it('reads the Sitemap key in any case', () => {
    const indexable = checkIndexingPolicy({
      mode: 'indexable',
      origin: ORIGIN,
      homepageHtml: indexableHomepage(),
      notFoundHtml: NOT_FOUND_OK,
      robotsTxt: `${ROBOTS_TXT}SITEMAP: ${ORIGIN}/sitemap.xml\n`,
      sitemapXml: `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
      headersText: HEADERS_INDEXABLE,
    });
    expect(indexable.problems).toEqual([]);
  });
});
