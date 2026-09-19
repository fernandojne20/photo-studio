/**
 * Pure assertions on BUILT output for the indexing policy (PD-03/PD-06),
 * complementing — not duplicating — the `astro:build:done` hooks in
 * `astro.config.mjs`. Every extraction goes through `built-html.ts`, on
 * LIVE markup only (`stripInertMarkup`): a robots meta commented out or
 * trapped inside `<noscript>` must not count, and more than one robots meta
 * or canonical must fail loudly (a search engine combines them). These
 * functions never throw: `scripts/verify-build.ts` wraps every call anyway,
 * but nothing here depends on that.
 */

import {
  findElementContents,
  findTags,
  getHeader,
  parseAttributes,
  parseHeadersFile,
  stripInertMarkup,
} from './built-html';
import { hasRealInstagramHandle } from './seo';
import { site } from '../config/site';

export type Mode = 'indexable' | 'non-indexable';

function findRobotsMetaContents(liveHtml: string): string[] {
  return findTags(liveHtml, ['meta'])
    .map(parseAttributes)
    .filter((attrs) => attrs.name?.toLowerCase() === 'robots')
    .map((attrs) => attrs.content ?? '');
}

function findCanonicalHrefs(liveHtml: string): string[] {
  return findTags(liveHtml, ['link'])
    .map(parseAttributes)
    .filter((attrs) => attrs.rel?.toLowerCase() === 'canonical')
    .map((attrs) => attrs.href ?? '');
}

function findOgUrls(liveHtml: string): string[] {
  return findTags(liveHtml, ['meta'])
    .map(parseAttributes)
    .filter((attrs) => attrs.property?.toLowerCase() === 'og:url')
    .map((attrs) => attrs.content ?? '');
}

function extractJsonLd(liveHtml: string): Record<string, unknown> | undefined {
  const [raw] = findElementContents(
    liveHtml,
    ['script'],
    (attrs) => attrs.type === 'application/ld+json',
  );
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw.replace(/\\u003c/g, '<'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function extractSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
}

/**
 * Exactly one value expected: `[]` and `[v1, v2, ...]` both fail, with a
 * distinct message, so a missing tag is never confused with a duplicate one.
 */
function resolveSingle(values: string[], label: string, problems: string[]): string | undefined {
  if (values.length > 1) {
    problems.push(`Homepage has ${values.length} ${label} tags; there must be at most one.`);
    return undefined;
  }
  return values[0];
}

export interface IndexingCheckInput {
  mode: Mode;
  /** Required, and only meaningful, for `mode: 'indexable'`. */
  origin?: string;
  homepageHtml: string;
  notFoundHtml: string;
  robotsTxt: string;
  /** `undefined` when no `sitemap.xml` was built. */
  sitemapXml: string | undefined;
  headersText: string;
}

export interface IndexingCheckResult {
  problems: string[];
  /** Derived from the homepage's own robots meta; `false` on an unreadable one. */
  indexable: boolean;
}

interface RobotsGroup {
  agents: string[];
  rules: { directive: 'allow' | 'disallow'; path: string }[];
}

/**
 * Groups of a robots.txt (RFC 9309): one or more `User-agent` lines, then
 * the rules that apply to them. A rule outside any group applies to nobody.
 */
function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ directive: key, path: value });
    }
  }
  return groups;
}

/** The rules must sit in the group every crawler reads, and no crawler may be shut out. */
function checkRobotsRules(robotsTxt: string): string[] {
  const problems: string[] = [];
  const groups = parseRobotsGroups(robotsTxt);
  const everyone = groups.find((group) => group.agents.includes('*'));
  const has = (group: RobotsGroup, directive: 'allow' | 'disallow', path: string) =>
    group.rules.some((rule) => rule.directive === directive && rule.path === path);

  if (!everyone) {
    problems.push('robots.txt must have a "User-agent: *" group.');
  } else {
    if (!has(everyone, 'allow', '/')) problems.push('robots.txt must allow "/" for every crawler.');
    if (!has(everyone, 'disallow', '/api/'))
      problems.push('robots.txt must disallow "/api/" for every crawler.');
  }
  for (const group of groups) {
    if (has(group, 'disallow', '/'))
      problems.push(
        `robots.txt must not disallow "/" in either mode, found it for ${group.agents.join(', ')}.`,
      );
  }
  return problems;
}

