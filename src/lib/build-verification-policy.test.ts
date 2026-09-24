import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkContentSecurityPolicy } from './build-verification-policy';

// Mirrors CSP_DIRECTIVES/SCRIPT_RESOURCES/STYLE_RESOURCES in security-headers.mjs exactly.
const COMPLIANT_POLICY =
  "default-src 'none'; img-src 'self' https://cdn.sanity.io data:; font-src 'self'; " +
  "connect-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; " +
  "base-uri 'none'; form-action 'self'; upgrade-insecure-requests; " +
  "script-src 'self' https://challenges.cloudflare.com 'sha256-aaa='; " +
  "style-src 'self' 'sha256-bbb='; style-src-attr 'unsafe-inline'";

function page(csp: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
}

function headersText({
  csp = `${COMPLIANT_POLICY}; frame-ancestors 'none'`,
  cspLineCount = 1,
  scope = '/*',
}: { csp?: string; cspLineCount?: number; scope?: string } = {}): string {
  const cspLines = Array.from(
    { length: cspLineCount },
    () => `  Content-Security-Policy: ${csp}`,
  ).join('\n');
  return [
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    scope,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=()',
    '  X-Frame-Options: DENY',
    cspLines,
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Strict-Transport-Security: max-age=15552000',
    '',
  ].join('\n');
}

describe('checkContentSecurityPolicy', () => {
  it('passes a compliant policy across pages and _headers', () => {
    expect(
      checkContentSecurityPolicy({
        pageHtmls: [page(COMPLIANT_POLICY), page(COMPLIANT_POLICY)],
        headersText: headersText(),
      }),
    ).toEqual([]);
  });

  it('fails when base-uri is missing from a page policy', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY.replace("base-uri 'none'; ", ''))],
      headersText: headersText({
        csp: `${COMPLIANT_POLICY.replace("base-uri 'none'; ", '')}; frame-ancestors 'none'`,
      }),
    });
    expect(problems.some((p) => p.includes('missing the "base-uri" directive'))).toBe(true);
  });

  it("fails when 'unsafe-inline' is allowed under style-src", () => {
    const withUnsafeInline = COMPLIANT_POLICY.replace(
      "style-src 'self' 'sha256-bbb='",
      "style-src 'self' 'unsafe-inline' 'sha256-bbb='",
    );
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(withUnsafeInline)],
      headersText: headersText({ csp: `${withUnsafeInline}; frame-ancestors 'none'` }),
    });
    expect(problems.some((p) => p.includes('"style-src" must be'))).toBe(true);
  });

  it('fails when connect-src gains an extra origin', () => {
    const widened = COMPLIANT_POLICY.replace(
      "connect-src 'self'",
      "connect-src 'self' https://evil.example",
    );
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(widened)],
      headersText: headersText({ csp: `${widened}; frame-ancestors 'none'` }),
    });
    expect(problems.some((p) => p.includes('"connect-src" must be'))).toBe(true);
  });

  it('fails when the header is missing a page hash', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY)],
      headersText: headersText({
        csp: `${COMPLIANT_POLICY.replace("'sha256-aaa='", '')}; frame-ancestors 'none'`,
      }),
    });
    expect(problems.some((p) => p.includes('hash') && p.includes('missing from the header'))).toBe(
      true,
    );
  });

  it('fails when the header carries a directive beyond the pages and frame-ancestors', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY)],
      headersText: headersText({
        csp: `${COMPLIANT_POLICY}; frame-ancestors 'none'; report-uri https://x.test`,
      }),
    });
    expect(problems.some((p) => p.includes('only directive beyond the pages'))).toBe(true);
  });

  it('fails when the security block sits only under /_astro/*, not /*', () => {
    const headers = [
      '/_astro/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      `  Content-Security-Policy: ${COMPLIANT_POLICY}; frame-ancestors 'none'`,
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '  Permissions-Policy: camera=()',
      '  X-Frame-Options: DENY',
      '  Cross-Origin-Opener-Policy: same-origin',
      '  Strict-Transport-Security: max-age=15552000',
      '',
    ].join('\n');
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY)],
      headersText: headers,
    });
    expect(problems.some((p) => p.includes('/* rule'))).toBe(true);
  });

  it('fails when a narrower rule detaches the policy from its paths', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY)],
      headersText: `${headersText()}\n/private/*\n  ! Content-Security-Policy\n`,
    });
    expect(problems).toEqual(['_headers must not detach a header (a line starting with "!").']);
  });

  it('fails with a second /* rule', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY)],
      headersText: `${headersText()}\n/*\n  X-Extra: 1\n`,
    });
    expect(problems).toEqual(['_headers must have exactly one /* rule, found 2.']);
  });

  it('fails with two Content-Security-Policy lines in _headers', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY)],
      headersText: headersText({ cspLineCount: 2 }),
    });
    expect(problems.some((p) => p.includes('exactly one Content-Security-Policy line'))).toBe(true);
  });

  it('ignores a policy meta trapped inside <noscript>', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [`<noscript>${page(COMPLIANT_POLICY)}</noscript>`],
      headersText: headersText(),
    });
    expect(problems.some((p) => p.includes('no live Content-Security-Policy'))).toBe(true);
  });
});

