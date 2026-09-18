# Feature: contact-conversion

Module ID: `contact-conversion` (see `CAPABILITY-MAP.md`). Depends on `studio-page`. Runs in parallel with `media-interactions`; both feed `production-delivery`.

## Objective

Turn the static contact section into a working fallback conversion path: a validated, spam-protected form that delivers the enquiry by email from the server, with clear success and error states, next to the primary WhatsApp path that already exists.

## Problem and why

The primary conversion is a WhatsApp conversation, but some visitors will not use WhatsApp. The contact form is today static markup with an inert button. It needs validation, protection against automated spam, server-side delivery to the photographer, and honest feedback to the visitor, without turning the static site into a server-rendered one.

## Scope

In scope:

- Pure domain logic with unit tests: validation and normalization of a submission, honeypot detection, plain-text email composition safe against header injection, and a use case that orchestrates captcha verification and delivery through injected ports.
- Server side: one on-demand endpoint (`POST /api/contact`) on Cloudflare through the Astro adapter, with adapters for Cloudflare Turnstile verification and Resend delivery over `fetch`, typed environment configuration, and safe behavior when delivery is not configured.
- Client side: the form markup completed (names, `autocomplete`, required marker, honeypot, Turnstile container, live status region), a script that loads Turnstile lazily, submits with `fetch`, shows Spanish success and error states, manages focus, and a `<noscript>` message that points to WhatsApp and email.
- Review of the WhatsApp entry points (hero, header, biography) for consistent deep links.

Out of scope: appointment scheduling, CRM or storage of enquiries, rate limiting beyond Turnstile and the honeypot (needs a KV or Durable Object binding), HTML email templates, analytics events and the deploy workflow (`production-delivery`), buying the domain and creating the Resend and Cloudflare accounts (user).

## Constraints and decisions

- The user has no Resend account yet; mail will be sent from a custom domain that will also host the site (decision on 2026-09-18). Everything is configuration-driven: `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`, `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`. Real end-to-end delivery is verified later, once the domain is verified in Resend.
- Development and tests use Cloudflare's official Turnstile test keys. When delivery is not configured the endpoint answers `503` with the code `not_configured` and the form tells the visitor to use WhatsApp or email; it never pretends to have sent anything.
- Hosting: `@astrojs/cloudflare@14` (Astro `^7.2`, Wrangler `^4.125`, verified 2026-09-18). The site stays `output: 'static'`; only `/api/contact` sets `export const prerender = false`. Secrets are optional in the `astro:env` schema so builds and CI never need them.
- Resend is called through its REST API with `fetch`; the `resend` SDK is not installed (it drags a React email peer and is unnecessary on Workers).
- Hexagonal boundary: `src/contact/` holds the domain and the use case with ports (`CaptchaVerifier`, `EmailSender`); `src/contact/adapters/` holds Turnstile and Resend; the endpoint file only wires them, because `astro:env/server` is a virtual module that unit tests cannot import.
- The domain speaks in error codes (`email_required`, `email_invalid`, `too_long`, `phone_invalid`), never in Spanish. Spanish messages live in `src/config/site.ts` and reach the client script through `data-*` attributes; client scripts do not import the site config.
- Required fields follow the mockup: only `E-mail`. Name, phone and message are optional and length-limited (names 80, phone 30, message 2000, email 254).
- A filled honeypot is answered as a success without sending anything, so bots learn nothing.
- No personal data is logged. Responses never echo the submitted values.
- Without JavaScript the Turnstile widget cannot run, so the form cannot be submitted; a `<noscript>` block says so and offers WhatsApp and email.
- TDD: off (no project or session configuration enables it; the user did not request it). Source: default. Runner: Vitest (`pnpm test`). Tests accompany all pure logic and the adapters (with a fake `fetch`); the form is verified in a real browser.

## Delivery strategy

User rule: pull requests under 1000 authored lines, stacked when bigger; generated or mechanical diffs are valid exceptions. Each pull request gets an independent read-only review while the review bot is out of quota, and is reported ready only after CI is green and the review findings are fixed.

1. `feat/contact-domain` into `main`: CC-01. Types, the shared character sanitizer, validation, their tests and this document. No new dependencies, so it does not collide with the open media pull requests. The domain slice was first estimated at 500 to 650 lines; after the review hardening it measured 1394 with tests, so it was split here to respect the limit. About 950 authored lines.
2. `feat/contact-use-case` stacked on 1: CC-02 and CC-03. Email composition, the use case and their tests. About 560 authored lines.
3. `feat/contact-endpoint` stacked on 2: CC-04 to CC-06. Adapter, endpoint, environment schema, Wrangler config. Estimated 450 to 600 authored lines plus lockfile.
4. `feat/contact-form` stacked on 3: CC-07 to CC-09. Markup, client script, copy, browser verification. Estimated 500 to 650 authored lines.

## Tasks

