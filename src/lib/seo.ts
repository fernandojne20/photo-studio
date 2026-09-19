/**
 * Pure SEO/indexing policy: framework- and Sanity-free, so it can be
 * unit-tested in plain Node (see `lightbox-options.ts` for the same
 * pattern) and reused by `Seo.astro`, `robots.txt.ts` and `sitemap.xml.ts`.
 * Without a valid `PUBLIC_SITE_URL`, the build must never look indexable or
 * canonical, so a preview deploy can never compete with the real domain
 * later (see `odd/tasks/production-delivery.md`, PD-01). `resolveSiteUrl`
 * is the only function that decides what counts as a valid production
 * origin; everything else trusts its result.
 */

const LOCAL_HTTP_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/**
 * Parses and validates `PUBLIC_SITE_URL`. Accepts only a bare origin — an
 * absolute `https:` URL (or `http://localhost`/`http://127.0.0.1`, for
 * exercising the indexable branch locally; a crawler can never reach
 * either, so this cannot leak a `noindex`-bypassing URL into production)
 * with no userinfo, no path beyond `/`, no query and no hash. A
 * misconfiguration (a stray path, a leaked credential, a non-local
 * `http:`, anything unparsable) is not silently "corrected" by stripping
 * it — it resolves to `undefined`, the same safe "not indexable" default as
 * an unset variable. Scheme/host casing, ports and IDN hostnames are still
 * normalized as usual (`URL` does this natively).
 */
export function resolveSiteUrl(raw: string | undefined): URL | undefined {
  if (!raw) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }

  const isProductionHttps = parsed.protocol === 'https:';
  const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname);
  if (!isProductionHttps && !isLocalHttp) return undefined;

  const isBareOrigin =
    parsed.username === '' &&
    parsed.password === '' &&
    (parsed.pathname === '' || parsed.pathname === '/') &&
    parsed.search === '' &&
    parsed.hash === '';
  if (!isBareOrigin) return undefined;

  return new URL(parsed.origin);
}

export interface IndexingPolicy {
  indexable: boolean;
  /** Absolute origin URL (trailing slash, no path), only when `indexable`. */
  canonical?: string;
}

/** The single decision every other builder below is driven by. */
export function resolveIndexingPolicy(siteUrl: URL | undefined): IndexingPolicy {
  if (!siteUrl) return { indexable: false };
  return { indexable: true, canonical: siteUrl.toString() };
}

/** `<meta name="robots">` content for the resolved indexing policy. */
export function buildRobotsMetaContent(indexable: boolean): string {
  return indexable ? 'index, follow' : 'noindex, nofollow';
}

/**
 * Open Graph wants `og:locale` as `language_TERRITORY` (underscore), while
 * `site.locale` follows the BCP 47 `language-TERRITORY` (hyphen) form used
 * everywhere else (verified against https://ogp.me/, "og:locale ... format
 * language_TERRITORY. Default is en_US.").
 */
export function buildOpenGraphLocale(locale: string): string {
  return locale.replace('-', '_');
}

/**
 * Whether an Instagram profile URL points at a real handle rather than the
 * bare `https://www.instagram.com/` placeholder in `site.ts`. Checked on the
 * URL itself (not a separate `handle` field) so this stays correct even if
 * the two ever drift: a `sameAs` entry pointing at the platform's own
 * homepage would be a false, non-verifiable claim.
 */
export function hasRealInstagramHandle(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/+/g, '/') !== '/';
  } catch {
    return false;
  }
}

export interface JsonLdInput {
  name: string;
  /** E.164 (`site.contact.phoneE164`), not the display-formatted string. */
  telephone: string;
  email: string;
  instagramUrl: string;
  /** Only pass a canonical URL once the site's own production origin is known. */
  siteUrl?: string;
  /** Only pass an absolute image URL once one is actually resolved. */
  image?: string;
}

export interface OrganizationJsonLd {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  name: string;
  telephone: string;
  email: string;
  url?: string;
  image?: string;
  sameAs?: string[];
}

