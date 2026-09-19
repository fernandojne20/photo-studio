import { describe, expect, it } from 'vitest';
import {
  analyticsEventForHref,
  analyticsOutcomeForFormErrorCode,
  analyticsOutcomeForResponse,
  buildAnalyticsEvent,
  isLinkActivation,
  parseAnalyticsAttributes,
} from './analytics-events';

describe('parseAnalyticsAttributes', () => {
  it('accepts each closed click event with a valid placement', () => {
    expect(parseAnalyticsAttributes({ event: 'whatsapp_click', placement: 'header' })).toEqual({
      name: 'whatsapp_click',
      detail: { placement: 'header' },
    });
    expect(parseAnalyticsAttributes({ event: 'instagram_click', placement: 'footer' })).toEqual({
      name: 'instagram_click',
      detail: { placement: 'footer' },
    });
    expect(parseAnalyticsAttributes({ event: 'email_click', placement: 'contact' })).toEqual({
      name: 'email_click',
      detail: { placement: 'contact' },
    });
    expect(parseAnalyticsAttributes({ event: 'phone_click', placement: 'contact' })).toEqual({
      name: 'phone_click',
      detail: { placement: 'contact' },
    });
  });

  it('accepts every closed placement', () => {
    const placements = [
      'header',
      'mobile_menu',
      'hero',
      'biography',
      'contact',
      'footer',
      'instagram_section',
    ] as const;
    for (const placement of placements) {
      expect(parseAnalyticsAttributes({ event: 'whatsapp_click', placement })).toEqual({
        name: 'whatsapp_click',
        detail: { placement },
      });
    }
  });

  it('drops an unknown event name', () => {
    expect(
      parseAnalyticsAttributes({ event: 'download_click', placement: 'header' }),
    ).toBeUndefined();
  });

  it('drops an unknown placement', () => {
    expect(
      parseAnalyticsAttributes({ event: 'whatsapp_click', placement: 'sidebar' }),
    ).toBeUndefined();
  });

  it('drops a programmatic-only event name (not reachable from markup)', () => {
    expect(
      parseAnalyticsAttributes({ event: 'contact_form_result', placement: 'contact' }),
    ).toBeUndefined();
    expect(
      parseAnalyticsAttributes({ event: 'lightbox_open', placement: 'contact' }),
    ).toBeUndefined();
  });

  it('drops missing attributes', () => {
    expect(parseAnalyticsAttributes({})).toBeUndefined();
    expect(parseAnalyticsAttributes({ event: 'whatsapp_click' })).toBeUndefined();
    expect(parseAnalyticsAttributes({ placement: 'header' })).toBeUndefined();
  });

  it('drops null and undefined values', () => {
    expect(parseAnalyticsAttributes({ event: null, placement: 'header' })).toBeUndefined();
    expect(
      parseAnalyticsAttributes({ event: 'whatsapp_click', placement: undefined }),
    ).toBeUndefined();
  });

  it('drops non-string values', () => {
    expect(parseAnalyticsAttributes({ event: 1, placement: 'header' })).toBeUndefined();
    expect(
      parseAnalyticsAttributes({ event: 'whatsapp_click', placement: ['header'] }),
    ).toBeUndefined();
    expect(
      parseAnalyticsAttributes({
        event: 'whatsapp_click',
        placement: { toString: () => 'header' },
      }),
    ).toBeUndefined();
  });

  it('drops an unknown extra key without letting it affect the result', () => {
    expect(
      parseAnalyticsAttributes({
        event: 'whatsapp_click',
        placement: 'header',
        phone: '+54 9 11 0000 0000',
      } as never),
    ).toEqual({ name: 'whatsapp_click', detail: { placement: 'header' } });
  });

  it('drops a prototype-polluting key on the input object', () => {
    const attrs = JSON.parse('{"event":"whatsapp_click","placement":"header","__proto__":{"x":1}}');
    expect(parseAnalyticsAttributes(attrs)).toEqual({
      name: 'whatsapp_click',
      detail: { placement: 'header' },
    });
  });

  it('drops a very long, non-matching string instead of throwing', () => {
    const long = 'whatsapp_click' + 'x'.repeat(10_000);
    expect(parseAnalyticsAttributes({ event: long, placement: 'header' })).toBeUndefined();
  });
});

