import {
  buildAnalyticsEvent,
  isLinkActivation,
  parseAnalyticsAttributes,
  type AnalyticsEvent,
  type AnalyticsEventDetailMap,
  type AnalyticsEventName,
} from '../lib/analytics-events';

/**
 * Analytics-ready dispatcher (PD-05): a delegated `click`/`auxclick`
 * listener on `document` that validates `[data-analytics-event]` markup
 * through the closed, pure vocabulary in `src/lib/analytics-events.ts` and
 * dispatches one `studio:analytics` `CustomEvent` on `document`. Loaded
 * once from `BaseLayout.astro`; `contact-form.ts` and `lightbox.ts` import
 * `trackAnalyticsEvent` for their programmatic points. No vendor is
 * installed and nothing subscribes to `studio:analytics` in production
 * (see "Analytics hooks" in `README.md`): it never prevents or delays
 * navigation, never throws, never logs, never stores anything and never
 * makes a network request.
 */

const ATTRIBUTE_SELECTOR = '[data-analytics-event]';

// Frozen so one listener can never hand a modified event to the next one.
function dispatch(event: AnalyticsEvent): void {
  Object.freeze(event.detail);
  document.dispatchEvent(
    new CustomEvent('studio:analytics', { detail: Object.freeze(event), bubbles: false }),
  );
}

// A broken/foreign attribute must never break the click it rides on, so the
// whole lookup is swallowed rather than only the parts that can fail today.
function handleActivation(target: EventTarget | null): void {
  try {
    if (!(target instanceof Element)) return;
    const element = target.closest<HTMLElement>(ATTRIBUTE_SELECTOR);
    if (!element) return;
    const event = parseAnalyticsAttributes({
      event: element.dataset.analyticsEvent,
      placement: element.dataset.analyticsPlacement,
    });
    if (event) dispatch(event);
  } catch {
    // A malformed attribute or DOM quirk is ignored, not surfaced.
  }
}

for (const type of ['click', 'auxclick'] as const) {
  document.addEventListener(type, (nativeEvent) => {
    if (isLinkActivation(nativeEvent.type, nativeEvent.button)) {
      handleActivation(nativeEvent.target);
    }
  });
}

/** For the two programmatic call sites: `contact-form.ts` and `lightbox.ts`. */
export function trackAnalyticsEvent<Name extends AnalyticsEventName>(
  name: Name,
  detail: AnalyticsEventDetailMap[Name],
): void {
  const event = buildAnalyticsEvent(name, detail);
  if (event) dispatch(event);
}