- [x] CC-01 `src/contact/types.ts` and `src/contact/validate.ts`: submission shape, error codes, normalization (trim, collapse whitespace, lowercase email), limits, honeypot; unit tests with literal expectations.
- [x] CC-02 `src/contact/compose.ts`: subject, plain-text body and `replyTo` for the photographer, with CR and LF stripped from single-line fields; unit tests including injection attempts.
- [x] CC-03 `src/contact/handle.ts`: use case over injected ports returning a result union (`sent`, `invalid`, `spam`, `captcha_failed`, `not_configured`, `delivery_failed`); unit tests with fakes covering order of operations (no captcha call for invalid input, no send when the captcha fails).
- [ ] CC-04 Cloudflare adapter, `wrangler.jsonc`, `astro:env` schema with optional secrets, `.dev.vars.example`; site stays static; CI build passes without secrets.
- [ ] CC-05 `src/contact/adapters/turnstile.ts` and `src/contact/adapters/resend.ts` over `fetch`, with timeouts and no value echo; unit tests with a fake `fetch`.
- [ ] CC-06 `src/pages/api/contact.ts`: JSON and form-encoded bodies, method and size guards, result to HTTP status mapping, no logging of personal data; verified locally against the Turnstile test keys.
- [ ] CC-07 Form markup and Spanish copy: required marker, honeypot, Turnstile container, status region, `<noscript>` fallback.
- [ ] CC-08 `src/scripts/contact-form.ts`: lazy Turnstile load, `fetch` submit, busy state, field errors tied to inputs with `aria-describedby`, focus to the first invalid field or to the status, success reset; pure mapping helpers unit-tested.
- [ ] CC-09 Verify in a browser: invalid email, success path with the test keys, captcha failure with the always-fail test key, `not_configured`, keyboard-only flow, reduced motion, no console errors; WhatsApp links consistent.

## Acceptance criteria

- A visitor can submit the form with only an email and gets a clear Spanish confirmation; invalid input is explained next to the field and focus moves to it.
- An automated submission without a valid Turnstile token is rejected; a honeypot hit is swallowed silently.
- With delivery not configured, the visitor is told to use WhatsApp or email and nothing is reported as sent.
- The homepage remains prerendered and ships no server code; only `/api/contact` runs on demand.
- `pnpm check` passes without any secret; all pure logic and adapters have unit tests that fail under mutation.
- No submitted value is logged or echoed.

## Progress and evidence

- 2026-09-18 CC-01 to CC-03 written by one delegated writer (Sonnet): `src/contact/{types,validate,compose,handle}.ts` with tests, no new dependencies, no existing file touched. First pass: 62 tests, `pnpm check` exit 0, five mutations caught (honeypot checked too late, sending after a failed captcha, no CR and LF stripping, a limit off by one, no email lowercasing). Design choice accepted: error precedence is required, then `too_long`, then format.
- 2026-09-18 Independent review before any pull request (the review bot is out of quota). The reviewer ran the tests and probed the modules with scratch scripts. Confirmed sound: no prototype pollution from JSON bodies, arrays and non-string values handled, Unicode spaces collapsed, no value echo, no logging, surrogate pairs preserved, no catastrophic backtracking (largest probe linear), and `\n{3,}` versus `\n{2,}` is an equivalent mutant. Findings, all fixed by the writer: (1) the email check accepted values that are not one bare address (`"x"<a@b.com>`, `<a@b.com>`, `a@b.com,evilrecipient.com`, IP literals, dots at the edges of the local part, hyphen-edged labels), which matters because the email becomes `replyTo`; it is now a strict allowlist (local part 1 to 64 from a fixed charset with dot rules, domain labels 1 to 63 of `a-z 0-9 -` without edge hyphens, at least two labels, alphabetic last label of two or more); non-ASCII addresses are rejected on purpose and punycode domains are accepted; (2) only code points below 0x20 were stripped, so DEL, C1 controls including NEL, U+2028 and U+2029, zero-width marks, bidi embeddings, overrides and isolates, the word joiner range and the BOM survived, and a right-to-left override in a name reversed the rendered subject; the new shared `src/contact/sanitize.ts` removes them in validation and again in composition; decision: the zero-width joiner is stripped from single-line fields and kept in the message body so family emoji are not broken, bidi controls are stripped everywhere; (3) the captcha result is compared with `=== true`, because `"false"`, `1`, `{}` and `[]` were treated as success; (4) two mutation blind spots closed: an invalid payload on an unconfigured site reports the field errors (decision now explicit: `not_configured` only for an otherwise valid submission), and non-boolean verifier results give `captcha_failed` with no send; (5) a throwing getter no longer breaks the "never throws" contract; (6) honeypot table for non-string values; (7) the message limit is documented as UTF-16 code units.
- Tooling hazard found by the writer: `\uXXXX` escapes typed through the editing tools were decoded into raw characters on disk, so test files briefly contained real invisible and bidi characters. They were rewritten with `String.fromCodePoint(0x...)` constants. Parent byte scan of `src`, `scripts`, `studio` and the config files for C1 controls, zero-width marks, bidi controls, separators and the BOM: no match.
- Evidence after the fixes: `pnpm test` 8 files and 175 tests (120 under `src/contact`); `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (45 files, 0 errors) and `pnpm check` exit 0. Mutations caught: `not_configured` before validation (1 test), `!captchaOk` instead of `!== true` (3), sanitizer keeping U+202E (4 across three files), a leading dot in the local part (1), and the sanitizer removed from `compose.ts` only (4, which proves composition is safe without validation). Parent probe: real addresses validate and normalize (`Fernando@Nunez.com.co` becomes lowercase), every malformed form above is rejected, and a payload of several megabytes with a million overrides is handled in 437 ms. Native risk assessment `medium`.
- Known limits: message length is counted in UTF-16 code units, so an emoji counts as two; addresses with non-ASCII characters are rejected; request size is bounded by the endpoint slice, not here.

## Next step

Open `feat/contact-domain` and the stacked `feat/contact-use-case`, confirm CI on both, then CC-04 to CC-06 on `feat/contact-endpoint`.
