import type { ContactErrorCode, ContactFieldName } from '../contact/types';

/**
 * Pure decision logic for `src/scripts/contact-form.ts`, kept free of any
 * DOM access so it can be unit-tested in Node (see `src/lib/lightbox-options.ts`
 * for the same pattern in this project). Responsibilities:
 *
 * - `buildContactPayload`: the JSON body the server expects from plain
 *   field values plus a captcha token.
 * - `interpretResponse`: turns an HTTP status and a parsed (or unparsable)
 *   response body into a closed result the script can switch over,
 *   defensive against a non-JSON body, an unexpected status, and an
 *   unknown field name or error code in a `422` body.
 * - `firstInvalidField`: which field to move focus to first, in document
 *   order, given a set of field errors.
 * - `classifySubmitFailure`: which Spanish message a thrown/rejected submit
 *   attempt needs, depending on whether it failed before or during the
 *   `fetch` call.
 * - `mapFormErrorMessage`: the Spanish message for a given form-level
 *   result code.
 */

export interface ContactFormFieldValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  /**
   * Honeypot value. The JSON key sent to the server is `website` (the key
   * `src/contact/validate.ts` reads — that server contract does not
   * change), but the DOM input it is read from is deliberately named and
   * labelled something else entirely (`topic_ref` / "Referencia interna",
   * see `Contact.astro` and `readFieldValues` in
   * `src/scripts/contact-form.ts`). A bait field literally named/labelled
   * "website" is a documented false-positive source: password managers and
   * browser autofill have been observed filling exactly that field in a
   * published honeypot library. Do not rename this property back to
   * something that also renames the DOM field to match it.
   */
  website: string;
}

/** Document order of the form's fields, used both for payload shape and focus order. */
export const CONTACT_FIELD_ORDER: readonly ContactFieldName[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'message',
];

const CONTACT_FIELD_NAMES: ReadonlySet<string> = new Set(CONTACT_FIELD_ORDER);

const CONTACT_ERROR_CODES: ReadonlySet<string> = new Set<ContactErrorCode>([
  'email_required',
  'email_invalid',
  'too_long',
  'phone_invalid',
]);

/** Builds the JSON payload `POST /api/contact` expects (see `src/contact/http.ts`). */
export function buildContactPayload(
  fields: ContactFormFieldValues,
  captchaToken: string,
): Record<string, unknown> {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    message: fields.message,
    website: fields.website,
    captchaToken,
  };
}

export type ContactFormErrors = Partial<Record<ContactFieldName, ContactErrorCode>>;

