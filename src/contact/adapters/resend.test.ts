import { describe, expect, it, vi } from 'vitest';
import type { ComposedEmail } from '../types';
import { createResendSender } from './resend';

const RESEND_URL = 'https://api.resend.com/emails';

const email: ComposedEmail = {
  subject: 'Nueva consulta desde Laury Herrera — Ana Gómez',
  text: 'Nombre: Ana Gómez\nE-mail: ana@example.com\n\nMensaje: Hola!',
  replyTo: 'ana@example.com',
};

function fakeFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  return vi.fn(implementation) as unknown as typeof fetch;
}

describe('createResendSender — request shape', () => {
  it('POSTs the exact URL, method, headers, and JSON body', async () => {
    const fetchFn = fakeFetch(async () => new Response(null, { status: 200 }));
    const send = createResendSender({
      apiKey: 'secret-key',
      from: 'studio@example.com',
      to: 'photographer@example.com',
      fetch: fetchFn,
    });

    await send(email);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer secret-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'studio@example.com',
      to: ['photographer@example.com'],
      subject: email.subject,
      text: email.text,
      reply_to: email.replyTo,
    });
  });
});

describe('createResendSender — timeout configuration', () => {
  // `toBeInstanceOf(AbortSignal)` (removed above) can never fail: every
  // `AbortSignal` value satisfies it, including one built with the wrong
  // timeout, or no timeout at all. Asserting on the exact argument passed
  // to `AbortSignal.timeout` is what actually pins the configured value.
  it('passes the default timeout (8000ms) to AbortSignal.timeout when none is configured', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const fetchFn = fakeFetch(async () => new Response(null, { status: 200 }));
    const send = createResendSender({
      apiKey: 'k',
      from: 'a@example.com',
      to: 'b@example.com',
      fetch: fetchFn,
    });

    await send(email);

    expect(timeoutSpy).toHaveBeenCalledWith(8000);
    timeoutSpy.mockRestore();
  });

  it('passes the configured timeout to AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const fetchFn = fakeFetch(async () => new Response(null, { status: 200 }));
    const send = createResendSender({
      apiKey: 'k',
      from: 'a@example.com',
      to: 'b@example.com',
      fetch: fetchFn,
      timeoutMs: 4321,
    });

    await send(email);

    expect(timeoutSpy).toHaveBeenCalledWith(4321);
    timeoutSpy.mockRestore();
  });
});

describe('createResendSender — success', () => {
  it('resolves for every 2xx status', async () => {
    for (const status of [200, 201, 202, 204]) {
      const fetchFn = fakeFetch(async () => new Response(null, { status }));
      const send = createResendSender({
        apiKey: 'k',
        from: 'a@example.com',
        to: 'b@example.com',
        fetch: fetchFn,
      });
      await expect(send(email)).resolves.toBeUndefined();
    }
  });
});

describe('createResendSender — failure modes', () => {
  it('rejects with a message containing only the status for a non-2xx response', async () => {
    const fetchFn = fakeFetch(
      async () =>
        new Response('{"message":"invalid `from` field","secret":"do-not-leak"}', { status: 422 }),
    );
    const send = createResendSender({
      apiKey: 'super-secret-key',
      from: 'a@example.com',
      to: 'b@example.com',
      fetch: fetchFn,
    });

    await expect(send(email)).rejects.toThrow('Resend request failed with status 422');
  });

  it('never includes the response body, the API key, or a submitted value in the rejection message', async () => {
    const fetchFn = fakeFetch(
      async () =>
        new Response('{"message":"do-not-leak-this-body","email":"ana@example.com"}', {
          status: 500,
        }),
    );
    const send = createResendSender({
      apiKey: 'super-secret-key',
      from: 'a@example.com',
      to: 'b@example.com',
      fetch: fetchFn,
    });

    await expect(send(email)).rejects.toSatisfy((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return (
        !message.includes('do-not-leak-this-body') &&
        !message.includes('super-secret-key') &&
        !message.includes('ana@example.com') &&
        !message.includes(email.text)
      );
    });
  });

  it('rejects with "network" for a network error, without leaking the underlying error message', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new TypeError('fetch failed: getaddrinfo ENOTFOUND api.resend.com');
    });
    const send = createResendSender({
      apiKey: 'k',
      from: 'a@example.com',
      to: 'b@example.com',
      fetch: fetchFn,
    });

    await expect(send(email)).rejects.toThrow('network');
  });

  it('rejects with "timeout" for a timeout (AbortSignal.timeout firing), without sleeping', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const send = createResendSender({
      apiKey: 'k',
      from: 'a@example.com',
      to: 'b@example.com',
      fetch: fetchFn,
      timeoutMs: 1,
    });

    await expect(send(email)).rejects.toThrow('timeout');
  });

  it('never reads the response body on a failure, so it cannot leak it even indirectly', async () => {
    const response = new Response('{"leak":"me"}', { status: 500 });
    const textSpy = vi.spyOn(response, 'text');
    const jsonSpy = vi.spyOn(response, 'json');
    const fetchFn = fakeFetch(async () => response);
    const send = createResendSender({
      apiKey: 'k',
      from: 'a@example.com',
      to: 'b@example.com',
      fetch: fetchFn,
    });

    await expect(send(email)).rejects.toThrow();
    expect(textSpy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
  });
});
