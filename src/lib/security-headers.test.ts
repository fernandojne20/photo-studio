import { describe, expect, it } from 'vitest';
import {
  ADAPTER_GENERATED_HEADERS,
  CSP_DIRECTIVES,
  CSP_HEADER_MAX_LENGTH,
  SCRIPT_RESOURCES,
  STYLE_RESOURCES,
  assertHomepageIndexingConsistent,
  assertNotFoundPageNonIndexable,
  assertNoForeignHeadersContent,
  buildContentSecurityPolicyHeader,
  buildHeadersFile,
  extractCspMetaContent,
  extractRobotsMetaContent,
  mergeContentSecurityPolicies,
  parseCspDirectives,
  PERMISSIONS_POLICY,
} from './security-headers.mjs';

const CSP_LINE = "default-src 'none'; frame-ancestors 'none'";

const CACHE_BLOCK = ['/_astro/*', '  Cache-Control: public, max-age=31536000, immutable', ''].join(
  '\n',
);

function staticBlock(extraLines: string[] = []): string {
  return [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), screen-wake-lock=(), usb=(), web-share=(), xr-spatial-tracking=()',
    '  X-Frame-Options: DENY',
    `  Content-Security-Policy: ${CSP_LINE}`,
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Strict-Transport-Security: max-age=15552000',
    ...extraLines,
    '',
  ].join('\n');
}

describe('PERMISSIONS_POLICY', () => {
  it('is the exact hardcoded policy (not derived from the same list a mutation could quietly shrink)', () => {
    expect(PERMISSIONS_POLICY).toBe(
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), ' +
        'fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), ' +
        'midi=(), payment=(), picture-in-picture=(), screen-wake-lock=(), usb=(), web-share=(), ' +
        'xr-spatial-tracking=()',
    );
  });
});

