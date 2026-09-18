import { stripUnsafeCharacters } from './sanitize';
import type { ComposedEmail, ContactSubmission } from './types';

/**
 * Composes the plain-text email sent to the photographer for a validated
 * contact submission. `validate.ts` already sanitizes and normalizes its
 * output, but this function runs `stripUnsafeCharacters` on its own inputs
 * too (including `siteName`), as defense in depth: it stays safe against
 * header injection and invisible/spoofing characters even if called
 * directly with unnormalized data, bypassing `validate.ts` entirely. See
 * `odd/tasks/contact-conversion.md`.
 */

function sanitizeSingleLine(value: string): string {
  return stripUnsafeCharacters(value, { keepNewlines: false });
}

function sanitizeMessage(value: string): string {
  return stripUnsafeCharacters(value, { keepNewlines: true });
}

export function composeContactEmail(
  submission: ContactSubmission,
  context: { siteName: string },
): ComposedEmail {
  const firstName = sanitizeSingleLine(submission.firstName);
  const lastName = sanitizeSingleLine(submission.lastName);
  const email = sanitizeSingleLine(submission.email);
  const phone = sanitizeSingleLine(submission.phone);
  const message = sanitizeMessage(submission.message);
  const siteName = sanitizeSingleLine(context.siteName);

  const fullName = [firstName, lastName].filter((part) => part !== '').join(' ');

  const subject = fullName
    ? `Nueva consulta desde ${siteName} — ${fullName}`
    : `Nueva consulta desde ${siteName}`;

  const lines: string[] = [];
  if (fullName) lines.push(`Nombre: ${fullName}`);
  if (email) lines.push(`E-mail: ${email}`);
  if (phone) lines.push(`Teléfono: ${phone}`);

  const messageBlock = message ? `Mensaje:\n${message}` : 'Mensaje: (sin mensaje)';

  const text = [...lines, '', messageBlock].join('\n');

  return { subject, text, replyTo: email };
}