/** Asserts the built output for the resolved indexing policy, in both modes. */
export function checkIndexingPolicy(input: IndexingCheckInput): IndexingCheckResult {
  const problems: string[] = [];
  const liveHomepage = stripInertMarkup(input.homepageHtml);
  const robotsValues = findRobotsMetaContents(liveHomepage);
  const robotsContent = resolveSingle(robotsValues, 'robots meta', problems);
  if (robotsContent === undefined) {
    if (robotsValues.length === 0) problems.push('Homepage has no live <meta name="robots"> tag.');
    return { problems, indexable: false };
  }
  const indexable = !robotsContent.includes('noindex');
  const canonical = resolveSingle(findCanonicalHrefs(liveHomepage), 'canonical', problems);
  const ogUrl = resolveSingle(findOgUrls(liveHomepage), 'og:url meta', problems);

  const headersRules = parseHeadersFile(input.headersText);
  const staticRule = headersRules.find((rule) => rule.path === '/*');
  const robotsTagHeader = staticRule ? getHeader(staticRule, 'X-Robots-Tag') : undefined;

  // Both modes: crawling is always allowed, and `/api/` is never crawled.
  problems.push(...checkRobotsRules(input.robotsTxt));

  if (input.mode === 'non-indexable') {
    if (robotsContent !== 'noindex, nofollow')
      problems.push(`Homepage robots meta must be "noindex, nofollow", found "${robotsContent}".`);
    if (canonical !== undefined)
      problems.push(`Homepage must have no canonical link, found "${canonical}".`);
    if (ogUrl !== undefined) problems.push(`Homepage must have no og:url, found "${ogUrl}".`);
    if (/^Sitemap:/m.test(input.robotsTxt)) problems.push('robots.txt must have no Sitemap: line.');
    if (input.sitemapXml !== undefined) problems.push('sitemap.xml must not exist.');
    if (robotsTagHeader !== 'noindex, nofollow')
      problems.push(
        `_headers' /* rule must set X-Robots-Tag: noindex, nofollow, found ${robotsTagHeader ? `"${robotsTagHeader}"` : 'none'}.`,
      );
  } else {
    if (!input.origin) {
      return {
        problems: ['checkIndexingPolicy: mode "indexable" requires an expected origin.'],
        indexable,
      };
    }
    const expected = new URL('/', input.origin).toString();
    if (robotsContent !== 'index, follow')
      problems.push(`Homepage robots meta must be "index, follow", found "${robotsContent}".`);
    if (canonical !== expected)
      problems.push(`Homepage canonical must be "${expected}", found "${canonical ?? 'none'}".`);
    if (ogUrl !== expected)
      problems.push(`Homepage og:url must be "${expected}", found "${ogUrl ?? 'none'}".`);
    const sitemapUrl = new URL('/sitemap.xml', input.origin).toString();
    if (!input.robotsTxt.includes(`Sitemap: ${sitemapUrl}`))
      problems.push(`robots.txt must have "Sitemap: ${sitemapUrl}".`);
    if (input.sitemapXml === undefined) {
      problems.push('sitemap.xml must exist.');
    } else {
      const locs = extractSitemapLocs(input.sitemapXml);
      if (locs.length !== 1 || locs[0] !== expected)
        problems.push(
          `sitemap.xml must list exactly the homepage "${expected}", found ${JSON.stringify(locs)}.`,
        );
    }
    if (robotsTagHeader !== undefined)
      problems.push(`_headers' /* rule must not set X-Robots-Tag, found "${robotsTagHeader}".`);
  }

  const liveNotFound = stripInertMarkup(input.notFoundHtml);
  const notFoundRobots = resolveSingle(
    findRobotsMetaContents(liveNotFound),
    '404 robots meta',
    problems,
  );
  if (!notFoundRobots?.includes('noindex'))
    problems.push(`404 page robots meta must be noindex, found "${notFoundRobots ?? 'none'}".`);
  const notFoundCanonicals = findCanonicalHrefs(liveNotFound);
  if (notFoundCanonicals.length > 0) problems.push('404 page must have no canonical link.');
  if (input.sitemapXml !== undefined && extractSitemapLocs(input.sitemapXml).length !== 1)
    problems.push('sitemap.xml must list exactly one URL (the homepage), never the 404 page.');

  const jsonLd = extractJsonLd(liveHomepage);
  if (!jsonLd) {
    problems.push('Homepage JSON-LD block is missing or does not parse.');
  } else {
    if (jsonLd['@type'] !== 'Organization')
      problems.push(
        `JSON-LD @type must be "Organization", found ${JSON.stringify(jsonLd['@type'])}.`,
      );
    const isPlaceholder = !hasRealInstagramHandle(site.instagram.url);
    if (isPlaceholder && 'sameAs' in jsonLd)
      problems.push('JSON-LD must have no sameAs while the Instagram URL is the bare placeholder.');
    if (
      !isPlaceholder &&
      !(Array.isArray(jsonLd.sameAs) && jsonLd.sameAs.includes(site.instagram.url))
    )
      problems.push(
        'JSON-LD must include sameAs with the configured Instagram URL once a real handle is set.',
      );
  }

  return { problems, indexable };
}

/**
 * A misconfigured `PUBLIC_SITE_URL` must be loud: set while verifying
 * non-indexable, or set while the output is not actually indexable (an
 * invalid value silently degrades instead of failing `astro build`), names
 * the variable instead of a generic canonical/robots mismatch.
 */
export function checkEnvironmentConsistency(input: {
  mode: Mode;
  publicSiteUrlRaw: string | undefined;
  indexable: boolean;
}): string[] {
  const isSet = Boolean(input.publicSiteUrlRaw);
  if (isSet && (input.mode === 'non-indexable' || !input.indexable)) {
    return [
      `PUBLIC_SITE_URL is set ("${input.publicSiteUrlRaw}") but the build is not indexable ` +
        `(mode requested: ${input.mode}). Unset it for a non-indexable build, or fix its value ` +
        '(a bare https origin, no path/query/hash).',
    ];
  }
  return [];
}