describe('buildAnalyticsEvent', () => {
  it('builds each click event from a valid placement', () => {
    expect(buildAnalyticsEvent('email_click', { placement: 'contact' })).toEqual({
      name: 'email_click',
      detail: { placement: 'contact' },
    });
  });

  it('drops a click event with an unknown placement', () => {
    expect(buildAnalyticsEvent('phone_click', { placement: 'sidebar' })).toBeUndefined();
  });

  it('builds contact_form_submit with an empty detail, stripping any extra key', () => {
    expect(
      buildAnalyticsEvent('contact_form_submit', { note: 'zz-secret-zz@example.com' }),
    ).toEqual({
      name: 'contact_form_submit',
      detail: {},
    });
  });

  it('builds contact_form_result from a valid outcome', () => {
    expect(buildAnalyticsEvent('contact_form_result', { outcome: 'field_errors' })).toEqual({
      name: 'contact_form_result',
      detail: { outcome: 'field_errors' },
    });
  });

  it('drops contact_form_result carrying an invalid field name instead of the closed outcome', () => {
    expect(buildAnalyticsEvent('contact_form_result', { outcome: 'email' })).toBeUndefined();
    expect(buildAnalyticsEvent('contact_form_result', { field: 'email' })).toBeUndefined();
  });

  it('strips a field name riding alongside a valid outcome, never letting it into the detail', () => {
    expect(
      buildAnalyticsEvent('contact_form_result', { outcome: 'field_errors', field: 'email' }),
    ).toEqual({ name: 'contact_form_result', detail: { outcome: 'field_errors' } });
  });

  it('builds lightbox_open from a positive integer position', () => {
    expect(buildAnalyticsEvent('lightbox_open', { position: 3 })).toEqual({
      name: 'lightbox_open',
      detail: { position: 3 },
    });
  });

  it('drops lightbox_open for a non-positive, fractional, or non-numeric position', () => {
    expect(buildAnalyticsEvent('lightbox_open', { position: 0 })).toBeUndefined();
    expect(buildAnalyticsEvent('lightbox_open', { position: -1 })).toBeUndefined();
    expect(buildAnalyticsEvent('lightbox_open', { position: 1.5 })).toBeUndefined();
    expect(buildAnalyticsEvent('lightbox_open', { position: '3' })).toBeUndefined();
  });

  it('drops an unknown event name', () => {
    expect(buildAnalyticsEvent('download_click' as never, { placement: 'header' })).toBeUndefined();
  });

  it('never throws for a non-object detail', () => {
    expect(buildAnalyticsEvent('whatsapp_click', null)).toBeUndefined();
    expect(buildAnalyticsEvent('whatsapp_click', 'header')).toBeUndefined();
    expect(buildAnalyticsEvent('whatsapp_click', undefined)).toBeUndefined();
  });

  it('drops a prototype-polluting detail object', () => {
    const detail = JSON.parse('{"placement":"header","__proto__":{"x":1}}');
    expect(buildAnalyticsEvent('whatsapp_click', detail)).toEqual({
      name: 'whatsapp_click',
      detail: { placement: 'header' },
    });
  });
});

describe('analyticsOutcomeForFormErrorCode', () => {
  it.each([
    ['captcha_failed', 'captcha_failed'],
    ['not_configured', 'not_configured'],
    ['delivery_failed', 'delivery_failed'],
    ['unknown', 'network'],
  ] as const)('maps the form code %s to the analytics outcome %s', (code, expected) => {
    expect(analyticsOutcomeForFormErrorCode(code)).toBe(expected);
  });
});

describe('analyticsOutcomeForResponse', () => {
  it('maps a success', () => {
    expect(analyticsOutcomeForResponse({ kind: 'success' })).toBe('success');
  });

  it('maps field errors without ever naming the field', () => {
    expect(
      analyticsOutcomeForResponse({ kind: 'field_errors', errors: { email: 'email_invalid' } }),
    ).toBe('field_errors');
  });

  it('maps each form-level code', () => {
    expect(analyticsOutcomeForResponse({ kind: 'form_error', code: 'not_configured' })).toBe(
      'not_configured',
    );
    expect(analyticsOutcomeForResponse({ kind: 'form_error', code: 'unknown' })).toBe('network');
  });
});

