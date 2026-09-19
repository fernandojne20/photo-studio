import { describe, expect, it } from 'vitest';
import { checkAnalyticsMarkup, checkPageHygiene } from './build-verification-markup';

const WHATSAPP_LINK =
  '<a href="https://wa.me/1" data-analytics-event="whatsapp_click" data-analytics-placement="header">wa</a>';

describe('checkAnalyticsMarkup', () => {
  it('passes a correctly instrumented conversion link', () => {
    expect(checkAnalyticsMarkup(`<body>${WHATSAPP_LINK}</body>`)).toEqual([]);
  });

  it('flags a mailto link with no attributes at all', () => {
    const problems = checkAnalyticsMarkup('<body><a href="mailto:x@example.com">x</a></body>');
    expect(problems.some((p) => p.includes('data-analytics-event="email_click"'))).toBe(true);
  });

  it('flags a link carrying an event that does not match its href', () => {
    const problems = checkAnalyticsMarkup(
      '<body><a href="tel:+1" data-analytics-event="whatsapp_click" data-analytics-placement="header">t</a></body>',
    );
    expect(problems.some((p) => p.includes('data-analytics-event="phone_click"'))).toBe(true);
  });

  it('flags the attributes on a non-conversion element', () => {
    const problems = checkAnalyticsMarkup(
      '<body><a href="#inicio" data-analytics-event="whatsapp_click" data-analytics-placement="header">home</a></body>',
    );
    expect(problems.some((p) => p.includes('non-conversion element'))).toBe(true);
  });

  it('ignores links inside <noscript>', () => {
    expect(
      checkAnalyticsMarkup(
        '<body><noscript><a href="mailto:x@example.com">x</a></noscript></body>',
      ),
    ).toEqual([]);
  });

  it('classifies api.whatsapp.com and the whatsapp: scheme as WhatsApp', () => {
    const html =
      '<a href="https://api.whatsapp.com/send?phone=1" data-analytics-event="whatsapp_click" data-analytics-placement="hero">a</a>' +
      '<a href="whatsapp://send?phone=1" data-analytics-event="whatsapp_click" data-analytics-placement="hero">b</a>';
    expect(checkAnalyticsMarkup(html)).toEqual([]);
  });

  it('classifies a WhatsApp link case-insensitively', () => {
    const html =
      '<a HREF="HTTPS://WA.ME/1" data-analytics-event="whatsapp_click" data-analytics-placement="hero">a</a>';
    expect(checkAnalyticsMarkup(html)).toEqual([]);
  });

  it('requires the Instagram link to equal the configured URL, not merely start with it', () => {
    // site.instagram.url is the bare 'https://www.instagram.com/' placeholder.
    const problems = checkAnalyticsMarkup(
      '<a href="https://www.instagram.com/someone-else" data-analytics-event="instagram_click" data-analytics-placement="header">i</a>',
    );
    expect(problems.some((p) => p.includes('non-conversion element'))).toBe(true);
  });

  it('accepts the configured Instagram URL without its trailing slash', () => {
    const html =
      '<a href="https://www.instagram.com" data-analytics-event="instagram_click" data-analytics-placement="header">i</a>';
    expect(checkAnalyticsMarkup(html)).toEqual([]);
  });

  it('is unaffected by alt text containing > or markup-looking characters elsewhere on the page', () => {
    const html =
      '<img alt="antes &gt; despu&eacute;s" width="1" height="1" fetchpriority="high">' +
      `<img alt="Foto &lt;script&gt;&quot;&lt;/script&gt;" width="1" height="1" loading="lazy">${WHATSAPP_LINK}`;
    expect(checkAnalyticsMarkup(html)).toEqual([]);
  });
});

describe('checkPageHygiene', () => {
  it('passes a fully hygienic page', () => {
    const html =
      '<img src="/a.jpg" width="10" height="10" loading="lazy"><img src="/b.jpg" width="10" height="10" fetchpriority="high">';
    expect(checkPageHygiene(html)).toEqual([]);
  });

  it('has nothing to check on a page with no images', () => {
    expect(checkPageHygiene('<body><p>no images here</p></body>')).toEqual([]);
  });

  it('flags an <img> missing width', () => {
    const problems = checkPageHygiene('<img src="/a.jpg" height="10" loading="lazy">');
    expect(problems.some((p) => p.includes('without width'))).toBe(true);
  });

  it('flags a cross-origin script', () => {
    const problems = checkPageHygiene(
      '<script type="module" src="https://evil.test/x.js"></script>',
    );
    expect(problems.some((p) => p.includes('Script from another origin'))).toBe(true);
  });

  it('flags zero and more than one non-lazy image', () => {
    const none = checkPageHygiene('<img src="/a.jpg" width="1" height="1" loading="lazy">');
    expect(none.some((p) => p.includes('Expected exactly one non-lazy'))).toBe(true);

    const two = checkPageHygiene(
      '<img src="/a.jpg" width="1" height="1" fetchpriority="high"><img src="/b.jpg" width="1" height="1" fetchpriority="high">',
    );
    expect(two.some((p) => p.includes('Expected exactly one non-lazy'))).toBe(true);
  });

  it('does not truncate on an alt attribute containing > (the naive <img[^>]*> bug)', () => {
    const html =
      '<img alt="antes > despu&eacute;s" width="10" height="10" fetchpriority="high"><img alt="Foto <script>&quot;</script>" width="1" height="1" loading="lazy">';
    expect(checkPageHygiene(html)).toEqual([]);
  });

  it('ignores an <img> hidden inside <noscript>', () => {
    expect(
      checkPageHygiene('<noscript><img src="/a.jpg" width="1" height="1"></noscript>'),
    ).toEqual([]);
  });
});

describe('links and resources as the browser resolves them', () => {
  it.each([
    ['a numeric character reference in the scheme', '<a href="mail&#116;o:x@example.com">x</a>'],
    ['a tab inside the scheme', '<a href="mai\tlto:x@example.com">x</a>'],
    ['leading spaces', '<a href="   mailto:x@example.com">x</a>'],
    ['an uppercase scheme', '<a href="MAILTO:x@example.com">x</a>'],
  ])('still sees an e-mail link written with %s', (_label, html) => {
    expect(checkAnalyticsMarkup(html).some((problem) => problem.includes('email_click'))).toBe(
      true,
    );
  });

  it.each([
    ['a protocol-relative script', '<script type="module" src="//evil.test/x.js"></script>'],
    ['a backslash protocol-relative script', '<script src="\\\\evil.test/x.js"></script>'],
    ['a protocol-relative stylesheet', '<link rel="stylesheet" href="//evil.test/x.css">'],
    ['a data: script', '<script src="data:text/javascript,alert(1)"></script>'],
    [
      'a stylesheet declared with two rel tokens',
      '<link rel="alternate stylesheet" href="https://evil.test/x.css" title="x">',
    ],
    [
      'a script whose scheme hides behind a numeric reference',
      '<script src="&#104ttps://evil.test/x.js"></script>',
    ],
  ])('flags %s as cross-origin', (_label, html) => {
    expect(checkPageHygiene(html)).toHaveLength(1);
  });

  it('accepts same-origin resources, absolute and relative', () => {
    const html =
      '<script type="module" src="/_astro/a.js"></script><script src="./b.js"></script>' +
      '<link rel="stylesheet" href="/_astro/c.css"><link rel="stylesheet" href="d.css">';
    expect(checkPageHygiene(html)).toEqual([]);
  });
});
