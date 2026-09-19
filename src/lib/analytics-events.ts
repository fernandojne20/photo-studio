/**
 * Closed, privacy-safe analytics event vocabulary (PD-05). No vendor is
 * installed here: this module only describes what the dispatcher
 * (`src/scripts/analytics.ts`) is ALLOWED to dispatch, and sanitizes
 * whatever it is handed down to that shape. Every detail value is a closed
 * set or a small integer; nothing here may ever carry a URL, a phone
 * number, an e-mail address, a submitted field value, a field name, free
 * text, a timestamp or any identifier. See "Analytics hooks" in
 * `README.md`.
 */

import type { ContactResponseOutcome } from './contact-form-state';

export type AnalyticsEventName =
  | 'whatsapp_click'
  | 'instagram_click'
  | 'email_click'
  | 'phone_click'
  | 'contact_form_submit'
  | 'contact_form_result'
  | 'lightbox_open';

/** Where a click-type event was activated. */
export type AnalyticsPlacement =
  'header' | 'mobile_menu' | 'hero' | 'biography' | 'contact' | 'footer' | 'instagram_section';

/** The result of one contact-form submit attempt. Never which field failed. */
export type ContactFormOutcome =
  'success' | 'field_errors' | 'captcha_failed' | 'not_configured' | 'delivery_failed' | 'network';

export interface AnalyticsEventDetailMap {
  whatsapp_click: { placement: AnalyticsPlacement };
  instagram_click: { placement: AnalyticsPlacement };
  email_click: { placement: AnalyticsPlacement };
  phone_click: { placement: AnalyticsPlacement };
  contact_form_submit: Record<string, never>;
  contact_form_result: { outcome: ContactFormOutcome };
  lightbox_open: { position: number };
}

export type AnalyticsEvent = {
  [Name in AnalyticsEventName]: { name: Name; detail: AnalyticsEventDetailMap[Name] };
}[AnalyticsEventName];

/**
 * Event names a declarative `data-analytics-event` attribute may carry, and
 * the closed placements — both exported as the single source of truth for
 * `src/lib/analytics-markup.test.ts`, which scans the `.astro` sources for
 * drift against these exact lists.
 */
export const MARKUP_ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = [
  'whatsapp_click',
  'instagram_click',
  'email_click',
  'phone_click',
];
const MARKUP_EVENT_NAMES: ReadonlySet<string> = new Set(MARKUP_ANALYTICS_EVENT_NAMES);

export const ANALYTICS_PLACEMENTS: readonly AnalyticsPlacement[] = [
  'header',
  'mobile_menu',
  'hero',
  'biography',
  'contact',
  'footer',
  'instagram_section',
];
const PLACEMENTS: ReadonlySet<string> = new Set(ANALYTICS_PLACEMENTS);

const OUTCOMES: ReadonlySet<string> = new Set<ContactFormOutcome>([
  'success',
  'field_errors',
  'captcha_failed',
  'not_configured',
  'delivery_failed',
  'network',
]);

/**
 * Which native events count as activating a link. A `click` always does
 * (keyboard activation fires it too). An `auxclick` only with the middle
 * button, which opens the link in a background tab without a `click`; the
 * secondary button only opens the context menu.
 */
export function isLinkActivation(type: string, button: number): boolean {
  if (type === 'click') return true;
  return type === 'auxclick' && button === 1;
}

export type LinkAnalyticsEvent =
  'whatsapp_click' | 'instagram_click' | 'email_click' | 'phone_click';

const WHATSAPP_PREFIXES: readonly string[] = [
  'https://wa.me/',
  'https://api.whatsapp.com/',
  'whatsapp:',
];

/** A URL as the browser resolves it: no tabs or line breaks, no leading spaces, lowercased. */
function normalizeHref(href: string): string {
  const compact = href.replace(/[\t\n\r]/g, '');
  let start = 0;
  while (start < compact.length && compact.charCodeAt(start) <= 0x20) start += 1;
  return compact.slice(start).toLowerCase();
}

/**
 * The event a link deserves by WHERE IT GOES, not by how it was configured.
 * An editor can paste a WhatsApp or Instagram URL as a plain call to action,
 * and that link is a conversion like any other.
 */
