import type { CaptchaVerifier } from '../types';

/**
 * `CaptchaVerifier` adapter for Cloudflare Turnstile, over `fetch`. See
 * `odd/tasks/contact-conversion.md` for the exact contract this implements.
 */

export interface TurnstileVerifierConfig {
  secretKey: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Defaults to 5000ms. */
  timeoutMs?: number;
}

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Creates a `CaptchaVerifier` that POSTs to the Turnstile siteverify
 * endpoint. Resolves `true` only when the HTTP response is 2xx and the
 * parsed JSON body has `success === true`; resolves `false` for every
 * other outcome, including a non-2xx status, a non-JSON body, a JSON body
 * without a boolean `success`, a network failure, and a timeout. Never
 * throws and never logs: a captcha verifier is a security boundary, and a
 * caller (`handleContactRequest`) must be able to treat "could not verify"
 * and "verification failed" identically.
 */
export function createTurnstileVerifier(config: TurnstileVerifierConfig): CaptchaVerifier {
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (token: string, remoteIp?: string): Promise<boolean> => {
    const body = new URLSearchParams();
    body.set('secret', config.secretKey);
    body.set('response', token);
    if (remoteIp !== undefined) {
      body.set('remoteip', remoteIp);
    }

    try {
      const response = await doFetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return false;
      }

      const data: unknown = await response.json();
      if (typeof data !== 'object' || data === null) {
        return false;
      }

      // Strict equality, not a truthiness check: this is a security
      // boundary (see `handle.ts`'s identical rule for the caller side).
      return (data as { success?: unknown }).success === true;
    } catch {
      return false;
    }
  };
}
