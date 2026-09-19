import {
  CONTACT_FROM_EMAIL,
  CONTACT_TO_EMAIL,
  RESEND_API_KEY,
  TURNSTILE_SECRET_KEY,
} from 'astro:env/server';
import type { APIRoute } from 'astro';
import { createResendSender } from '../../contact/adapters/resend';
import { createTurnstileVerifier } from '../../contact/adapters/turnstile';
import { createContactHandler } from '../../contact/http';
import { site } from '../../config/site';

/**
 * The only on-demand route in an otherwise static site (see
 * `astro.config.mjs` and `odd/tasks/contact-conversion.md`). Kept as thin
 * as possible on purpose: `astro:env/server` is a virtual module, so this
 * file cannot be unit-tested. All the real logic lives in
 * `src/contact/http.ts` and is tested there against the standard
 * `Request`/`Response`.
 */
export const prerender = false;

// Each port is only built when every value it needs is a non-empty string;
// otherwise it stays `undefined` and `handleContactRequest` reports
// `not_configured` (see `src/contact/handle.ts`). No secret, key, or
// address is logged here or anywhere downstream.
const verifyCaptcha =
  typeof TURNSTILE_SECRET_KEY === 'string' && TURNSTILE_SECRET_KEY !== ''
    ? createTurnstileVerifier({ secretKey: TURNSTILE_SECRET_KEY })
    : undefined;

const sendEmail =
  typeof RESEND_API_KEY === 'string' &&
  RESEND_API_KEY !== '' &&
  typeof CONTACT_FROM_EMAIL === 'string' &&
  CONTACT_FROM_EMAIL !== '' &&
  typeof CONTACT_TO_EMAIL === 'string' &&
  CONTACT_TO_EMAIL !== ''
    ? createResendSender({ apiKey: RESEND_API_KEY, from: CONTACT_FROM_EMAIL, to: CONTACT_TO_EMAIL })
    : undefined;

const handleContactHttpRequest = createContactHandler({
  siteName: site.name,
  ...(verifyCaptcha ? { verifyCaptcha } : {}),
  ...(sendEmail ? { sendEmail } : {}),
});

export const POST: APIRoute = ({ request }) => handleContactHttpRequest(request);

// Astro dispatches to the export matching the method first, falling back
// to `ALL` for everything else; without this, a non-POST request would
// get Astro's own 404 instead of the 405 (with `Allow: POST`) that
// `handleContactHttpRequest` produces.
export const ALL: APIRoute = ({ request }) => handleContactHttpRequest(request);
