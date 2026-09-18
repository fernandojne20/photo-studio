import { composeContactEmail } from './compose';
import type { CaptchaVerifier, EmailSender, FieldErrors } from './types';
import { validateContactSubmission } from './validate';

/**
 * Use case orchestrating validation, captcha verification, and delivery
 * through injected ports. Never throws, never echoes submitted values in
 * its result, and performs no logging. See
 * `odd/tasks/contact-conversion.md` for the exact step order.
 */

export type ContactRequestResult =
  | { kind: 'sent' }
  | { kind: 'invalid'; errors: FieldErrors }
  | { kind: 'spam' }
  | { kind: 'captcha_failed' }
  | { kind: 'not_configured' }
  | { kind: 'delivery_failed' };

export interface HandleContactRequestInput {
  payload: unknown;
  captchaToken: unknown;
  remoteIp?: string;
}

export interface HandleContactRequestDeps {
  verifyCaptcha?: CaptchaVerifier;
  sendEmail?: EmailSender;
  siteName: string;
}

export async function handleContactRequest(
  input: HandleContactRequestInput,
  deps: HandleContactRequestDeps,
): Promise<ContactRequestResult> {
  const validation = validateContactSubmission(input.payload);

  if (validation.kind === 'spam') {
    return { kind: 'spam' };
  }
  if (validation.kind === 'invalid') {
    return { kind: 'invalid', errors: validation.errors };
  }

  const { verifyCaptcha, sendEmail } = deps;
  if (!verifyCaptcha || !sendEmail) {
    return { kind: 'not_configured' };
  }

  if (typeof input.captchaToken !== 'string' || input.captchaToken === '') {
    return { kind: 'captcha_failed' };
  }

  let captchaOk: boolean;
  try {
    captchaOk =
      input.remoteIp === undefined
        ? await verifyCaptcha(input.captchaToken)
        : await verifyCaptcha(input.captchaToken, input.remoteIp);
  } catch {
    return { kind: 'captcha_failed' };
  }

  // Strict equality, not a truthiness check: this is a security boundary,
  // and a non-conforming verifier implementation could resolve a truthy
  // non-boolean (`"false"`, `1`, `{}`, ...) instead of the `boolean` its
  // type promises. Only an exact `true` counts as passing.
  if (captchaOk !== true) {
    return { kind: 'captcha_failed' };
  }

  const email = composeContactEmail(validation.submission, { siteName: deps.siteName });

  try {
    await sendEmail(email);
  } catch {
    return { kind: 'delivery_failed' };
  }

  return { kind: 'sent' };
}
