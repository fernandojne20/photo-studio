import { validateContactSubmission } from '../contact/validate';
import type { ContactFieldName } from '../contact/types';
import {
  buildContactPayload,
  classifySubmitFailure,
  CONTACT_FIELD_ORDER,
  fieldsForLocalValidation,
  firstInvalidField,
  interpretResponse,
  mapFormErrorMessage,
  type ContactFormErrors,
  type ContactFormFieldValues,
  type ContactFormMessages,
  type ContactResponseOutcome,
} from '../lib/contact-form-state';

/**
 * Progressive enhancement for the contact form (`Contact.astro`): enables
 * the submit button, loads Cloudflare Turnstile lazily, validates with the
 * same pure function the server uses, submits with `fetch`, and manages
 * busy/error/success state and focus. Loaded from a normal `<script>`
 * import in `Contact.astro`, so it ships only on the homepage.
 *
 * Never imports `src/config/site.ts`: every visitor-facing string arrives
 * through the form's own `data-messages` attribute (see the language
 * contract in `odd/tasks/contact-conversion.md`). Never calls `console.*`:
 * every failure degrades to a UI state instead.
 */

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** How long to wait for the Turnstile script and widget to be ready. */
const TURNSTILE_READY_TIMEOUT_MS = 10_000;
/** How long to wait for a token once `execute()` is called. */
const TURNSTILE_TOKEN_TIMEOUT_MS = 15_000;
/** How long to wait for the server's response. */
const FETCH_TIMEOUT_MS = 15_000;

