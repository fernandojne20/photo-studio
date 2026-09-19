/**
 * Pure security-header and CSP-merging logic for the `_headers` file served
 * by Cloudflare Workers static assets (PD-04). Plain `.mjs`, not `.ts`:
 * `astro.config.mjs` loads this with plain Node, below this project's
 * `engines` floor for built-in TypeScript stripping. Vitest imports this
 * same file directly. The `astro:build:done` hook does file IO only; every
 * decision below is a pure function of its inputs.
 */

const DISABLED_PERMISSIONS = [
  'accelerometer',
  'autoplay',
  'camera',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'gamepad',
  'geolocation',
  'gyroscope',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'screen-wake-lock',
  'usb',
  'web-share',
  'xr-spatial-tracking',
];

// `ambient-light-sensor` dropped: not recognized by Chromium.
export const PERMISSIONS_POLICY = DISABLED_PERMISSIONS.map((feature) => `${feature}=()`).join(', ');

/**
 * Astro's `security.csp.directives` — every fetch/navigation directive
 * except `script-src`/`style-src` (Astro computes those from real content)
 * and `frame-ancestors` (a `<meta>` element cannot carry it; see
 * `mergeContentSecurityPolicies` below). Rationale per directive: README,
 * "Security headers".
 */
/** @type {import('astro/dist/core/csp/config.js').CspDirective[]} */
export const CSP_DIRECTIVES = [
  "default-src 'none'",
  "img-src 'self' https://cdn.sanity.io data:",
  "font-src 'self'",
  "connect-src 'self'",
  'frame-src https://challenges.cloudflare.com',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
];

/**
 * `security.csp.scriptDirective.resources`.
 * @type {import('astro/dist/core/csp/config.js').CspResourceEntry[]}
 */
export const SCRIPT_RESOURCES = ["'self'", 'https://challenges.cloudflare.com'];

/**
 * `security.csp.styleDirective.resources`.
 * @type {import('astro/dist/core/csp/config.js').CspResourceEntry[]}
 */
export const STYLE_RESOURCES = ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }];

/**
 * Exact `_headers` content written after a fresh build by
 * `@astrojs/cloudflare` when no `public/_headers` was committed
 * (`buildAssetsHeadersContent` in its `utils/headers.js`).
 */
export const ADAPTER_GENERATED_HEADERS =
  '/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n';

/**
 * Fails loudly instead of silently discarding a committed `public/_headers`
 * (or any other unexpected content) the next hook would otherwise overwrite.
 */
export function assertNoForeignHeadersContent(existingContent) {
  if (existingContent !== ADAPTER_GENERATED_HEADERS) {
    throw new Error(
      'Unexpected content in _headers before the security-headers hook ran ' +
        '(a committed public/_headers file?). Add rules to ' +
        'src/lib/security-headers.mjs instead of committing public/_headers.',
    );
  }
}

/** Extracts the `content` attribute of `<meta name="robots">` from built HTML. */
export function extractRobotsMetaContent(html) {
  const match = html.match(/<meta\s+name=["']robots["']\s+content="([^"]*)"/i);
  if (!match) throw new Error('No <meta name="robots"> found in a built page.');
  return match[1];
}

/**
 * Cross-check: the homepage's own `<meta name="robots">` and the presence
 * of `sitemap.xml` must always agree (both come from the same
 * `resolveIndexingPolicy`, but this catches the two ever drifting apart).
 */
export function assertHomepageIndexingConsistent({ robotsContent, sitemapExists }) {
  const indexable = !robotsContent.includes('noindex');
  if (indexable !== sitemapExists) {
    throw new Error(
      `Homepage robots meta ("${robotsContent}") and sitemap.xml presence ` +
        `(${sitemapExists}) disagree.`,
    );
  }
}

/**
 * The 404 page must never be indexable, whatever the site URL says: an
 * indexable error page would put a canonical URL on every mistyped path.
 */
export function assertNotFoundPageNonIndexable(robotsContent) {
  if (!robotsContent.includes('noindex')) {
    throw new Error(`The 404 page must be noindex, but its robots meta is "${robotsContent}".`);
  }
}

/** Extracts the `content` attribute of Astro's CSP `<meta>` from built HTML. */
export function extractCspMetaContent(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const cspTag = tags.find((tag) => /http-equiv=["']content-security-policy["']/i.test(tag));
  if (!cspTag) throw new Error('No Content-Security-Policy <meta> tag found in a built page.');
  const contentMatch = cspTag.match(/content="([^"]*)"/i);
  if (!contentMatch)
    throw new Error('Content-Security-Policy <meta> tag has no content attribute.');
  return contentMatch[1];
}

function isHashToken(token) {
  return /^'sha(256|384|512)-/.test(token);
}

/** `"name tok tok; name2 tok"` -> `[{ name, tokens }, ...]`, in order. */
export function parseCspDirectives(content) {
  return content
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...tokens] = part.split(/\s+/);
      return { name, tokens };
    });
}

/**
 * Origins of `<img>` and `<source>` URLs in built HTML that the policy's
 * `img-src` does not allow. Expected to be empty for a deployable build:
 * the repository fallback content uses remote placeholder photos, which a
 * strict production build never emits.
 */
