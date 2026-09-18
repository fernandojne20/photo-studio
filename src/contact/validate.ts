import { stripUnsafeCharacters } from './sanitize';
import type { ContactErrorCode, ContactFieldName, ContactSubmission, FieldErrors } from './types';

/**
 * Validates and normalizes an unknown contact-form payload into a
 * `ContactSubmission`, or reports why it cannot be sent. Pure function: no
 * environment access, never throws. See `odd/tasks/contact-conversion.md`
 * for the limits and rules this implements.
 */

export type ContactValidationResult =
  | { kind: 'valid'; submission: ContactSubmission }
  | { kind: 'invalid'; errors: FieldErrors }
  | { kind: 'spam' };

const NAME_LIMIT = 80;
const PHONE_LIMIT = 30;
// Measured in UTF-16 code units (`.length`), same as every other limit
// here: an emoji or other astral-plane character counts as two. No
// behavior change is intended by this note.
const MESSAGE_LIMIT = 2000;
const EMAIL_LIMIT = 254;

const PHONE_CHARSET = /^[0-9 +\-().]+$/;
const MIN_PHONE_DIGITS = 6;

/**
 * Reads a string field from an unknown value; anything else — including a
 * missing field, a non-string value, or a property access that throws
 * (e.g. a hostile getter) — becomes `''`. Never throws.
 */
function readField(input: unknown, key: string): string {
  if (typeof input !== 'object' || input === null) return '';
  try {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

/**
 * Strips unsafe/invisible characters, then trims and collapses internal
 * whitespace runs to a single space.
 */
function normalizeSingleLine(value: string): string {
  const safe = stripUnsafeCharacters(value, { keepNewlines: false });
  return safe.replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes line endings to `\n`, strips unsafe/invisible characters
 * (keeping `\n`), trims, then collapses runs of 3+ newlines to 2 (in that
 * order, per the task document).
 */
function normalizeMessage(value: string): string {
  const normalizedLineEndings = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const safe = stripUnsafeCharacters(normalizedLineEndings, { keepNewlines: true });
  const trimmed = safe.trim();
  return trimmed.replace(/\n{3,}/g, '\n\n');
}

/**
 * Strict, allowlist-based email format check (not full RFC 5321/5322
 * validation, but stricter than a loose "looks like an email" check: this
 * value becomes `replyTo`, so it must always resolve to exactly one bare
 * address, with no room for a quoted/bracketed/IP-literal form or a
 * trailing recipient list to smuggle something else through).
 *
 * - Local part: only `a-z 0-9` and `` . ! # $ % & ' * + / = ? ^ _ ` { | }
 *   ~ - ``; 1 to 64 characters; no leading, trailing, or consecutive dots.
 * - Domain: labels of `a-z 0-9 -`, each 1 to 63 characters, no leading or
 *   trailing hyphen; at least two labels; the last label (the TLD) is at
 *   least two letters.
 * - IP literals (`[192.168.1.1]`), quoted local parts, angle brackets,
 *   commas, and semicolons are all rejected by construction: none of
 *   those characters are in either allowed character set above.
 * - Internationalized (non-ASCII) domains are deliberately rejected here:
 *   the allowed character sets are ASCII-only, so e.g. `café.com` is
 *   invalid. Only its ASCII punycode form (`xn--caf-dma.com`) is
 *   accepted. `email` is already lowercased by the caller before this
 *   check runs.
 */
const LOCAL_PART_CHARS = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL_CHARS = /^[a-z0-9-]{1,63}$/;
const LAST_LABEL_LETTERS = /^[a-z]{2,}$/;

function isValidLocalPart(localPart: string): boolean {
  if (localPart.length < 1 || localPart.length > 64) return false;
  return localPart.split('.').every((segment) => segment !== '' && LOCAL_PART_CHARS.test(segment));
}

function isValidDomain(domain: string): boolean {
  const labels = domain.split('.');
  if (labels.length < 2) return false;

  const everyLabelValid = labels.every(
    (label) => DOMAIN_LABEL_CHARS.test(label) && !label.startsWith('-') && !label.endsWith('-'),
  );
  if (!everyLabelValid) return false;

  return LAST_LABEL_LETTERS.test(labels[labels.length - 1]);
}

function isValidEmailFormat(email: string): boolean {
  const atCount = (email.match(/@/g) ?? []).length;
  if (atCount !== 1) return false;

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return false;

  return isValidLocalPart(localPart) && isValidDomain(domain);
}

/** Only digits, spaces, `+`, `-`, `(`, `)`, `.`, with at least 6 digits. */
function isValidPhone(phone: string): boolean {
  if (!PHONE_CHARSET.test(phone)) return false;
  const digitCount = (phone.match(/\d/g) ?? []).length;
  return digitCount >= MIN_PHONE_DIGITS;
}

function setError(errors: FieldErrors, field: ContactFieldName, code: ContactErrorCode): void {
  errors[field] = code;
}

export function validateContactSubmission(input: unknown): ContactValidationResult {
  // Honeypot: checked before anything else, regardless of how invalid the
  // rest of the payload is. A bot that fills this field learns nothing.
  const website = readField(input, 'website');
  if (website.trim() !== '') {
    return { kind: 'spam' };
  }

  const errors: FieldErrors = {};

  const firstName = normalizeSingleLine(readField(input, 'firstName'));
  if (firstName.length > NAME_LIMIT) setError(errors, 'firstName', 'too_long');

  const lastName = normalizeSingleLine(readField(input, 'lastName'));
  if (lastName.length > NAME_LIMIT) setError(errors, 'lastName', 'too_long');

  const email = normalizeSingleLine(readField(input, 'email')).toLowerCase();
  if (email === '') {
    setError(errors, 'email', 'email_required');
  } else if (email.length > EMAIL_LIMIT) {
    setError(errors, 'email', 'too_long');
  } else if (!isValidEmailFormat(email)) {
    setError(errors, 'email', 'email_invalid');
  }

  const phone = normalizeSingleLine(readField(input, 'phone'));
  if (phone.length > PHONE_LIMIT) {
    setError(errors, 'phone', 'too_long');
  } else if (phone !== '' && !isValidPhone(phone)) {
    setError(errors, 'phone', 'phone_invalid');
  }

  const message = normalizeMessage(readField(input, 'message'));
  if (message.length > MESSAGE_LIMIT) setError(errors, 'message', 'too_long');

  if (Object.keys(errors).length > 0) {
    return { kind: 'invalid', errors };
  }

  return { kind: 'valid', submission: { firstName, lastName, email, phone, message } };
}