interface TurnstileRenderOptions {
  sitekey: string;
  language: string;
  size: 'normal' | 'flexible' | 'compact';
  appearance: 'always' | 'execute' | 'interaction-only';
  execution: 'render' | 'execute';
  callback: (token: string) => void;
  // Returns `true` on purpose: per Cloudflare's documentation
  // (https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/),
  // "If an error callback returns with a non-falsy result, Turnstile will
  // assume that the error callback handled the error accordingly and will
  // not perform any additional error logging" — this is our own UI error
  // state, so Turnstile's own console error would be redundant noise.
  'error-callback': () => boolean;
  'expired-callback': () => void;
  // Interactive-challenge lifecycle (e.g. the force-interactive test
  // sitekey `3x00000000000000000000FF`, or a real visitor Turnstile is
  // unsure about). Documented at
  // https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/:
  // "before-interactive-callback: ... invoked before the challenge enters
  // interactive mode"; "after-interactive-callback: ... invoked when
  // challenge has left interactive mode"; "timeout-callback: ... invoked
  // when the challenge presents an interactive challenge but was not
  // solved within a given time [and] will reset the widget to allow a
  // visitor to solve the challenge again".
  'before-interactive-callback': () => void;
  'after-interactive-callback': () => void;
  'timeout-callback': () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  execute: (container: HTMLElement) => void;
  // `widgetId` is deliberately required at every call site in this file
  // (never invoked as a bare `reset()`): passing `undefined` resets every
  // Turnstile widget on the page, not just this one.
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const EMPTY_MESSAGES: ContactFormMessages = {
  errors: { email_required: '', email_invalid: '', too_long: '', phone_invalid: '' },
  sending: '',
  success: '',
  captchaFailed: '',
  notConfigured: '',
  deliveryFailed: '',
  network: '',
  interactiveChallenge: '',
};

const FIELD_INPUT_IDS: Record<ContactFieldName, string> = {
  firstName: 'contact-first-name',
  lastName: 'contact-last-name',
  email: 'contact-email',
  phone: 'contact-phone',
  message: 'contact-message',
};

const FIELD_ERROR_IDS: Record<ContactFieldName, string> = {
  firstName: 'contact-first-name-error',
  lastName: 'contact-last-name-error',
  email: 'contact-email-error',
  phone: 'contact-phone-error',
  message: 'contact-message-error',
};

/** Reads and defensively normalizes the `data-messages` JSON attribute. */
function readMessages(form: HTMLFormElement): ContactFormMessages {
  try {
    const raw = form.dataset.messages;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_MESSAGES;
    const value = parsed as Partial<ContactFormMessages>;
    return {
      errors: { ...EMPTY_MESSAGES.errors, ...value.errors },
      sending: value.sending ?? EMPTY_MESSAGES.sending,
      success: value.success ?? EMPTY_MESSAGES.success,
      captchaFailed: value.captchaFailed ?? EMPTY_MESSAGES.captchaFailed,
      notConfigured: value.notConfigured ?? EMPTY_MESSAGES.notConfigured,
      deliveryFailed: value.deliveryFailed ?? EMPTY_MESSAGES.deliveryFailed,
      network: value.network ?? EMPTY_MESSAGES.network,
      interactiveChallenge: value.interactiveChallenge ?? EMPTY_MESSAGES.interactiveChallenge,
    };
  } catch {
    return EMPTY_MESSAGES;
  }
}

function readFieldValues(form: HTMLFormElement): ContactFormFieldValues {
  const read = (name: string): string => {
    const element = form.elements.namedItem(name);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    return '';
  };
  return {
    firstName: read('firstName'),
    lastName: read('lastName'),
    email: read('email'),
    phone: read('phone'),
    message: read('message'),
    // Honeypot: read from its DOM name `topic_ref`, deliberately unlike any
    // autofill/password-manager profile field (see the doc comment on
    // `ContactFormFieldValues.website` in `src/lib/contact-form-state.ts`
    // and the input itself in `Contact.astro`). The JSON key stays
    // `website` because that is what the server contract reads.
    website: read('topic_ref'),
  };
}

function fieldInput(form: HTMLFormElement, field: ContactFieldName): HTMLElement | null {
  return form.querySelector<HTMLElement>('#' + FIELD_INPUT_IDS[field]);
}

function fieldErrorElement(form: HTMLFormElement, field: ContactFieldName): HTMLElement | null {
  return form.querySelector<HTMLElement>('#' + FIELD_ERROR_IDS[field]);
}

function clearFieldError(form: HTMLFormElement, field: ContactFieldName): void {
  const input = fieldInput(form, field);
  const errorElement = fieldErrorElement(form, field);
  if (errorElement) errorElement.textContent = '';
  if (input) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}

function clearFieldErrors(form: HTMLFormElement): void {
  CONTACT_FIELD_ORDER.forEach((field) => clearFieldError(form, field));
}

function applyFieldErrors(
  form: HTMLFormElement,
  errors: ContactFormErrors,
  messages: ContactFormMessages,
): void {
  CONTACT_FIELD_ORDER.forEach((field) => {
    const code = errors[field];
    const input = fieldInput(form, field);
    const errorElement = fieldErrorElement(form, field);
    if (!code) {
      clearFieldError(form, field);
      return;
    }
    if (errorElement) errorElement.textContent = messages.errors[code] ?? '';
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', FIELD_ERROR_IDS[field]);
    }
  });

  const target = firstInvalidField(errors);
  if (target) fieldInput(form, target)?.focus();
}

function statusRegion(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('[data-contact-status]');
}

function statusErrorRegion(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('[data-contact-status-error]');
}

function clearStatusRegions(form: HTMLFormElement): void {
  const status = statusRegion(form);
  const statusError = statusErrorRegion(form);
  if (status) status.textContent = '';
  if (statusError) statusError.textContent = '';
}

// Neither status region ever receives focus: focus stays wherever it was
// (the submit button, for a click or Enter submission) through busy,
// success, and every form-level error. Only a field error (which points at
// something the visitor needs to fix) and the interactive-challenge
// container (which the visitor needs to act on) move focus.
function showStatus(form: HTMLFormElement, text: string): void {
  const region = statusRegion(form);
  if (region) region.textContent = text;
}

function showFormError(form: HTMLFormElement, text: string): void {
  const region = statusErrorRegion(form);
  if (region) region.textContent = text;
  // A form-level failure supersedes whatever busy/interactive-challenge
  // text the polite region was showing: clear it so the two regions never
  // disagree once the attempt has ended.
  showStatus(form, '');
}

/**
 * Locks the visible fields for the duration of an attempt. The values are
 * read once, when the visitor submits, and an interactive Turnstile
 * challenge can keep the attempt open for a long time: without this lock
 * an edit made meanwhile would be left out of the request and then erased
 * by the `form.reset()` that follows a success. `readOnly`, not
 * `disabled`: a read-only field keeps its focus, stays in the tab order
 * and is still announced, and it cannot be edited.
 */