describe('CSP policy constants', () => {
  it('pins the exact directive list', () => {
    expect(CSP_DIRECTIVES).toEqual([
      "default-src 'none'",
      "img-src 'self' https://cdn.sanity.io data:",
      "font-src 'self'",
      "connect-src 'self'",
      'frame-src https://challenges.cloudflare.com',
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ]);
  });

  it('requires default-src, object-src and base-uri to be none', () => {
    expect(CSP_DIRECTIVES).toContain("default-src 'none'");
    expect(CSP_DIRECTIVES).toContain("object-src 'none'");
    expect(CSP_DIRECTIVES).toContain("base-uri 'none'");
  });

  it('pins the exact script resources: self and only the Turnstile origin', () => {
    expect(SCRIPT_RESOURCES).toEqual(["'self'", 'https://challenges.cloudflare.com']);
  });

  it('never allows unsafe-inline, unsafe-eval, data:, blob: or a wildcard in script resources', () => {
    for (const resource of SCRIPT_RESOURCES) {
      expect(resource).not.toBe("'unsafe-inline'");
      expect(resource).not.toBe("'unsafe-eval'");
      expect(resource).not.toMatch(/^data:/);
      expect(resource).not.toMatch(/^blob:/);
      expect(resource).not.toContain('*');
    }
  });

  it('has exactly one non-self script origin: the Turnstile domain', () => {
    const nonSelf = SCRIPT_RESOURCES.filter((resource) => resource !== "'self'");
    expect(nonSelf).toEqual(['https://challenges.cloudflare.com']);
  });

  it('pins the exact style resources', () => {
    expect(STYLE_RESOURCES).toEqual(["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }]);
  });

  it('only allows unsafe-inline in style resources scoped to the style attribute', () => {
    const bareUnsafeInline = STYLE_RESOURCES.some((resource) => resource === "'unsafe-inline'");
    expect(bareUnsafeInline).toBe(false);

    const scoped = STYLE_RESOURCES.filter(
      (resource) => typeof resource === 'object' && resource.resource === "'unsafe-inline'",
    );
    expect(scoped).toEqual([{ resource: "'unsafe-inline'", kind: 'attribute' }]);
  });
});

describe('extractCspMetaContent', () => {
  it('extracts the content attribute of the CSP meta tag', () => {
    const html =
      '<head><meta http-equiv="content-security-policy" content="default-src \'none\'"></head>';
    expect(extractCspMetaContent(html)).toBe("default-src 'none'");
  });

  it('throws when no CSP meta tag exists', () => {
    expect(() => extractCspMetaContent('<head></head>')).toThrow(/No Content-Security-Policy/);
  });
});

describe('parseCspDirectives', () => {
  it('splits a policy string into ordered {name, tokens} entries', () => {
    expect(parseCspDirectives("default-src 'none';img-src 'self' data:")).toEqual([
      { name: 'default-src', tokens: ["'none'"] },
      { name: 'img-src', tokens: ["'self'", 'data:'] },
    ]);
  });
});

describe('mergeContentSecurityPolicies', () => {
  it('unions script-src hashes across pages', () => {
    const a = "script-src 'self' 'sha256-AAA='";
    const b = "script-src 'self' 'sha256-BBB='";
    expect(mergeContentSecurityPolicies([a, b])).toBe(
      "script-src 'self' 'sha256-AAA=' 'sha256-BBB='",
    );
  });

  it('throws when pages disagree on a non-hash token', () => {
    const a = "img-src 'self'";
    const b = "img-src 'self' https://evil.example";
    expect(() => mergeContentSecurityPolicies([a, b])).toThrow(/disagree on the "img-src"/);
  });

  it('throws when pages declare different directive sets', () => {
    const a = "default-src 'none'";
    const b = "default-src 'none'; frame-src https://challenges.cloudflare.com";
    expect(() => mergeContentSecurityPolicies([a, b])).toThrow(/different CSP directive sets/);
  });
});

describe('extractRobotsMetaContent', () => {
  it('extracts the robots meta content', () => {
    const html = '<meta name="robots" content="index, follow">';
    expect(extractRobotsMetaContent(html)).toBe('index, follow');
  });

  it('throws when no robots meta tag exists', () => {
    expect(() => extractRobotsMetaContent('<head></head>')).toThrow(/No <meta name="robots">/);
  });
});

describe('assertNotFoundPageNonIndexable', () => {
  it('passes for a noindex 404 page', () => {
    expect(() => assertNotFoundPageNonIndexable('noindex, nofollow')).not.toThrow();
  });

  it('throws for an indexable 404 page', () => {
    expect(() => assertNotFoundPageNonIndexable('index, follow')).toThrow(
      'The 404 page must be noindex, but its robots meta is "index, follow".',
    );
  });
});

describe('assertHomepageIndexingConsistent', () => {
  it('passes when an indexable page has a sitemap', () => {
    expect(() =>
      assertHomepageIndexingConsistent({ robotsContent: 'index, follow', sitemapExists: true }),
    ).not.toThrow();
  });

  it('passes when a non-indexable page has no sitemap', () => {
    expect(() =>
      assertHomepageIndexingConsistent({
        robotsContent: 'noindex, nofollow',
        sitemapExists: false,
      }),
    ).not.toThrow();
  });

  it('throws when an indexable page has no sitemap', () => {
    expect(() =>
      assertHomepageIndexingConsistent({ robotsContent: 'index, follow', sitemapExists: false }),
    ).toThrow(/disagree/);
  });

  it('throws when a noindex homepage has a sitemap', () => {
    expect(() =>
      assertHomepageIndexingConsistent({ robotsContent: 'noindex, nofollow', sitemapExists: true }),
    ).toThrow(/disagree/);
  });
});

describe('assertNoForeignHeadersContent', () => {
  it('passes for the exact adapter-generated content', () => {
    expect(() => assertNoForeignHeadersContent(ADAPTER_GENERATED_HEADERS)).not.toThrow();
  });

  it('throws for anything else (e.g. a committed public/_headers)', () => {
    expect(() => assertNoForeignHeadersContent('/*\n  X-Custom: 1\n')).toThrow(/public\/_headers/);
  });
});

function pageWithCsp(content: string): string {
  return `<html><head><meta http-equiv="content-security-policy" content="${content}"></head></html>`;
}

describe('buildContentSecurityPolicyHeader', () => {
  it('extracts each page meta, merges them and appends frame-ancestors', () => {
    expect(buildContentSecurityPolicyHeader([pageWithCsp("default-src 'none'")])).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it('unions hashes across two full HTML pages', () => {
    const a = pageWithCsp("script-src 'self' 'sha256-AAA='");
    const b = pageWithCsp("script-src 'self' 'sha256-BBB='");
    expect(buildContentSecurityPolicyHeader([a, b])).toBe(
      "script-src 'self' 'sha256-AAA=' 'sha256-BBB='; frame-ancestors 'none'",
    );
  });

  it('throws once the header line would exceed the length limit', () => {
    expect(() =>
      buildContentSecurityPolicyHeader([pageWithCsp("default-src 'none'")], { maxLength: 10 }),
    ).toThrow(/over the 10-character/);
  });

  it('never overrides the default limit outside tests', () => {
    expect(CSP_HEADER_MAX_LENGTH).toBe(2000);
  });
});

describe('buildHeadersFile', () => {
  it('omits X-Robots-Tag for an indexable build', () => {
    const content = buildHeadersFile({ indexable: true, contentSecurityPolicy: CSP_LINE });
    expect(content).toBe(`${CACHE_BLOCK}\n${staticBlock()}`);
    expect(content).not.toContain('X-Robots-Tag');
  });

  it('adds X-Robots-Tag: noindex, nofollow for a non-indexable build', () => {
    const content = buildHeadersFile({ indexable: false, contentSecurityPolicy: CSP_LINE });
    expect(content).toBe(`${CACHE_BLOCK}\n${staticBlock(['  X-Robots-Tag: noindex, nofollow'])}`);
  });

  it('keeps the /_astro/* immutable cache rule in both modes', () => {
    for (const indexable of [true, false]) {
      expect(buildHeadersFile({ indexable, contentSecurityPolicy: CSP_LINE })).toContain(
        '/_astro/*\n  Cache-Control: public, max-age=31536000, immutable',
      );
    }
  });

  it('emits exactly one Content-Security-Policy header line', () => {
    const content = buildHeadersFile({ indexable: true, contentSecurityPolicy: CSP_LINE });
    expect(content.match(/Content-Security-Policy:/g)).toHaveLength(1);
  });

  it('always sets frame-ancestors and X-Frame-Options', () => {
    for (const indexable of [true, false]) {
      const content = buildHeadersFile({ indexable, contentSecurityPolicy: CSP_LINE });
      expect(content).toContain("frame-ancestors 'none'");
      expect(content).toContain('X-Frame-Options: DENY');
    }
  });

  it('never sets includeSubDomains or preload on HSTS', () => {
    const content = buildHeadersFile({ indexable: true, contentSecurityPolicy: CSP_LINE });
    expect(content).toContain('Strict-Transport-Security: max-age=15552000\n');
    expect(content).not.toContain('includeSubDomains');
    expect(content).not.toContain('preload');
  });
});
