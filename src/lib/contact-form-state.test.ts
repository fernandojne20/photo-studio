import { describe, expect, it } from 'vitest';
import {
  buildContactPayload,
  classifySubmitFailure,
  firstInvalidField,
  interpretResponse,
  mapFormErrorMessage,
  type ContactFormFieldValues,
  type ContactFormMessages,
} from './contact-form-state';

const FIELDS: ContactFormFieldValues = {
  firstName: 'Fernando',
  lastName: 'Núñez',
  email: 'fernando@nunez.com.co',
  phone: '+54 9 11 2682 1220',
  message: 'Hola, quiero información.',
  website: '',
};

describe('buildContactPayload', () => {
  it('spreads every field and adds the captcha token', () => {
    const payload = buildContactPayload(FIELDS, 'token-abc');

    expect(payload).toEqual({
      firstName: 'Fernando',
      lastName: 'Núñez',
      email: 'fernando@nunez.com.co',
      phone: '+54 9 11 2682 1220',
      message: 'Hola, quiero información.',
      website: '',
      captchaToken: 'token-abc',
    });
  });

  it('passes a filled honeypot through unchanged, since the server decides what it means', () => {
    const payload = buildContactPayload({ ...FIELDS, website: 'http://spam.example' }, 'token-abc');

    expect(payload.website).toBe('http://spam.example');
  });
});

describe('interpretResponse: success (200)', () => {
  it('reports success for 200 with ok === true', () => {
    expect(interpretResponse(200, { ok: true })).toEqual({ kind: 'success' });
  });

  it('does NOT report success for 200 with a missing ok', () => {
    expect(interpretResponse(200, {})).toEqual({ kind: 'form_error', code: 'unknown' });
  });

  it('does NOT report success for 200 with a truthy-but-not-true ok (mutation guard: no loose truthiness check)', () => {
    expect(interpretResponse(200, { ok: 1 })).toEqual({ kind: 'form_error', code: 'unknown' });
    expect(interpretResponse(200, { ok: 'true' })).toEqual({ kind: 'form_error', code: 'unknown' });
  });

  it('does NOT report success for 200 with a non-object body', () => {
    expect(interpretResponse(200, null)).toEqual({ kind: 'form_error', code: 'unknown' });
    expect(interpretResponse(200, undefined)).toEqual({ kind: 'form_error', code: 'unknown' });
    expect(interpretResponse(200, 'ok')).toEqual({ kind: 'form_error', code: 'unknown' });
    expect(interpretResponse(200, [1, 2])).toEqual({ kind: 'form_error', code: 'unknown' });
  });
});

describe('interpretResponse: field errors (422)', () => {
  it('maps a valid errors object to field_errors', () => {
    const result = interpretResponse(422, {
      ok: false,
      code: 'invalid',
      errors: { email: 'email_invalid' },
    });

    expect(result).toEqual({ kind: 'field_errors', errors: { email: 'email_invalid' } });
  });

  it('maps several valid field errors at once', () => {
    const result = interpretResponse(422, {
      errors: { email: 'email_required', phone: 'phone_invalid', message: 'too_long' },
    });

    expect(result).toEqual({
      kind: 'field_errors',
      errors: { email: 'email_required', phone: 'phone_invalid', message: 'too_long' },
    });
  });

  it('degrades to a form-level unknown error for an unrecognized field name, instead of dropping just that entry', () => {
    const result = interpretResponse(422, {
      errors: { email: 'email_invalid', notAField: 'too_long' },
    });

    expect(result).toEqual({ kind: 'form_error', code: 'unknown' });
  });

  it('degrades to a form-level unknown error for an unrecognized error code', () => {
    const result = interpretResponse(422, { errors: { email: 'made_up_code' } });

    expect(result).toEqual({ kind: 'form_error', code: 'unknown' });
  });

  it('degrades to unknown for an empty errors object', () => {
    expect(interpretResponse(422, { errors: {} })).toEqual({ kind: 'form_error', code: 'unknown' });
  });

  it('degrades to unknown when errors is missing or not an object', () => {
    expect(interpretResponse(422, {})).toEqual({ kind: 'form_error', code: 'unknown' });
    expect(interpretResponse(422, { errors: 'email_invalid' })).toEqual({
      kind: 'form_error',
      code: 'unknown',
    });
    expect(interpretResponse(422, { errors: ['email_invalid'] })).toEqual({
      kind: 'form_error',
      code: 'unknown',
    });
  });

  it('degrades to unknown for a non-JSON (unparsable) body', () => {
    expect(interpretResponse(422, null)).toEqual({ kind: 'form_error', code: 'unknown' });
    expect(interpretResponse(422, undefined)).toEqual({ kind: 'form_error', code: 'unknown' });
  });
});