export type ContactResponseOutcome =
  | { kind: 'success' }
  | { kind: 'field_errors'; errors: ContactFormErrors }
  | {
      kind: 'form_error';
      code: 'captcha_failed' | 'not_configured' | 'delivery_failed' | 'unknown';
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function interpretSuccess(body: unknown): ContactResponseOutcome {
  // Deliberately `=== true`, not a truthiness check: a 200 with a missing,
  // falsy, or malformed `ok` is not a confirmed send (mirrors the same
  // strict-boolean rule `src/contact/handle.ts` applies to the captcha
  // verifier's result).
  if (isRecord(body) && body.ok === true) {
    return { kind: 'success' };
  }
  return { kind: 'form_error', code: 'unknown' };
}

function interpretFieldErrors(body: unknown): ContactResponseOutcome {
  if (!isRecord(body) || !isRecord(body.errors)) {
    return { kind: 'form_error', code: 'unknown' };
  }

  const entries = Object.entries(body.errors);
  if (entries.length === 0) {
    return { kind: 'form_error', code: 'unknown' };
  }

  const errors: ContactFormErrors = {};
  for (const [field, code] of entries) {
    // An unrecognized field name or error code anywhere in the payload
    // degrades the WHOLE response to a form-level error, never to a
    // partial result that silently drops the field it does not
    // understand (which could read to the visitor as "no errors", i.e. a
    // silent success).
    if (
      !CONTACT_FIELD_NAMES.has(field) ||
      typeof code !== 'string' ||
      !CONTACT_ERROR_CODES.has(code)
    ) {
      return { kind: 'form_error', code: 'unknown' };
    }
    errors[field as ContactFieldName] = code as ContactErrorCode;
  }

  return { kind: 'field_errors', errors };
}

const FORM_ERROR_STATUS_CODES: Readonly<
  Record<number, 'captcha_failed' | 'not_configured' | 'delivery_failed'>
> = {
  400: 'captcha_failed',
  503: 'not_configured',
  502: 'delivery_failed',
};

function interpretFormError(status: number, body: unknown): ContactResponseOutcome {
  const expectedCode = FORM_ERROR_STATUS_CODES[status];
  if (!expectedCode) {
    return { kind: 'form_error', code: 'unknown' };
  }
  // Defense in depth: the status alone is what `src/contact/http.ts`
  // guarantees for these three codes, so a missing or unparsable body
  // still resolves correctly. But if a body IS present and its own `code`
  // contradicts what this status means, that is a body this contract does
  // not recognize, so it degrades to `unknown` rather than trusting either
  // side blindly.
  const bodyCode = isRecord(body) && typeof body.code === 'string' ? body.code : undefined;
  if (bodyCode !== undefined && bodyCode !== expectedCode) {
    return { kind: 'form_error', code: 'unknown' };
  }
  return { kind: 'form_error', code: expectedCode };
}

/**
 * Maps an HTTP response (status plus an already-parsed body, or whatever a
 * failed `response.json()` produced) to a closed outcome. Never throws.
 */
export function interpretResponse(status: number, body: unknown): ContactResponseOutcome {
  if (status === 200) return interpretSuccess(body);
  if (status === 422) return interpretFieldErrors(body);
  return interpretFormError(status, body);
}

/**
 * The first field (in document order) that has an error, or `null` when
 * there are none. Pure decision only: the caller does the actual focusing.
 */
export function firstInvalidField(errors: ContactFormErrors): ContactFieldName | null {
  for (const field of CONTACT_FIELD_ORDER) {
    if (errors[field]) return field;
  }
  return null;
}

/**
 * Where a submit attempt failed, relative to the `fetch` call:
 * `'pre-fetch'` covers everything that can throw before the request is
 * ever sent (the Turnstile script failing to load, `render` throwing,
 * `error-callback`/`expired-callback`/Turnstile's own `timeout-callback`
 * rejecting, or our own token-wait timing out); `'fetch'` covers the
 * `fetch` call itself rejecting or its `AbortSignal.timeout` firing.
 */
export type SubmitFailureStage = 'pre-fetch' | 'fetch';

/**
 * Maps a submit failure to the right form-level code: a `'pre-fetch'`
 * failure is a captcha problem (retrying will not fix a genuinely blocked
 * or failed script, but it is not a network problem either), while a
 * `'fetch'` failure is a real network/timeout problem. Keeping this a pure
 * mapping, instead of two near-identical inline `catch` blocks, is what
 * makes it possible to unit-test and to catch a mutation that mixes the two
 * up.
 */
export function classifySubmitFailure(stage: SubmitFailureStage): 'captcha_failed' | 'unknown' {
  return stage === 'pre-fetch' ? 'captcha_failed' : 'unknown';
}

/** Every visitor-facing string the client script needs, read once from
 * `site.ts` in `Contact.astro` and handed to the browser as the form's
 * `data-messages` JSON attribute (see the language contract in
 * `odd/tasks/contact-conversion.md`). */
export interface ContactFormMessages {
  errors: Record<ContactErrorCode, string>;
  sending: string;
  success: string;
  captchaFailed: string;
  notConfigured: string;
  deliveryFailed: string;
  network: string;
  interactiveChallenge: string;
}

/** The Spanish message for a given form-level result code. */
export function mapFormErrorMessage(
  code: 'captcha_failed' | 'not_configured' | 'delivery_failed' | 'unknown',
  messages: ContactFormMessages,
): string {
  switch (code) {
    case 'captcha_failed':
      return messages.captchaFailed;
    case 'not_configured':
      return messages.notConfigured;
    case 'delivery_failed':
      return messages.deliveryFailed;
    case 'unknown':
      return messages.network;
  }
}
