/**
 * Domain types and ports for the contact form (`contact-conversion`).
 *
 * Pure types only: no environment access, no framework imports. The domain
 * speaks in error codes, never in human language; the Spanish copy that
 * accompanies each code lives in `src/config/site.ts` (see
 * `odd/tasks/contact-conversion.md`).
 */

/** Normalized, validated submission ready to be composed into an email. */
export interface ContactSubmission {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
}

export type ContactFieldName = 'firstName' | 'lastName' | 'email' | 'phone' | 'message';

export type ContactErrorCode = 'email_required' | 'email_invalid' | 'too_long' | 'phone_invalid';

/** At most one error code per field; fields without an entry are valid. */
export type FieldErrors = Partial<Record<ContactFieldName, ContactErrorCode>>;

/** Plain-text email ready to be handed to an `EmailSender`. */
export interface ComposedEmail {
  subject: string;
  text: string;
  replyTo: string;
}

/**
 * Verifies a captcha token (e.g. Cloudflare Turnstile). `remoteIp` is passed
 * through only when the caller has one available. Resolves to whether the
 * token is valid; a network/provider failure should reject the promise
 * rather than resolve `false`, though callers must treat both the same way.
 */
export type CaptchaVerifier = (token: string, remoteIp?: string) => Promise<boolean>;

/** Delivers a composed email. Rejects on failure; never resolves with a status. */
export type EmailSender = (email: ComposedEmail) => Promise<void>;
