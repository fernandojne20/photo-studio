import { describe, expect, it } from 'vitest';
import { buildWhatsAppUrl, site } from './site';

describe('buildWhatsAppUrl', () => {
  it('strips non-digit characters from the E.164 phone number', () => {
    const url = buildWhatsAppUrl({
      phoneE164: '+54 (911) 2682-1220',
      defaultMessage: 'Hola',
    });

    expect(url).toContain('https://wa.me/5491126821220?');
  });

  it('URL-encodes the message, including accents, punctuation and spaces', () => {
    const message = '¡Hola Laury! ¿Cómo estás? Quiero información, por favor.';

    const url = buildWhatsAppUrl({ phoneE164: '+5491126821220', defaultMessage: message });
    const text = new URL(url).searchParams.get('text');

    expect(text).toBe(message);
    expect(url).toContain(encodeURIComponent(message));
  });

  it('produces a wa.me URL with the digits-only number and the text query param', () => {
    const url = buildWhatsAppUrl({
      phoneE164: '+5491126821220',
      defaultMessage: 'Hola Laury, quiero consultar por una sesión de fotos.',
    });

    expect(url.startsWith('https://wa.me/5491126821220?text=')).toBe(true);
  });
});

describe('site navigation', () => {
  it('marks exactly the "lau" and "reserva-online" items as visible', () => {
    const visibleIds = site.navigation.filter((item) => item.visible).map((item) => item.id);

    expect(visibleIds.sort()).toEqual(['lau', 'reserva-online']);
  });

  it('keeps every "page" item hidden until its page exists', () => {
    const pageItems = site.navigation.filter((item) => item.kind === 'page');

    expect(pageItems.length).toBeGreaterThan(0);
    expect(pageItems.every((item) => item.visible === false)).toBe(true);
  });

  it('leaves the whatsapp item without a static href, since it is resolved at render time', () => {
    const whatsappItem = site.navigation.find((item) => item.kind === 'whatsapp');

    expect(whatsappItem).toBeDefined();
    expect(whatsappItem?.href).toBeUndefined();
  });
});
