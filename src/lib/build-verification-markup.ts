/**
 * Pure assertions on built page markup: every conversion link's analytics
 * attributes, and page hygiene (image weight and laziness, no cross-origin
 * script or stylesheet). `analyticsEventForHref` is the SAME function the page
 * uses to decide which links get the attributes, so the two cannot disagree.
 */

import { hasRelToken, readLiveElements } from './built-dom';
import {
  ANALYTICS_PLACEMENTS,
  MARKUP_ANALYTICS_EVENT_NAMES,
  analyticsEventForHref,
} from './analytics-events';
import { isCrossOrigin } from './resource-url';
import { site } from '../config/site';

const MARKUP_EVENT_SET: ReadonlySet<string> = new Set(MARKUP_ANALYTICS_EVENT_NAMES);
const PLACEMENT_SET: ReadonlySet<string> = new Set(ANALYTICS_PLACEMENTS);

/**
 * Asserts, on one built page (outside `<noscript>`): every WhatsApp/mailto/
 * tel/Instagram `<a>` carries a matching `data-analytics-event`/
 * `data-analytics-placement`, and no other element carries either — what a
 * source-text scan cannot see: a link with no attributes, or a wrong condition.
 */
export function checkAnalyticsMarkup(html: string): string[] {
  const problems: string[] = [];
  const elements = readLiveElements(html);
  const instagramUrl = site.instagram.url;

  for (const element of elements) {
    if (element.name !== 'a') continue;
    const { attrs } = element;
    if (attrs.href === undefined) continue;
    const expectedEvent = analyticsEventForHref(attrs.href, instagramUrl);
    if (!expectedEvent) continue;
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

  for (const element of elements) {
    const { attrs } = element;
    const event = attrs['data-analytics-event'];
    const placement = attrs['data-analytics-placement'];
    if (event === undefined && placement === undefined) continue;
    const expectedEvent =
      element.name === 'a' && attrs.href !== undefined
        ? analyticsEventForHref(attrs.href, instagramUrl)
        : undefined;
    if (!expectedEvent || (event !== undefined && !MARKUP_EVENT_SET.has(event))) {
      problems.push(
        `Unexpected data-analytics-* attribute on a non-conversion element: ${element.source.slice(0, 160)}`,
      );
    }
  }

  return problems;
}

/** Asserts no cross-origin script/stylesheet, and `<img>` weight/lazy-loading hygiene, on one built page. */
export function checkPageHygiene(html: string): string[] {
  const problems: string[] = [];
  const elements = readLiveElements(html);

  for (const element of elements) {
    if (element.name !== 'script') continue;
    const { src } = element.attrs;
    if (src && isCrossOrigin(src)) problems.push(`Script from another origin: ${src}`);
  }
  for (const element of elements) {
    if (element.name !== 'link' || !hasRelToken(element.attrs, 'stylesheet')) continue;
    const { href } = element.attrs;
    if (href && isCrossOrigin(href)) problems.push(`Stylesheet from another origin: ${href}`);
  }

  // A `<base href>` moves every relative URL, so `src="x.js"` could leave the origin.
  for (const element of elements) {
    if (element.name === 'base' && element.attrs.href !== undefined)
      problems.push(
        `<base href="${element.attrs.href}"> is not allowed: it re-points every relative URL.`,
      );
  }

  const imgAttrs = elements
    .filter((element) => element.name === 'img')
    .map((element) => element.attrs);
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