describe('what browsers actually enforce', () => {
  const run = (pagePolicy: string, headerPolicy = `${pagePolicy}; frame-ancestors 'none'`) =>
    checkContentSecurityPolicy({
      pageHtmls: [page(pagePolicy)],
      headersText: headersText({ csp: headerPolicy }),
    });

  it('accepts the same tokens in a different order, in the page and in the header', () => {
    const reordered = COMPLIANT_POLICY.replace(
      "script-src 'self' https://challenges.cloudflare.com 'sha256-aaa='",
      "script-src 'sha256-aaa=' https://challenges.cloudflare.com 'self'",
    ).replace(
      "img-src 'self' https://cdn.sanity.io data:",
      "img-src data: https://cdn.sanity.io 'self'",
    );
    expect(run(reordered, `${COMPLIANT_POLICY}; frame-ancestors 'none'`)).toEqual([]);
  });

  it('rejects a repeated directive whose FIRST copy is the weak one', () => {
    const header =
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com 'sha256-aaa='; " +
      `${COMPLIANT_POLICY}; frame-ancestors 'none'`;
    const problems = run(COMPLIANT_POLICY, header);
    expect(problems).toContain(
      '_headers policy: "script-src" appears more than once; browsers enforce only the first.',
    );
    expect(problems).toContain(
      "_headers policy: script-src includes the forbidden token 'unsafe-inline'.",
    );
  });

  it('rejects a header hash that no page declares', () => {
    const header = `${COMPLIANT_POLICY.replace("'sha256-aaa='", "'sha256-aaa=' 'sha256-orphan='")}; frame-ancestors 'none'`;
    expect(run(COMPLIANT_POLICY, header)).toEqual([
      `_headers policy: "script-src" carries the hash 'sha256-orphan=', which no page declares.`,
    ]);
  });

  it('accepts a header that unions the different hashes of two pages', () => {
    const second = COMPLIANT_POLICY.replace("'sha256-aaa='", "'sha256-ccc='");
    const header = `${COMPLIANT_POLICY.replace("'sha256-aaa='", "'sha256-aaa=' 'sha256-ccc='")}; frame-ancestors 'none'`;
    expect(
      checkContentSecurityPolicy({
        pageHtmls: [page(COMPLIANT_POLICY), page(second)],
        headersText: headersText({ csp: header }),
      }),
    ).toEqual([]);
  });
});

describe('the floor does not depend on the declared policy', () => {
  const floorProblems = (scriptSrc: string) =>
    checkContentSecurityPolicy({
      pageHtmls: [
        page(
          COMPLIANT_POLICY.replace(
            "script-src 'self' https://challenges.cloudflare.com 'sha256-aaa='",
            scriptSrc,
          ),
        ),
      ],
      headersText: headersText(),
    }).filter((problem) => problem.includes('forbidden token'));

  it.each([
    ["'unsafe-inline'"],
    ["'unsafe-eval'"],
    ["'unsafe-hashes'"],
    ["'strict-dynamic'"],
    ['data:'],
    ['blob:'],
    ['https:'],
    ['*'],
    ['https://evil.example'],
  ])('names %s as forbidden in script-src', (token) => {
    expect(floorProblems(`script-src 'self' ${token}`)).toEqual([
      `page 0 policy: script-src includes the forbidden token ${token}.`,
    ]);
  });

  it("requires default-src, object-src and base-uri to be exactly 'none'", () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [page(COMPLIANT_POLICY.replace("default-src 'none'", "default-src 'self'"))],
      headersText: headersText(),
    });
    expect(problems).toContain(`page 0 policy: "default-src" must be 'none'.`);
  });
});

