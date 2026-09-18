import { describe, expect, it, vi } from 'vitest';
import { createContactHandler } from './http';
import type { CaptchaVerifier, EmailSender } from './types';

const ENDPOINT = 'https://example.com/api/contact';
const siteName = 'Laury Herrera';

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

/**
 * Builds a JSON body string of exactly `targetBytes` UTF-8 bytes, by
 * padding the `message` field with ASCII filler (1 byte per character, so
 * the padding length maps 1:1 to bytes added). Used to pin the exact
 * `maxBodyBytes` boundary (`total > maxBytes`, not `>=`).
 */
function jsonBodyOfExactByteLength(targetBytes: number): string {
  const prefix = '{"email":"a@b.co","message":"';
  const suffix = '"}';
  const fixedBytes = new TextEncoder().encode(prefix + suffix).byteLength;
  const paddingLength = targetBytes - fixedBytes;
  if (paddingLength < 0) {
    throw new Error(
      `targetBytes (${targetBytes}) is smaller than the fixed overhead (${fixedBytes})`,
    );
  }
  return prefix + 'x'.repeat(paddingLength) + suffix;
}

function jsonRequest(body: unknown, init?: RequestInit): Request {
  return new Request(ENDPOINT, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function expectStandardHeaders(response: Response): void {
  for (const [name, value] of Object.entries(RESPONSE_HEADERS)) {
    expect(response.headers.get(name)).toBe(value);
  }
}

describe('createContactHandler — method guard', () => {
  it('answers 405 with an Allow: POST header for a GET request, and the standard headers', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(new Request(ENDPOINT, { method: 'GET' }));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expectStandardHeaders(response);
    expect(await response.json()).toEqual({ ok: false, code: 'method_not_allowed' });
  });

  it.each(['PUT', 'DELETE', 'PATCH'])('also answers 405 for %s', async (method) => {
    const handler = createContactHandler({ siteName });
    const response = await handler(new Request(ENDPOINT, { method }));
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});

describe('createContactHandler — same-origin check', () => {
  it('answers 403 forbidden_origin when Origin differs from the request URL origin', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      jsonRequest({ email: 'ana@example.com' }, { headers: { Origin: 'https://evil.example' } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: 'forbidden_origin' });
  });

  it('allows a matching Origin through to validation', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      jsonRequest({ email: 'ana@example.com' }, { headers: { Origin: 'https://example.com' } }),
    );

    // No captcha/sender configured, but validation passed, so this reaches
    // not_configured rather than forbidden_origin.
    expect(response.status).toBe(503);
  });

  it('allows a request with no Origin header through to validation', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(jsonRequest({ email: 'ana@example.com' }));
    expect(response.status).toBe(503);
  });

  it('answers 403 for the same host but a different scheme (http vs https)', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      jsonRequest({ email: 'ana@example.com' }, { headers: { Origin: 'http://example.com' } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: 'forbidden_origin' });
  });

  it('answers 403 for the same host and scheme but a different port', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      new Request('https://example.com:8443/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
        body: JSON.stringify({ email: 'ana@example.com' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: 'forbidden_origin' });
  });

  it('allows an explicit default port (443) against a request URL with no explicit port', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      jsonRequest({ email: 'ana@example.com' }, { headers: { Origin: 'https://example.com:443' } }),
    );

    // Same origin once the default port is normalized, so it reaches
    // validation/not_configured rather than forbidden_origin.
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(503);
  });
});

