import { describe, expect, it } from 'vitest';
import { getHeader, parseHeadersFile } from './headers-file';

const HEADERS_TEXT = [
  '/_astro/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/*',
  '  X-Content-Type-Options: nosniff',
  "  Content-Security-Policy: default-src 'none'; img-src 'self' https://cdn.sanity.io",
  '  X-Robots-Tag: noindex, nofollow',
  '',
].join('\n');

describe('parseHeadersFile', () => {
  it('groups headers under their path pattern', () => {
    const rules = parseHeadersFile(HEADERS_TEXT);
    expect(rules).toEqual([
      { path: '/_astro/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
      {
        path: '/*',
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; img-src 'self' https://cdn.sanity.io",
          'X-Robots-Tag': 'noindex, nofollow',
        },
      },
    ]);
  });

  it('keeps embedded colons in a header value intact', () => {
    const rules = parseHeadersFile(
      '/*\n  Content-Security-Policy: frame-src https://x.test:8443\n',
    );
    expect(rules[0].headers['Content-Security-Policy']).toBe('frame-src https://x.test:8443');
  });
});

describe('getHeader', () => {
  it('looks up a header name case-insensitively', () => {
    const [, staticRule] = parseHeadersFile(HEADERS_TEXT);
    expect(getHeader(staticRule, 'x-robots-tag')).toBe('noindex, nofollow');
  });

  it('is undefined when the header is not on that rule', () => {
    const [astroRule] = parseHeadersFile(HEADERS_TEXT);
    expect(getHeader(astroRule, 'X-Robots-Tag')).toBeUndefined();
  });
});