describe('lightbox_open position bounds', () => {
  it('accepts 1 and 999', () => {
    expect(buildAnalyticsEvent('lightbox_open', { position: 1 })).toEqual({
      name: 'lightbox_open',
      detail: { position: 1 },
    });
    expect(buildAnalyticsEvent('lightbox_open', { position: 999 })).toEqual({
      name: 'lightbox_open',
      detail: { position: 999 },
    });
  });

  it('drops 0, 1000, a fraction and a numeric string', () => {
    expect(buildAnalyticsEvent('lightbox_open', { position: 0 })).toBeUndefined();
    expect(buildAnalyticsEvent('lightbox_open', { position: 1000 })).toBeUndefined();
    expect(buildAnalyticsEvent('lightbox_open', { position: 2.5 })).toBeUndefined();
    expect(buildAnalyticsEvent('lightbox_open', { position: '3' })).toBeUndefined();
  });
});

describe('contact_form_result accepts every outcome of the closed set', () => {
  it.each([
    'success',
    'field_errors',
    'captcha_failed',
    'not_configured',
    'delivery_failed',
    'network',
  ] as const)('%s', (outcome) => {
    expect(buildAnalyticsEvent('contact_form_result', { outcome })).toEqual({
      name: 'contact_form_result',
      detail: { outcome },
    });
  });

  it('drops an outcome outside the set', () => {
    expect(buildAnalyticsEvent('contact_form_result', { outcome: 'sent' })).toBeUndefined();
  });
});

describe('isLinkActivation', () => {
  it('counts every click, whatever button it reports', () => {
    expect(isLinkActivation('click', 0)).toBe(true);
  });

  it('counts a middle-button auxclick, which opens the link in a background tab', () => {
    expect(isLinkActivation('auxclick', 1)).toBe(true);
  });

  it('does not count the context menu or the other auxiliary buttons', () => {
    expect(isLinkActivation('auxclick', 2)).toBe(false);
    expect(isLinkActivation('auxclick', 3)).toBe(false);
    expect(isLinkActivation('auxclick', 0)).toBe(false);
  });

  it('does not count any other event type', () => {
    expect(isLinkActivation('contextmenu', 2)).toBe(false);
    expect(isLinkActivation('mousedown', 1)).toBe(false);
  });
});

describe('analyticsEventForHref', () => {
  const instagram = 'https://www.instagram.com/lauryherrera/';

  it.each([
    ['https://wa.me/5491126821220?text=Hola', 'whatsapp_click'],
    ['https://api.whatsapp.com/send?phone=5491126821220', 'whatsapp_click'],
    ['http://wa.me/5491126821220', 'whatsapp_click'],
    ['http://api.whatsapp.com/send?phone=5491126821220', 'whatsapp_click'],
    ['https://wa.me?text=Hola', 'whatsapp_click'],
    ['https://wa.me', 'whatsapp_click'],
    ['whatsapp://send?phone=1', 'whatsapp_click'],
    ['  HTTPS://WA.ME/1', 'whatsapp_click'],
    ['mailto:hola@example.com', 'email_click'],
    ['tel:+5491126821220', 'phone_click'],
    ['https://www.instagram.com/lauryherrera', 'instagram_click'],
    ['https://www.instagram.com/lauryherrera/', 'instagram_click'],
  ])('classifies %s as %s', (href, expected) => {
    expect(analyticsEventForHref(href, instagram)).toBe(expected);
  });

  it.each([
    ['#contacto'],
    ['https://example.com/galeria'],
    ['https://www.instagram.com/otra-cuenta/'],
    ['https://wa.me.evil.test/1'],
    ['http://wa.me.evil.test/1'],
    ['ftp://wa.me/1'],
    ['wa.me/1'],
    [''],
  ])('gives no event to %s', (href) => {
    expect(analyticsEventForHref(href, instagram)).toBeUndefined();
  });
});