describe('createContactHandler — size guard', () => {
  it('answers 413 when Content-Length alone already exceeds the limit', async () => {
    const handler = createContactHandler({ siteName, maxBodyBytes: 100 });
    const response = await handler(
      jsonRequest({ email: 'ana@example.com' }, { headers: { 'Content-Length': '999999' } }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, code: 'too_large' });
  });

  it('answers 413 based on the bytes actually read, when a declared Content-Length disagrees with the real body (unit-test-only construction)', async () => {
    // This exercises `readBoundedBody`'s counted-read path, but note that
    // against a REAL HTTP transport this exact scenario cannot occur: a
    // `Content-Length` smaller than the real body is enforced by the
    // transport itself, before a `Request` even exists (verified directly
    // against a deployed Worker over a raw socket: the request never
    // reaches this handler at all, and the runtime answers `400
    // bad_request` on its own from the truncated body). Constructing a
    // `Request` in-process, as this test does, does not go through that
    // enforcement, so it is a useful way to exercise the byte-counting
    // logic itself, not a claim about what a real client can do. See the
    // "streamed body with no Content-Length" test below for the scenario
    // this logic actually defends against.
    const handler = createContactHandler({ siteName, maxBodyBytes: 100 });
    const bigBody = JSON.stringify({ email: 'ana@example.com', message: 'x'.repeat(5000) });
    const request = new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '10' },
      body: bigBody,
    });

    const response = await handler(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, code: 'too_large' });
  });

  it('answers 413 based on the bytes actually read for a streamed body with no Content-Length header', async () => {
    // The realistic motivation for the counted read: a chunked/streamed
    // body has no `Content-Length` at all, so the early header check
    // cannot run, and only counting the bytes as they arrive can enforce
    // the limit.
    const handler = createContactHandler({ siteName, maxBodyBytes: 100 });
    const bigBody = JSON.stringify({ email: 'ana@example.com', message: 'x'.repeat(5000) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bigBody));
        controller.close();
      },
    });
    const requestInit: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    };
    const request = new Request(ENDPOINT, requestInit);
    expect(request.headers.get('content-length')).toBeNull();

    const response = await handler(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, code: 'too_large' });
  });

  it('accepts a body under the limit', async () => {
    const handler = createContactHandler({ siteName, maxBodyBytes: 100 });
    const response = await handler(jsonRequest({ email: 'ana@example.com' }));
    expect(response.status).not.toBe(413);
  });

  it('accepts a body of exactly maxBodyBytes', async () => {
    const maxBodyBytes = 64;
    const handler = createContactHandler({ siteName, maxBodyBytes });
    const body = jsonBodyOfExactByteLength(maxBodyBytes);
    expect(new TextEncoder().encode(body).byteLength).toBe(maxBodyBytes);

    const response = await handler(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
    );

    expect(response.status).not.toBe(413);
  });

  it('rejects a body of exactly maxBodyBytes + 1 with 413', async () => {
    const maxBodyBytes = 64;
    const handler = createContactHandler({ siteName, maxBodyBytes });
    const body = jsonBodyOfExactByteLength(maxBodyBytes + 1);
    expect(new TextEncoder().encode(body).byteLength).toBe(maxBodyBytes + 1);

    const response = await handler(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, code: 'too_large' });
  });
});

describe('createContactHandler — content type handling', () => {
  it('answers 415 unsupported_media_type for an unsupported content type', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'email=ana@example.com',
      }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ ok: false, code: 'unsupported_media_type' });
  });

  it('answers 400 bad_request for malformed JSON', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, code: 'bad_request' });
  });

  it.each([
    ['a JSON string', '"just a string"'],
    ['a JSON number', '42'],
    ['a JSON boolean', 'true'],
    ['a JSON null', 'null'],
  ])('answers 400 bad_request for a non-object JSON value (%s)', async (_label, rawJson) => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawJson,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, code: 'bad_request' });
  });

  it('answers 400 bad_request for a top-level JSON array (a non-object value, same as a string/number/boolean/null)', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[1,2,3]',
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, code: 'bad_request' });
  });
});

describe('createContactHandler — JSON and form-encoded bodies produce the same use case input', () => {
  it('sends the identical composed email for equivalent JSON and urlencoded submissions', async () => {
    const verifyCaptchaJson = fakeVerifier(true);
    const sendEmailJson = fakeSender();
    const handlerJson = createContactHandler({
      siteName,
      verifyCaptcha: verifyCaptchaJson,
      sendEmail: sendEmailJson,
    });

    const jsonResponse = await handlerJson(
      jsonRequest({ email: 'Ana@Example.com', firstName: 'Ana', captchaToken: 'good-token' }),
    );
    expect(jsonResponse.status).toBe(200);

    const verifyCaptchaForm = fakeVerifier(true);
    const sendEmailForm = fakeSender();
    const handlerForm = createContactHandler({
      siteName,
      verifyCaptcha: verifyCaptchaForm,
      sendEmail: sendEmailForm,
    });

    const formBody = new URLSearchParams({
      email: 'Ana@Example.com',
      firstName: 'Ana',
      'cf-turnstile-response': 'good-token',
    });
    const formResponse = await handlerForm(
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      }),
    );
    expect(formResponse.status).toBe(200);

    expect(sendEmailForm).toHaveBeenCalledExactlyOnceWith(sendEmailJson.mock.calls[0]![0]);
  });

  it('reads the token from cf-turnstile-response for a multipart/form-data body', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    const formData = new FormData();
    formData.set('email', 'ana@example.com');
    formData.set('cf-turnstile-response', 'good-token');

    const response = await handler(new Request(ENDPOINT, { method: 'POST', body: formData }));

    expect(response.status).toBe(200);
    expect(verifyCaptcha).toHaveBeenCalledExactlyOnceWith('good-token');
  });
});

