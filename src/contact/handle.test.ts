import { describe, expect, it, vi } from 'vitest';
import { handleContactRequest } from './handle';
import type { CaptchaVerifier, ComposedEmail, EmailSender } from './types';

const siteName = 'Laury Herrera';
const validPayload = { email: 'ana@example.com' };

function fakeVerifier(result: boolean | Error = true) {
  const fn = vi.fn<CaptchaVerifier>();
  if (result instanceof Error) {
    fn.mockRejectedValue(result);
  } else {
    fn.mockResolvedValue(result);
  }
  return fn;
}

function fakeSender(result: 'ok' | Error = 'ok') {
  const fn = vi.fn<EmailSender>();
  if (result instanceof Error) {
    fn.mockRejectedValue(result);
  } else {
    fn.mockResolvedValue(undefined);
  }
  return fn;
}

describe('handleContactRequest — spam short-circuits with zero calls', () => {
  it('returns spam and calls neither the captcha verifier nor the sender', async () => {
    const verifyCaptcha = fakeVerifier();
    const sendEmail = fakeSender();

    const result = await handleContactRequest(
      { payload: { website: 'spam', email: 'ana@example.com' }, captchaToken: 'token' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'spam' });
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('handleContactRequest — invalid input short-circuits with zero calls', () => {
  it('returns the field errors and calls neither the captcha verifier nor the sender', async () => {
    const verifyCaptcha = fakeVerifier();
    const sendEmail = fakeSender();

    const result = await handleContactRequest(
      { payload: {}, captchaToken: 'token' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'invalid', errors: { email: 'email_required' } });
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('handleContactRequest — delivery not configured', () => {
  it('returns not_configured and calls nothing when verifyCaptcha is missing', async () => {
    const sendEmail = fakeSender();

    const result = await handleContactRequest(
      { payload: validPayload, captchaToken: 'token' },
      { sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'not_configured' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns not_configured and calls nothing when sendEmail is missing', async () => {
    const verifyCaptcha = fakeVerifier();

    const result = await handleContactRequest(
      { payload: validPayload, captchaToken: 'token' },
      { verifyCaptcha, siteName },
    );

    expect(result).toEqual({ kind: 'not_configured' });
    expect(verifyCaptcha).not.toHaveBeenCalled();
  });

  it('returns not_configured when both ports are missing', async () => {
    const result = await handleContactRequest(
      { payload: validPayload, captchaToken: 'token' },
      { siteName },
    );

    expect(result).toEqual({ kind: 'not_configured' });
  });
});

describe('handleContactRequest — validation runs before the not_configured check', () => {
  it('reports field errors, not not_configured, for an invalid payload with no ports configured at all', async () => {
    const result = await handleContactRequest(
      { payload: { phone: 'call me maybe' }, captchaToken: 'token' },
      { siteName },
    );

    expect(result).toEqual({
      kind: 'invalid',
      errors: { email: 'email_required', phone: 'phone_invalid' },
    });
  });
});

describe('handleContactRequest — captcha token presence', () => {
  it.each(['', 123, undefined] as const)(
    'skips the verifier and returns captcha_failed for a token of %j',
    async (captchaToken) => {
      const verifyCaptcha = fakeVerifier();
      const sendEmail = fakeSender();

      const result = await handleContactRequest(
        { payload: validPayload, captchaToken },
        { verifyCaptcha, sendEmail, siteName },
      );

      expect(result).toEqual({ kind: 'captcha_failed' });
      expect(verifyCaptcha).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    },
  );
});

describe('handleContactRequest — captcha verification outcome', () => {
  it('returns captcha_failed and does not send when the verifier resolves false', async () => {
    const verifyCaptcha = fakeVerifier(false);
    const sendEmail = fakeSender();

    const result = await handleContactRequest(
      { payload: validPayload, captchaToken: 'good-token' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'captcha_failed' });
    expect(verifyCaptcha).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns captcha_failed and does not send when the verifier rejects', async () => {
    const verifyCaptcha = fakeVerifier(new Error('turnstile down'));
    const sendEmail = fakeSender();

    const result = await handleContactRequest(
      { payload: validPayload, captchaToken: 'good-token' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'captcha_failed' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('handleContactRequest — a non-conforming verifier resolving a truthy non-boolean', () => {
  // `CaptchaVerifier` promises a `boolean`, but nothing at runtime enforces
  // that a real implementation honors it. Each fake below is built from
  // `JSON.parse`, whose result type is `any` and is therefore assignable to
  // the `Promise<boolean>` return position without an explicit `any`
  // annotation or an `as unknown as` cast — exactly the kind of value a
  // misbehaving verifier could hand back.
  function verifierResolvingParsed(json: string): CaptchaVerifier {
    return async () => JSON.parse(json);
  }

  const verifierResolvingUndefined: CaptchaVerifier = async () => JSON.parse('{}').missing;

  it.each([
    ['undefined', verifierResolvingUndefined],
    ['the string "false"', verifierResolvingParsed('"false"')],
    ['the number 1', verifierResolvingParsed('1')],
    ['an empty object', verifierResolvingParsed('{}')],
  ])(
    'returns captcha_failed and does not send when the verifier resolves %s',
    async (_label, verifyCaptcha) => {
      const sendEmail = fakeSender();

      const result = await handleContactRequest(
        { payload: validPayload, captchaToken: 'good-token' },
        { verifyCaptcha, sendEmail, siteName },
      );

      expect(result).toEqual({ kind: 'captcha_failed' });
      expect(sendEmail).not.toHaveBeenCalled();
    },
  );
});

describe('handleContactRequest — remoteIp forwarding', () => {
  it('calls the verifier with the token and remoteIp when remoteIp is defined', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();

    await handleContactRequest(
      { payload: validPayload, captchaToken: 'good-token', remoteIp: '203.0.113.5' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(verifyCaptcha).toHaveBeenCalledExactlyOnceWith('good-token', '203.0.113.5');
  });

  it('calls the verifier with only the token when remoteIp is not provided', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();

    await handleContactRequest(
      { payload: validPayload, captchaToken: 'good-token' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(verifyCaptcha).toHaveBeenCalledExactlyOnceWith('good-token');
  });
});

describe('handleContactRequest — delivery outcome', () => {
  it('returns delivery_failed when the sender rejects', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender(new Error('resend down'));

    const result = await handleContactRequest(
      { payload: validPayload, captchaToken: 'good-token' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'delivery_failed' });
  });

  it('returns sent and the sender receives exactly the email composeContactEmail would produce', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender('ok');

    const result = await handleContactRequest(
      { payload: { email: 'Ana@Example.com' }, captchaToken: 'good-token' },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'sent' });
    const expectedEmail: ComposedEmail = {
      subject: 'Nueva consulta desde Laury Herrera',
      text: 'E-mail: ana@example.com\n\nMensaje: (sin mensaje)',
      replyTo: 'ana@example.com',
    };
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expectedEmail);
  });
});

describe('handleContactRequest — no value echo', () => {
  it('never includes the submitted email or message anywhere in the result', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender('ok');

    const result = await handleContactRequest(
      {
        payload: { email: 'secret@example.com', message: 'this is secret content' },
        captchaToken: 'good-token',
      },
      { verifyCaptcha, sendEmail, siteName },
    );

    expect(result).toEqual({ kind: 'sent' });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('this is secret content');
  });
});