describe('interpretResponse: deterministic form-level errors', () => {
  it('maps 400 to captcha_failed', () => {
    expect(interpretResponse(400, { ok: false, code: 'captcha_failed' })).toEqual({
      kind: 'form_error',
      code: 'captcha_failed',
    });
  });

  it('maps 503 to not_configured (mutation guard: never delivery_failed)', () => {
    expect(interpretResponse(503, { ok: false, code: 'not_configured' })).toEqual({
      kind: 'form_error',
      code: 'not_configured',
    });
  });

  it('maps 502 to delivery_failed', () => {
    expect(interpretResponse(502, { ok: false, code: 'delivery_failed' })).toEqual({
      kind: 'form_error',
      code: 'delivery_failed',
    });
  });

  it('trusts the status even when the body is missing or unparsable (non-JSON response)', () => {
    expect(interpretResponse(503, null)).toEqual({ kind: 'form_error', code: 'not_configured' });
    expect(interpretResponse(502, undefined)).toEqual({
      kind: 'form_error',
      code: 'delivery_failed',
    });
    expect(interpretResponse(400, 'not json')).toEqual({
      kind: 'form_error',
      code: 'captcha_failed',
    });
  });

  it('degrades to unknown when a body IS present and its own code contradicts the status', () => {
    expect(interpretResponse(503, { code: 'delivery_failed' })).toEqual({
      kind: 'form_error',
      code: 'unknown',
    });
  });

  it('degrades to unknown for any other status (405, 403, 413, 415, 500)', () => {
    [405, 403, 413, 415, 500].forEach((status) => {
      expect(interpretResponse(status, {})).toEqual({ kind: 'form_error', code: 'unknown' });
    });
  });
});

describe('firstInvalidField', () => {
  it('returns null when there are no errors', () => {
    expect(firstInvalidField({})).toBeNull();
  });

  it('returns the only field with an error', () => {
    expect(firstInvalidField({ phone: 'phone_invalid' })).toBe('phone');
  });

  it('picks the first field in document order (firstName, lastName, email, phone, message), not object key order', () => {
    expect(
      firstInvalidField({ message: 'too_long', email: 'email_invalid', firstName: 'too_long' }),
    ).toBe('firstName');
  });

  it('picks email before phone when both are invalid (mutation guard: reversed order would pick phone)', () => {
    expect(firstInvalidField({ phone: 'phone_invalid', email: 'email_invalid' })).toBe('email');
  });

  it('picks message last when it is the only remaining error', () => {
    expect(firstInvalidField({ message: 'too_long' })).toBe('message');
  });
});

describe('classifySubmitFailure', () => {
  it('maps a pre-fetch failure (script load, render, error/expired/timeout callbacks, our own token wait) to captcha_failed', () => {
    expect(classifySubmitFailure('pre-fetch')).toBe('captcha_failed');
  });

  it('maps a fetch failure (rejection or AbortSignal timeout) to unknown, the network message (mutation guard: never captcha_failed)', () => {
    expect(classifySubmitFailure('fetch')).toBe('unknown');
  });
});

describe('mapFormErrorMessage', () => {
  const messages: ContactFormMessages = {
    errors: { email_required: '', email_invalid: '', too_long: '', phone_invalid: '' },
    sending: 'sending-msg',
    success: 'success-msg',
    captchaFailed: 'captcha-failed-msg',
    notConfigured: 'not-configured-msg',
    deliveryFailed: 'delivery-failed-msg',
    network: 'network-msg',
    interactiveChallenge: 'interactive-msg',
  };

  it('maps captcha_failed to messages.captchaFailed', () => {
    expect(mapFormErrorMessage('captcha_failed', messages)).toBe('captcha-failed-msg');
  });

  it('maps not_configured to messages.notConfigured (mutation guard: never deliveryFailed)', () => {
    expect(mapFormErrorMessage('not_configured', messages)).toBe('not-configured-msg');
  });

  it('maps delivery_failed to messages.deliveryFailed (mutation guard: never notConfigured)', () => {
    expect(mapFormErrorMessage('delivery_failed', messages)).toBe('delivery-failed-msg');
  });

  it('maps unknown to messages.network', () => {
    expect(mapFormErrorMessage('unknown', messages)).toBe('network-msg');
  });
});