function setFieldsLocked(form: HTMLFormElement, locked: boolean): void {
  CONTACT_FIELD_ORDER.forEach((field) => {
    const input = fieldInput(form, field);
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.readOnly = locked;
    }
  });
}

function setBusy(
  form: HTMLFormElement,
  submitButton: HTMLButtonElement | null,
  busy: boolean,
  label: string,
): void {
  form.dataset.busy = busy ? 'true' : 'false';
  form.setAttribute('aria-busy', busy ? 'true' : 'false');
  setFieldsLocked(form, busy);
  if (!submitButton) return;
  // `aria-disabled`, never the `disabled` property, while the button may
  // hold focus: a browser drops focus to `<body>` when a focused element
  // becomes disabled (see the same rule in `src/scripts/service-carousel.ts`).
  submitButton.setAttribute('aria-disabled', busy ? 'true' : 'false');
  submitButton.textContent = label;
}

/** Rejects with `timeout` if `promise` has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('unknown'));
      },
    );
  });
}

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;

/**
 * Loads the Turnstile script at most once, self-evicting if it stalls.
 *
 * Three races this guards against:
 * - A request that never fires `load` nor `error` (blocked mid-flight,
 *   a dropped connection, ...) would otherwise leave `turnstileScriptPromise`
 *   pointing at a promise that never settles, wedging every later submit on
 *   the same dead promise forever. The internal timer below evicts it
 *   instead: clears the module-level cache and removes the stalled
 *   `<script>` element, so the next call starts a genuinely fresh attempt.
 * - A stalled request that eventually DOES finish loading (late, after
 *   eviction) must not lead to a second `api.js`: `window.turnstile` is
 *   checked first, before creating any element at all.
 * - That same late `load`/`error` must not resolve/reject a promise nobody
 *   is awaiting anymore, nor null out a cache slot a newer attempt already
 *   owns. `settled` (this attempt is done, one way or another) and the
 *   `turnstileScriptPromise === promise` check (this attempt is still the
 *   current one) together make a late event on an evicted element a no-op.
 */
function loadTurnstileScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  const script = document.createElement('script');
  script.src = TURNSTILE_SCRIPT_SRC;
  script.async = true;

  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    let settled = false;

    const evict = (): void => {
      if (turnstileScriptPromise === promise) turnstileScriptPromise = null;
      script.remove();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      evict();
      reject(new Error('turnstile_load_timeout'));
    }, TURNSTILE_READY_TIMEOUT_MS);

    script.addEventListener('load', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        evict();
        reject(new Error('turnstile_unavailable'));
      }
    });
    script.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      evict();
      reject(new Error('turnstile_load_failed'));
    });

    document.head.appendChild(script);
  });

  turnstileScriptPromise = promise;
  return promise;
}

interface TurnstileState {
  widgetId?: string;
  readyPromise: Promise<void> | null;
  pendingToken: { resolve: (token: string) => void; reject: (error: Error) => void } | null;
  /** Our own token-wait timeout handle, cleared early by
   * `before-interactive-callback` (see `ensureTurnstileReady`) so it
   * cannot cut off a visitor still solving a visible challenge. */
  tokenTimeoutHandle: ReturnType<typeof setTimeout> | null;
}

