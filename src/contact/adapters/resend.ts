import type { ComposedEmail, EmailSender } from '../types';

/**
 * `EmailSender` adapter for Resend, over `fetch` (the `resend` SDK is not
 * installed: it drags a React email peer and is unnecessary on Workers, see
 * `odd/tasks/contact-conversion.md`).
 */

export interface ResendSenderConfig {
  apiKey: string;
  from: string;
  to: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Defaults to 8000ms. */
  timeoutMs?: number;
}

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Creates an `EmailSender` that POSTs to the Resend `/emails` endpoint.
 * Resolves on a 2xx response; rejects on every other outcome (non-2xx
 * status, network failure, timeout) with an `Error` whose message never
 * contains the response body, the API key, or any submitted value — only
 * the HTTP status, or the word `timeout`/`network`. Never logs.
 */
export function createResendSender(config: ResendSenderConfig): EmailSender {
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (email: ComposedEmail): Promise<void> => {
    let response: Response;
    try {
      response = await doFetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.from,
          to: [config.to],
          subject: email.subject,
          text: email.text,
          reply_to: email.replyTo,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Never surface the underlying error (which could describe the
      // request in ways that leak the target host, headers, etc.): only
      // the two known shapes of a failed `fetch` are distinguished here.
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      // `cause` is not read by any caller (`handle.ts` discards the whole
      // error on a rejected `sendEmail`) and is never logged; it is kept
      // only so this rethrow does not silently drop the original error.
      throw new Error(isTimeout ? 'timeout' : 'network', { cause: error });
    }

    if (!response.ok) {
      // Only the HTTP status is included; the response body is never read
      // (so it can never end up in this message, or anywhere else).
      throw new Error(`Resend request failed with status ${response.status}`);
    }
  };
}