export function findBlockedImageOrigins(html, policyContent) {
  const imgSrc = parseCspDirectives(policyContent).find((d) => d.name === 'img-src');
  const allowed = new Set(imgSrc ? imgSrc.tokens : []);
  const blocked = new Set();
  for (const tag of html.match(/<(?:img|source)\b[^>]*>/gi) ?? []) {
    for (const url of tag.match(/https?:\/\/[^\s"',]+/g) ?? []) {
      const origin = new URL(url).origin;
      if (!allowed.has(origin)) blocked.add(origin);
    }
  }
  return [...blocked].sort();
}

/**
 * Unions the hash sources of every directive across pages and requires
 * every other token, and the set of directive names itself, to match
 * exactly — so the one merged policy is valid for every page. Throws with
 * the offending directive/page on any disagreement.
 */
export function mergeContentSecurityPolicies(contents) {
  if (contents.length === 0) throw new Error('No pages to merge a Content-Security-Policy from.');

  const perPage = contents.map(parseCspDirectives);
  const nameSets = perPage.map((directives) =>
    directives
      .map((d) => d.name)
      .sort()
      .join(','),
  );
  const differingPage = nameSets.findIndex((set) => set !== nameSets[0]);
  if (differingPage !== -1) {
    throw new Error(
      `Pages declare different CSP directive sets (page ${differingPage} vs page 0).`,
    );
  }

  const byName = new Map();
  const order = [];
  perPage.forEach((directives, pageIndex) => {
    directives.forEach(({ name, tokens }) => {
      const hashTokens = tokens.filter(isHashToken);
      const nonHashTokens = tokens.filter((token) => !isHashToken(token));
      if (!byName.has(name)) {
        byName.set(name, { nonHashTokens, hashTokens: new Set(hashTokens) });
        order.push(name);
        return;
      }
      const existing = byName.get(name);
      const sameNonHash =
        existing.nonHashTokens.length === nonHashTokens.length &&
        existing.nonHashTokens.every((token, i) => token === nonHashTokens[i]);
      if (!sameNonHash) {
        throw new Error(
          `Pages disagree on the "${name}" directive (page ${pageIndex}): ` +
            `"${nonHashTokens.join(' ')}" vs "${existing.nonHashTokens.join(' ')}".`,
        );
      }
      hashTokens.forEach((token) => existing.hashTokens.add(token));
    });
  });

  return order
    .map((name) => {
      const { nonHashTokens, hashTokens } = byName.get(name);
      return [name, ...nonHashTokens, ...hashTokens].join(' ');
    })
    .join('; ');
}

const CSP_HEADER_NAME = 'Content-Security-Policy: ';

/** Cloudflare's documented `_headers` per-line character limit. */
export const CSP_HEADER_MAX_LENGTH = 2000;

/**
 * Extracts and merges every built page's CSP `<meta>` content, appends
 * `frame-ancestors` (unavailable in a `<meta>` element), and enforces the
 * `_headers` line limit. `maxLength` is only overridden by tests.
 *
 * @param {string[]} htmlDocuments Full built HTML, one entry per page.
 */
export function buildContentSecurityPolicyHeader(
  htmlDocuments,
  { maxLength = CSP_HEADER_MAX_LENGTH } = {},
) {
  const merged = mergeContentSecurityPolicies(htmlDocuments.map(extractCspMetaContent));
  const value = `${merged}; frame-ancestors 'none'`;
  const lineLength = CSP_HEADER_NAME.length + value.length;
  if (lineLength > maxLength) {
    throw new Error(
      `Content-Security-Policy header line would be ${lineLength} characters, ` +
        `over the ${maxLength}-character _headers line limit (Cloudflare docs).`,
    );
  }
  return value;
}

/**
 * Builds the exact `_headers` text: fixed security headers plus the merged
 * `contentSecurityPolicy` value, `X-Robots-Tag` only when non-indexable.
 * `/api/contact` is a Worker route: `_headers` never applies to it
 * (Cloudflare does not run `_headers` rules against Worker responses), so
 * it keeps setting its own headers in `src/contact/http.ts`.
 *
 * @param {{ indexable: boolean, contentSecurityPolicy: string }} policy
 */
export function buildHeadersFile({ indexable, contentSecurityPolicy }) {
  const staticHeaderLines = [
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    `Permissions-Policy: ${PERMISSIONS_POLICY}`,
    'X-Frame-Options: DENY',
    `Content-Security-Policy: ${contentSecurityPolicy}`,
    'Cross-Origin-Opener-Policy: same-origin',
    // 180 days, no `includeSubDomains` (domain not bought yet) or `preload`.
    'Strict-Transport-Security: max-age=15552000',
  ];

  if (!indexable) {
    staticHeaderLines.push('X-Robots-Tag: noindex, nofollow');
  }

  const indent = (line) => `  ${line}`;

  return [
    '/_astro/*',
    indent('Cache-Control: public, max-age=31536000, immutable'),
    '',
    '/*',
    ...staticHeaderLines.map(indent),
    '',
  ].join('\n');
}