/**
 * Builds Organization JSON-LD from verified `site.ts` facts only:
 * `LocalBusiness` requires an `address` (Google's structured-data docs list
 * it as required; schema.org describes the type as "a particular physical
 * business"), and this studio has none configured, so `Organization` is
 * used instead. `url`/`image`/`sameAs` are included only once the caller
 * actually resolves them, never as an empty placeholder.
 */
export function buildJsonLd(input: JsonLdInput): OrganizationJsonLd {
  const jsonLd: OrganizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    telephone: input.telephone,
    email: input.email,
  };

  if (input.siteUrl) jsonLd.url = input.siteUrl;
  if (input.image) jsonLd.image = input.image;
  if (hasRealInstagramHandle(input.instagramUrl)) jsonLd.sameAs = [input.instagramUrl];

  return jsonLd;
}

/**
 * Serializes a JSON-LD value for embedding inside
 * `<script type="application/ld+json">`. `JSON.stringify` never escapes
 * the angle bracket, so a string value containing a closing `</script>`
 * could otherwise end the script element early; replacing every opening
 * angle bracket with its six-character Unicode escape (backslash, u, 0, 0,
 * 3, c) is the standard mitigation (used by, for example, Next.js and
 * Django) and round-trips through `JSON.parse` unchanged, since that
 * escape sequence is itself valid JSON.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * `robots.txt` for the resolved indexing policy. Crawling is always
 * allowed: Google's docs are explicit that a `noindex` rule only works once
 * the crawler can actually reach the page — "If the page is blocked by a
 * robots.txt file ..., the crawler will never see the `noindex` rule, and
 * the page can still appear in search results" (developers.google.com,
 * "Tell Google not to index a page"). Blocking crawling here would defeat
 * the whole point (keeping a non-production build out of search). `/api/`
 * (the on-demand contact endpoint) is never meant to be crawled, so it
 * stays disallowed in both modes; `Sitemap:` is only listed once a
 * canonical URL is known.
 */
export function buildRobotsTxt(policy: IndexingPolicy): string {
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /api/'];
  if (policy.indexable && policy.canonical) {
    lines.push(`Sitemap: ${new URL('/sitemap.xml', policy.canonical).toString()}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Composes {@link resolveSiteUrl}, {@link resolveIndexingPolicy} and {@link buildRobotsTxt}. */
export function robotsTxtForSiteUrl(raw: string | undefined): string {
  return buildRobotsTxt(resolveIndexingPolicy(resolveSiteUrl(raw)));
}

const SITEMAP_XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const SITEMAP_URLSET_OPEN = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

/**
 * `sitemap.xml` body for the resolved indexing policy, or `undefined` when
 * there is no canonical URL to honestly list. The sitemaps.org XSD declares
 * `<url>` as `<xsd:element name="url" type="tUrl" maxOccurs="unbounded"/>`
 * with no `minOccurs` — which defaults to 1 — so an empty `<urlset>` is not
 * a valid sitemap; `sitemap.xml.ts` serves no file at all in that case
 * instead. One-page site, so the indexable case lists exactly the homepage.
 */
export function buildSitemapXml(policy: IndexingPolicy): string | undefined {
  if (!policy.indexable || !policy.canonical) return undefined;

  return (
    `${SITEMAP_XML_HEADER}${SITEMAP_URLSET_OPEN}\n` +
    `  <url>\n    <loc>${policy.canonical}</loc>\n  </url>\n` +
    `</urlset>\n`
  );
}

/** Composes {@link resolveSiteUrl}, {@link resolveIndexingPolicy} and {@link buildSitemapXml}. */
export function sitemapXmlForSiteUrl(raw: string | undefined): string | undefined {
  return buildSitemapXml(resolveIndexingPolicy(resolveSiteUrl(raw)));
}

// The 1200x630 Open Graph/Twitter Card sharing image builder
// (`resolveShareImage`) lives in `src/lib/seo-image.ts`, not here: it needs
// `urlFor` from `src/sanity/image.ts`, which throws at import time when the
// Sanity project id/dataset env vars are missing; this file stays free of
// that dependency so its tests never need them.