export function analyticsEventForHref(
  href: string,
  instagramUrl: string,
): LinkAnalyticsEvent | undefined {
  const url = normalizeHref(href);
  if (WHATSAPP_PREFIXES.some((prefix) => url.startsWith(prefix))) return 'whatsapp_click';
  if (url.startsWith('mailto:')) return 'email_click';
  if (url.startsWith('tel:')) return 'phone_click';
  const trim = (value: string) => value.replace(/\/$/, '');
  if (trim(url) === trim(normalizeHref(instagramUrl))) return 'instagram_click';
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizePlacement(value: unknown): AnalyticsPlacement | undefined {
  return typeof value === 'string' && PLACEMENTS.has(value)
    ? (value as AnalyticsPlacement)
    : undefined;
}

function sanitizeOutcome(value: unknown): ContactFormOutcome | undefined {
  return typeof value === 'string' && OUTCOMES.has(value)
    ? (value as ContactFormOutcome)
    : undefined;
}

/** A gallery position: a small integer, so it can never smuggle an identifier. */
const MAX_POSITION = 999;

function sanitizePosition(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_POSITION
    ? value
    : undefined;
}

type FormErrorCode = Extract<ContactResponseOutcome, { kind: 'form_error' }>['code'];

/** The form's `unknown` code covers network failures and unreadable responses. */
export function analyticsOutcomeForFormErrorCode(code: FormErrorCode): ContactFormOutcome {
  return code === 'unknown' ? 'network' : code;
}

/** Never the field name: `field_errors` covers every invalid field alike. */
export function analyticsOutcomeForResponse(outcome: ContactResponseOutcome): ContactFormOutcome {
  if (outcome.kind === 'success') return 'success';
  if (outcome.kind === 'field_errors') return 'field_errors';
  return analyticsOutcomeForFormErrorCode(outcome.code);
}

/**
 * Turns an element's declarative `data-analytics-event`/`data-analytics-placement`
 * attributes into a validated event, or `undefined`. Only the four
 * placement-shaped click events are reachable from markup; an unknown event
 * name or an unknown placement is dropped, never passed through. Hostile
 * input (unknown keys, prototype keys, non-string values, oversized
 * strings) always falls through to `undefined`: closed-set membership never
 * matches anything that is not one of the exact allowed strings.
 */
export function parseAnalyticsAttributes(attrs: {
  event?: unknown;
  placement?: unknown;
}): AnalyticsEvent | undefined {
  const event = attrs.event;
  if (typeof event !== 'string' || !MARKUP_EVENT_NAMES.has(event)) return undefined;
  const placement = sanitizePlacement(attrs.placement);
  if (!placement) return undefined;
  return { name: event as AnalyticsEventName, detail: { placement } } as AnalyticsEvent;
}

/**
 * Builds a validated event for a programmatic call site
 * (`trackAnalyticsEvent` in `src/scripts/analytics.ts`), stripping any key
 * outside the closed detail shape for `name`. Returns `undefined` for an
 * unknown event name or a `detail` missing/misshaping its required field,
 * so a caller mistake never reaches `CustomEvent.detail`.
 */
export function buildAnalyticsEvent(
  name: AnalyticsEventName,
  detail: unknown,
): AnalyticsEvent | undefined {
  const raw = isRecord(detail) ? detail : {};
  switch (name) {
    case 'whatsapp_click':
    case 'instagram_click':
    case 'email_click':
    case 'phone_click': {
      const placement = sanitizePlacement(raw.placement);
      return placement ? ({ name, detail: { placement } } as AnalyticsEvent) : undefined;
    }
    case 'contact_form_submit':
      return { name, detail: {} };
    case 'contact_form_result': {
      const outcome = sanitizeOutcome(raw.outcome);
      return outcome ? { name, detail: { outcome } } : undefined;
    }
    case 'lightbox_open': {
      const position = sanitizePosition(raw.position);
      return position !== undefined ? { name, detail: { position } } : undefined;
    }
    default:
      return undefined;
  }
}
