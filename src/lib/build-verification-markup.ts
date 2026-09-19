/**
 * Pure assertions on built page markup (PD-05/PD-06): every conversion
 * link's analytics attributes, and page hygiene (image weight/laziness, no
 * cross-origin script or stylesheet). Everything reads through
 * `built-html.ts` on LIVE markup only (`stripInertMarkup`), so a link
 * hidden inside `<noscript>` is never mistaken for a real one.
 */

import { findTags, hasRelToken, parseAttributes, stripInertMarkup } from './built-html';
import { ANALYTICS_PLACEMENTS, MARKUP_ANALYTICS_EVENT_NAMES } from './analytics-events';
import type { AnalyticsEventName } from './analytics-events';
import { site } from '../config/site';

type LinkKind = 'whatsapp' | 'email' | 'phone' | 'instagram';
const LINK_KIND_EVENT: Record<LinkKind, AnalyticsEventName> = {
  whatsapp: 'whatsapp_click',
  email: 'email_click',
  phone: 'phone_click',
  instagram: 'instagram_click',
};
/** `http:` counts too: the call to action schema accepts it and the link still reaches WhatsApp. */
const WHATSAPP_HOSTS: ReadonlySet<string> = new Set(['wa.me', 'api.whatsapp.com']);

/** By parsed host, as the browser resolves it: `https://wa.me?text=x` counts, `wa.me.evil.test` does not. */
function isWhatsAppUrl(href: string): boolean {
  try {
    const { protocol, hostname } = new URL(href);
    if (protocol === 'whatsapp:') return true;
    return (protocol === 'https:' || protocol === 'http:') && WHATSAPP_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
const MARKUP_EVENT_SET: ReadonlySet<string> = new Set(MARKUP_ANALYTICS_EVENT_NAMES);
const PLACEMENT_SET: ReadonlySet<string> = new Set(ANALYTICS_PLACEMENTS);

/** Strips one trailing slash so `https://www.instagram.com/` and `https://www.instagram.com` compare equal. */
function withoutTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Case-insensitive; the Instagram link must EQUAL the configured URL (one
 * trailing slash normalized), never merely start with it — a profile link
 * to someone else's page under the same host would otherwise pass.
 */
/**
 * A browser strips tabs and line breaks from a URL, trims leading control
 * characters and spaces, and reads a backslash as a slash, all before it
 * looks at the scheme. Classify what the browser will actually follow.
 */
function normalizeUrl(value: string): string {
  const compact = value.replace(/[\t\n\r]/g, '');
  let start = 0;
  while (start < compact.length && compact.charCodeAt(start) <= 0x20) start += 1;
  return compact.slice(start).replace(/\\/g, '/');
}

/**
 * True for anything the browser would fetch from another origin, `//host/x`
 * included. A named reference this reader does not decode could stand for
 * any character, so a URL that still carries one counts as cross-origin.
 */
function isCrossOrigin(url: string): boolean {
  const normalized = normalizeUrl(url);
  return (
    normalized.startsWith('//') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized) ||
    /&[a-zA-Z][a-zA-Z0-9]*;/.test(normalized)
  );
}

function classifyLinkKind(rawHref: string, instagramUrl: string): LinkKind | undefined {
  const lower = normalizeUrl(rawHref).toLowerCase();
  if (isWhatsAppUrl(rawHref)) return 'whatsapp';
  if (lower.startsWith('mailto:')) return 'email';
  if (lower.startsWith('tel:')) return 'phone';
  if (withoutTrailingSlash(lower) === withoutTrailingSlash(instagramUrl.toLowerCase()))
    return 'instagram';
  return undefined;
}

/**
 * Asserts, on one built page (outside `<noscript>`): every WhatsApp/mailto/
 * tel/Instagram `<a>` carries a matching `data-analytics-event`/
 * `data-analytics-placement`, and no other element carries either — what a
 * source-text scan cannot see: a link with no attributes, or a wrong condition.
 */
export function checkAnalyticsMarkup(html: string): string[] {
  const problems: string[] = [];
  const live = stripInertMarkup(html);
  const instagramUrl = site.instagram.url;

  for (const tag of findTags(live, ['a'])) {
    const attrs = parseAttributes(tag);
    if (attrs.href === undefined) continue;
    const kind = classifyLinkKind(attrs.href, instagramUrl);
    if (!kind) continue;
    const expectedEvent = LINK_KIND_EVENT[kind];
    const event = attrs['data-analytics-event'];
    const placement = attrs['data-analytics-placement'];
    if (event !== expectedEvent)
      problems.push(
        `Link to "${attrs.href}" must carry data-analytics-event="${expectedEvent}", found ${event ? `"${event}"` : 'none'}.`,
      );
    if (placement === undefined || !PLACEMENT_SET.has(placement))
      problems.push(
        `Link to "${attrs.href}" must carry a data-analytics-placement from the closed vocabulary, found ${placement ? `"${placement}"` : 'none'}.`,
      );
  }

  for (const tag of findTags(live)) {
    const attrs = parseAttributes(tag);
    const event = attrs['data-analytics-event'];
    const placement = attrs['data-analytics-placement'];
    if (event === undefined && placement === undefined) continue;
    const tagName = tag.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/)?.[1]?.toLowerCase();
    const kind =
      tagName === 'a' && attrs.href !== undefined
        ? classifyLinkKind(attrs.href, instagramUrl)
        : undefined;
    if (!kind || (event !== undefined && !MARKUP_EVENT_SET.has(event))) {
      problems.push(
        `Unexpected data-analytics-* attribute on a non-conversion element: ${tag.slice(0, 160)}`,
      );
    }
  }

  return problems;
}

/** Asserts no cross-origin script/stylesheet, and `<img>` weight/lazy-loading hygiene, on one built page. */
export function checkPageHygiene(html: string): string[] {
  const problems: string[] = [];
  const live = stripInertMarkup(html);

  for (const attrs of findTags(live, ['script']).map(parseAttributes)) {
    if (attrs.src && isCrossOrigin(attrs.src))
      problems.push(`Script from another origin: ${attrs.src}`);
  }
  for (const attrs of findTags(live, ['link']).map(parseAttributes)) {
    if (!hasRelToken(attrs, 'stylesheet')) continue;
    if (attrs.href && isCrossOrigin(attrs.href))
      problems.push(`Stylesheet from another origin: ${attrs.href}`);
  }

  // A `<base href>` moves every relative URL, so `src="x.js"` could leave the origin.
  for (const attrs of findTags(live, ['base']).map(parseAttributes)) {
    if (attrs.href !== undefined)
      problems.push(`<base href="${attrs.href}"> is not allowed: it re-points every relative URL.`);
  }

  const imgAttrs = findTags(live, ['img']).map(parseAttributes);
  let nonLazyCount = 0;
  for (const attrs of imgAttrs) {
    if (attrs.width === undefined) problems.push(`<img> without width: ${JSON.stringify(attrs)}`);
    if (attrs.height === undefined) problems.push(`<img> without height: ${JSON.stringify(attrs)}`);
    if (attrs.loading?.toLowerCase() !== 'lazy') {
      nonLazyCount += 1;
      if (attrs.fetchpriority?.toLowerCase() !== 'high')
        problems.push(`Non-lazy <img> without fetchpriority="high": ${JSON.stringify(attrs)}`);
    }
  }
  // A page with no images (e.g. the 404 page) has nothing to check here.
  if (imgAttrs.length > 0 && nonLazyCount !== 1)
    problems.push(`Expected exactly one non-lazy <img>, found ${nonLazyCount}.`);

  return problems;
}
