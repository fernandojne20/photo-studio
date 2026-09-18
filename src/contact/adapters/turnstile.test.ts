import { describe, expect, it, vi } from 'vitest';
import { createTurnstileVerifier } from './turnstile';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function fakeFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  return vi.fn(implementation) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createTurnstileVerifier — request shape', () => {
  it('POSTs the exact URL, method, headers, and form-encoded body, without remoteip when not given', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(200, { success: true }));
    const verify = createTurnstileVerifier({ secretKey: 'sekret', fetch: fetchFn });

    await verify('the-token');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(VERIFY_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(init.body).toBe('secret=sekret&response=the-token');
  });

  it('includes remoteip in the body only when given', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(200, { success: true }));
    const verify = createTurnstileVerifier({ secretKey: 'sekret', fetch: fetchFn });

    await verify('the-token', '203.0.113.5');

    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('secret=sekret&response=the-token&remoteip=203.0.113.5');
  });
});

describe('createTurnstileVerifier — timeout configuration', () => {
  // `toBeInstanceOf(AbortSignal)` (removed above) can never fail: every
  // `AbortSignal` value satisfies it, including one built with the wrong
  // timeout, or no timeout at all. Asserting on the exact argument passed
  // to `AbortSignal.timeout` is what actually pins the configured value.
  it('passes the default timeout (5000ms) to AbortSignal.timeout when none is configured', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const fetchFn = fakeFetch(async () => jsonResponse(200, { success: true }));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });

    await verify('token');

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    timeoutSpy.mockRestore();
  });

  it('passes the configured timeout to AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const fetchFn = fakeFetch(async () => jsonResponse(200, { success: true }));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn, timeoutMs: 1234 });

    await verify('token');

    expect(timeoutSpy).toHaveBeenCalledWith(1234);
    timeoutSpy.mockRestore();
  });
});

describe('createTurnstileVerifier — success', () => {
  it('resolves true for a 2xx response with success: true', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(200, { success: true }));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });

    await expect(verify('token')).resolves.toBe(true);
  });
});

describe('createTurnstileVerifier — failure modes all resolve false', () => {
  it('resolves false for success: false', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(200, { success: false }));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });

  it('resolves false for a non-boolean success value', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(200, { success: 'true' }));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });

  it('resolves false for a JSON body missing success entirely', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(200, {}));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });

  it('resolves false for a non-2xx status even with success: true in the body', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(400, { success: true }));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });

  it('resolves false for a non-JSON body', async () => {
    const fetchFn = fakeFetch(
      async () =>
        new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });

  it('resolves false for a JSON array body', async () => {
    const fetchFn = fakeFetch(async () => jsonResponse(200, [1, 2, 3]));
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });

  it('resolves false for a network error', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new TypeError('fetch failed');
    });
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });

  it('resolves false for a timeout (AbortSignal.timeout firing)', async () => {
    const fetchFn = fakeFetch(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn, timeoutMs: 1 });
    await expect(verify('token')).resolves.toBe(false);
  });
});

describe('createTurnstileVerifier — never throws', () => {
  it('resolves false instead of throwing when response.json() itself throws', async () => {
    const fetchFn = fakeFetch(async () => {
      const response = new Response('{"success": true}', { status: 200 });
      // Simulate a body that cannot be read twice / a hostile response.
      Object.defineProperty(response, 'json', {
        value: () => {
          throw new Error('boom');
        },
      });
      return response;
    });
    const verify = createTurnstileVerifier({ secretKey: 's', fetch: fetchFn });
    await expect(verify('token')).resolves.toBe(false);
  });
});