describe('every delivered policy is enforced', () => {
  it('rejects a second live policy meta, however strict it is', () => {
    const html = `${page(COMPLIANT_POLICY)}${page("default-src 'none'")}`;
    expect(checkContentSecurityPolicy({ pageHtmls: [html], headersText: headersText() })).toEqual([
      'page 0: 2 live Content-Security-Policy <meta> tags; there must be exactly one.',
    ]);
  });

  it('rejects a policy meta that only appears outside <head>, where browsers ignore it', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [`<head></head><body>${page(COMPLIANT_POLICY)}</body>`],
      headersText: headersText(),
    });
    expect(problems).toContain(
      'page 0: 1 Content-Security-Policy <meta> outside <head>, which browsers ignore.',
    );
    expect(problems).toContain('page 0: no live Content-Security-Policy <meta> tag.');
  });

  it('rejects a policy meta that only appears after an implicitly opened body', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [`<head></head><p>x</p>${page(COMPLIANT_POLICY)}`],
      headersText: headersText(),
    });
    expect(problems).toContain(
      'page 0: 1 Content-Security-Policy <meta> outside <head>, which browsers ignore.',
    );
    expect(problems).toContain('page 0: no live Content-Security-Policy <meta> tag.');
  });

  it('accepts the policy meta in <head> of a page that has a body', () => {
    const problems = checkContentSecurityPolicy({
      pageHtmls: [`<head>${page(COMPLIANT_POLICY)}</head><body><p>x</p></body>`],
      headersText: headersText(),
    });
    expect(problems).toEqual([]);
  });

  it('does not count a policy meta inside a comment or noscript as a second one', () => {
    const html = `${page(COMPLIANT_POLICY)}<!-- ${page("default-src 'none'")} --><noscript>${page("default-src 'none'")}</noscript>`;
    expect(checkContentSecurityPolicy({ pageHtmls: [html], headersText: headersText() })).toEqual(
      [],
    );
  });
});

describe('inline content must be allowed by the page policy', () => {
  const sha = (content: string) =>
    `'sha256-${createHash('sha256').update(content).digest('base64')}'`;
  const SCRIPT = 'import("/_astro/x.js");';
  const STYLE = '@font-face{font-family:x}';
  const policyWith = (scriptHash: string, styleHash: string) =>
    COMPLIANT_POLICY.replace("'sha256-aaa='", scriptHash).replace("'sha256-bbb='", styleHash);
  const run = (policy: string, body: string) =>
    checkContentSecurityPolicy({
      pageHtmls: [`${page(policy)}${body}`],
      headersText: headersText({ csp: `${policy}; frame-ancestors 'none'` }),
    });
  const body = `<script type="module">${SCRIPT}</script><style>${STYLE}</style>`;

  it('passes when every inline script and style has its hash', () => {
    expect(run(policyWith(sha(SCRIPT), sha(STYLE)), body)).toEqual([]);
  });

  it('fails when the hash of an inline script is missing', () => {
    expect(run(policyWith("'sha256-other='", sha(STYLE)), body)).toEqual([
      'page 0 policy: inline script 0 has no matching hash in script-src.',
    ]);
  });

  it('fails when the hash of an inline style is missing', () => {
    expect(run(policyWith(sha(SCRIPT), "'sha256-other='"), body)).toEqual([
      'page 0 policy: inline style 0 has no matching hash in style-src.',
    ]);
  });

  it.each([
    'type="text/ecmascript"',
    'type="application/x-javascript"',
    'type="TEXT/JavaScript"',
    'type=" module "',
    'type="text/javascript; charset=utf-8"',
    'type="importmap"',
    'type=""',
    'language="JavaScript"',
  ])('asks for a hash for an inline <script %s>', (attribute) => {
    const unlisted = `<script ${attribute}>unlisted()</script>`;
    expect(run(policyWith(sha(SCRIPT), sha(STYLE)), body + unlisted)).toEqual([
      'page 0 policy: inline script 1 has no matching hash in script-src.',
    ]);
  });

  it.each(['type="text/plain"', 'type="application/json"', 'language="vbscript"'])(
    'asks for no hash for the data block <script %s>',
    (attribute) => {
      const dataBlock = `<script ${attribute}>{"a":1}</script>`;
      expect(run(policyWith(sha(SCRIPT), sha(STYLE)), body + dataBlock)).toEqual([]);
    },
  );

  it('does not ask for a hash for JSON-LD, an external script, or a script inside noscript', () => {
    const extra =
      '<script type="application/ld+json">{"a":1}</script><script type="module" src="/_astro/y.js"></script>' +
      '<noscript><script>blocked()</script></noscript>';
    expect(run(policyWith(sha(SCRIPT), sha(STYLE)), body + extra)).toEqual([]);
  });
});