describe('createContactHandler — JSON captchaToken / cf-turnstile-response fallback', () => {
  it('reads the token from cf-turnstile-response when a JSON body has no captchaToken field', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    const response = await handler(
      jsonRequest({ email: 'ana@example.com', 'cf-turnstile-response': 'fallback-token' }),
    );

    expect(response.status).toBe(200);
    expect(verifyCaptcha).toHaveBeenCalledExactlyOnceWith('fallback-token');
  });

  it('prefers captchaToken over cf-turnstile-response when a JSON body sends both', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    const response = await handler(
      jsonRequest({
        email: 'ana@example.com',
        captchaToken: 'primary-token',
        'cf-turnstile-response': 'fallback-token',
      }),
    );

    expect(response.status).toBe(200);
    expect(verifyCaptcha).toHaveBeenCalledExactlyOnceWith('primary-token');
  });
});

describe('createContactHandler — remote IP forwarding', () => {
  it('forwards CF-Connecting-IP to the captcha verifier when present', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    await handler(
      jsonRequest(
        { email: 'ana@example.com', captchaToken: 'good-token' },
        { headers: { 'CF-Connecting-IP': '203.0.113.5' } },
      ),
    );

    expect(verifyCaptcha).toHaveBeenCalledExactlyOnceWith('good-token', '203.0.113.5');
  });

  it('calls the verifier with only the token when CF-Connecting-IP is absent', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    await handler(jsonRequest({ email: 'ana@example.com', captchaToken: 'good-token' }));

    expect(verifyCaptcha).toHaveBeenCalledExactlyOnceWith('good-token');
  });
});

describe('createContactHandler — result to status mapping', () => {
  it('maps invalid to 422 and never echoes the submitted (invalid) email', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(jsonRequest({ email: 'not-an-email' }));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toEqual({ ok: false, code: 'invalid', errors: { email: 'email_invalid' } });
    expect(JSON.stringify(body)).not.toContain('not-an-email');
  });

  it('maps captcha_failed to 400', async () => {
    const verifyCaptcha = fakeVerifier(false);
    const sendEmail = fakeSender();
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    const response = await handler(
      jsonRequest({ email: 'ana@example.com', captchaToken: 'bad-token' }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, code: 'captcha_failed' });
  });

  it('maps not_configured to 503 when no ports are configured', async () => {
    const handler = createContactHandler({ siteName });
    const response = await handler(jsonRequest({ email: 'ana@example.com' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: 'not_configured' });
  });

  it('maps delivery_failed to 502', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender(new Error('resend down'));
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    const response = await handler(
      jsonRequest({ email: 'ana@example.com', captchaToken: 'good-token' }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: 'delivery_failed' });
  });

  it('maps sent to 200 { ok: true }', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();
    const handler = createContactHandler({ siteName, verifyCaptcha, sendEmail });

    const response = await handler(
      jsonRequest({ email: 'ana@example.com', captchaToken: 'good-token' }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('createContactHandler — sent and spam are byte-identical', () => {
  it('produces the exact same status, headers, and body for a sent message and a honeypot hit', async () => {
    const verifyCaptcha = fakeVerifier(true);
    const sendEmail = fakeSender();
    const sentHandler = createContactHandler({ siteName, verifyCaptcha, sendEmail });
    const sentResponse = await sentHandler(
      jsonRequest({ email: 'ana@example.com', captchaToken: 'good-token' }),
    );

    const spamHandler = createContactHandler({ siteName, verifyCaptcha, sendEmail });
    const spamResponse = await spamHandler(
      jsonRequest({
        email: 'ana@example.com',
        website: 'https://spam.example',
        captchaToken: 'good-token',
      }),
    );

    expect(sentResponse.status).toBe(spamResponse.status);
    expect(await sentResponse.text()).toBe(await spamResponse.text());
    for (const name of Object.keys(RESPONSE_HEADERS)) {
      expect(sentResponse.headers.get(name)).toBe(spamResponse.headers.get(name));
    }
    // sendEmail must only have been called for the genuinely sent message.
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('createContactHandler — response headers', () => {
  it('sets Content-Type, Cache-Control, and X-Content-Type-Options on every response kind', async () => {
    const handler = createContactHandler({ siteName });
    const responses = await Promise.all([
      handler(new Request(ENDPOINT, { method: 'GET' })),
      handler(jsonRequest({ email: 'not-an-email' })),
      handler(jsonRequest({ email: 'ana@example.com' })),
    ]);

    for (const response of responses) {
      expectStandardHeaders(response);
    }
  });
});

describe('createContactHandler — never throws', () => {
  it('answers 500 { ok: false, code: internal } instead of throwing when reading the request itself fails unexpectedly', async () => {
    // `handleContactRequest` already guards its own ports (see `handle.ts`
    // and its tests), so this exercises the handler's own top-level guard
    // instead: a request whose `method` getter throws, simulating any
    // unexpected failure reading the incoming `Request` before the use
    // case is ever reached.
    const hostileRequest = {
      get method(): string {
        throw new Error('boom');
      },
    } as unknown as Request;

    const handler = createContactHandler({ siteName });
    const response = await handler(hostileRequest);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, code: 'internal' });
    expectStandardHeaders(response);
  });
});