function ensureTurnstileReady(
  state: TurnstileState,
  form: HTMLFormElement,
  container: HTMLElement,
  sitekey: string,
  language: string,
  messages: ContactFormMessages,
): Promise<void> {
  if (state.readyPromise) return state.readyPromise;

  state.readyPromise = loadTurnstileScript()
    .then((turnstile) => {
      state.widgetId = turnstile.render(container, {
        sitekey,
        language,
        size: 'flexible',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token) => {
          state.pendingToken?.resolve(token);
          state.pendingToken = null;
        },
        'error-callback': () => {
          state.pendingToken?.reject(new Error('captcha_error'));
          state.pendingToken = null;
          return true;
        },
        'expired-callback': () => {
          state.pendingToken?.reject(new Error('captcha_expired'));
          state.pendingToken = null;
        },
        'before-interactive-callback': () => {
          // Turnstile itself now owns the waiting-for-the-visitor timing
          // through its own `timeout-callback` below, so our fixed
          // token-wait timeout must stand down instead of cutting the
          // visitor off mid-challenge.
          if (state.tokenTimeoutHandle !== null) {
            clearTimeout(state.tokenTimeoutHandle);
            state.tokenTimeoutHandle = null;
          }
          showStatus(form, messages.interactiveChallenge);
          // The container needs `tabindex="-1"` (set in `Contact.astro`)
          // for this to be focusable at all: a keyboard visitor lands next
          // to the now-visible challenge instead of staying stranded on
          // the (still `aria-disabled`) submit button.
          container.focus();
        },
        'after-interactive-callback': () => {
          showStatus(form, messages.sending);
        },
        'timeout-callback': () => {
          // Documented to already reset the widget itself; this only
          // needs to settle our own pending promise as a captcha failure.
          state.pendingToken?.reject(new Error('captcha_timeout'));
          state.pendingToken = null;
        },
      });
    })
    .catch((error: unknown) => {
      // A transient failure (network blip loading the CF script) should
      // not permanently break the form for the rest of the page's life:
      // the next attempt (another lazy-load trigger, or the submit itself)
      // gets a fresh try.
      state.readyPromise = null;
      throw error instanceof Error ? error : new Error('turnstile_load_failed');
    });

  return state.readyPromise;
}

function requestCaptchaToken(state: TurnstileState, container: HTMLElement): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    state.tokenTimeoutHandle = setTimeout(() => {
      state.pendingToken = null;
      state.tokenTimeoutHandle = null;
      reject(new Error('timeout'));
    }, TURNSTILE_TOKEN_TIMEOUT_MS);

    const clearOwnTimeout = (): void => {
      if (state.tokenTimeoutHandle !== null) {
        clearTimeout(state.tokenTimeoutHandle);
        state.tokenTimeoutHandle = null;
      }
    };

    state.pendingToken = {
      resolve: (token) => {
        clearOwnTimeout();
        resolve(token);
      },
      reject: (error) => {
        clearOwnTimeout();
        reject(error);
      },
    };

    window.turnstile?.execute(container);
  });
}

/**
 * Loads Turnstile on the first `focusin` inside the form, or when the form
 * approaches the viewport, whichever happens first. Never on page load.
 * Runs at most once (both triggers are torn down after the first).
 */
function scheduleTurnstileLoad(
  form: HTMLFormElement,
  state: TurnstileState,
  container: HTMLElement,
  sitekey: string,
  language: string,
  messages: ContactFormMessages,
): void {
  let triggered = false;
  let observer: IntersectionObserver | undefined;

  const onFocusIn = (): void => trigger();

  const trigger = (): void => {
    if (triggered) return;
    triggered = true;
    form.removeEventListener('focusin', onFocusIn);
    observer?.disconnect();
    ensureTurnstileReady(state, form, container, sitekey, language, messages).catch(() => {
      // Surfaced again (and shown to the visitor) when the submit itself
      // awaits this same ready promise.
    });
  };

  form.addEventListener('focusin', onFocusIn);

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) trigger();
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(form);
  }
}

function handleOutcome(
  form: HTMLFormElement,
  outcome: ContactResponseOutcome,
  messages: ContactFormMessages,
): void {
  if (outcome.kind === 'success') {
    form.reset();
    clearFieldErrors(form);
    showStatus(form, messages.success);
    return;
  }
  if (outcome.kind === 'field_errors') {
    // Back to idle: clear whatever busy/interactive-challenge text was
    // left in the polite region, then move focus to the first bad field.
    showStatus(form, '');
    applyFieldErrors(form, outcome.errors, messages);
    return;
  }
  showFormError(form, mapFormErrorMessage(outcome.code, messages));
}

async function submitContactForm(
  form: HTMLFormElement,
  submitButton: HTMLButtonElement | null,
  state: TurnstileState,
  container: HTMLElement | null,
  sitekey: string | undefined,
  language: string,
  idleLabel: string,
  values: ContactFormFieldValues,
  messages: ContactFormMessages,
): Promise<void> {
  if (!container || !sitekey) {
    // Build produced no site key: Turnstile was never loaded, and the
    // server would answer `not_configured` anyway once delivery is not
    // set up either, so there is nothing to gain by calling it.
    showFormError(form, messages.notConfigured);
    return;
  }

  setBusy(form, submitButton, true, messages.sending);
  showStatus(form, messages.sending);

  try {
    // Anything that throws in THIS block happened before the request was
    // ever sent (script load, render, `error-callback`/`expired-callback`/
    // Turnstile's own `timeout-callback`, our token-wait timeout): a
    // captcha problem, mapped through the pure, unit-tested
    // `classifySubmitFailure`/`mapFormErrorMessage` (`src/lib/contact-form-state.ts`)
    // so the two failure sources can never be confused by an inline typo.
    let token: string;
    try {
      await withTimeout(
        ensureTurnstileReady(state, form, container, sitekey, language, messages),
        TURNSTILE_READY_TIMEOUT_MS,
      );
      token = await requestCaptchaToken(state, container);
    } catch {
      showFormError(form, mapFormErrorMessage(classifySubmitFailure('pre-fetch'), messages));
      return;
    }

    // Only a `fetch` rejection or its own `AbortSignal.timeout` firing
    // lands here, and only THIS is the real network/timeout message.
    let response: Response;
    try {
      response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildContactPayload(values, token)),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      showFormError(form, mapFormErrorMessage(classifySubmitFailure('fetch'), messages));
      return;
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    handleOutcome(form, interpretResponse(response.status, body), messages);
  } finally {
    // `undefined` would reset every Turnstile widget on the page, not just
    // this one; only reset when a widget was actually rendered.
    if (state.widgetId !== undefined) window.turnstile?.reset(state.widgetId);
    setBusy(form, submitButton, false, idleLabel);
  }
}

export function initContactForm(form: HTMLFormElement): void {
  const submitButton = form.querySelector<HTMLButtonElement>('[data-contact-submit]');
  const container = form.querySelector<HTMLElement>('[data-turnstile]');
  const sitekey = container?.dataset.sitekey;
  const language = container?.dataset.language ?? 'es';
  const idleLabel = submitButton?.textContent ?? '';
  const messages = readMessages(form);
  const turnstileState: TurnstileState = {
    readyPromise: null,
    pendingToken: null,
    tokenTimeoutHandle: null,
  };

  submitButton?.removeAttribute('disabled');

  CONTACT_FIELD_ORDER.forEach((field) => {
    fieldInput(form, field)?.addEventListener('input', () => clearFieldError(form, field));
  });

  if (container && sitekey) {
    scheduleTurnstileLoad(form, turnstileState, container, sitekey, language, messages);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (form.dataset.busy === 'true') return;

    const values = readFieldValues(form);
    // Local validation never sees the real bait value: `validateContactSubmission`
    // checks the honeypot FIRST and would otherwise return `spam` before
    // ever looking at the visible fields, which would make a baited
    // submission skip local field errors that an identical clean form
    // gets (and go straight to Turnstile/`fetch`) — an observable
    // difference a bot inspecting the client could use to detect the
    // honeypot. Passing `fieldsForLocalValidation(values)` (bait forced to
    // `''`) instead means the local path is IDENTICAL with or without the
    // bait, for both a valid and an invalid form: a filled bait plus an
    // empty e-mail stops here with the same `email_required` field error
    // a clean empty form gets. `values` itself is untouched, so the RAW
    // bait still reaches `buildContactPayload` below; the server validates
    // those raw values (bait included) and is what actually checks it, by
    // design (see `src/contact/handle.ts`), silently answering the same
    // `200 { ok: true }` as a real send either way.
    const validation = validateContactSubmission(fieldsForLocalValidation(values));

    clearFieldErrors(form);
    clearStatusRegions(form);

    if (validation.kind === 'invalid') {
      applyFieldErrors(form, validation.errors, messages);
      return;
    }

    void submitContactForm(
      form,
      submitButton,
      turnstileState,
      container,
      sitekey,
      language,
      idleLabel,
      values,
      messages,
    );
  });
}
