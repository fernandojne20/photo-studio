import { handleContactRequest, type ContactRequestResult } from './handle';
import type { CaptchaVerifier, EmailSender } from './types';

/**
 * HTTP entry point for the contact use case: framework-independent, over
 * the standard `Request`/`Response` (no Astro imports), so it stays fully
 * unit-testable. `src/pages/api/contact.ts` wires the real ports (`astro:env`
 * cannot be imported from a unit test — see `odd/tasks/contact-conversion.md`).
 *
 * Never throws, never logs, never echoes a submitted value in a response.
 */

export interface CreateContactHandlerDeps {
  siteName: string;
  verifyCaptcha?: CaptchaVerifier;
  sendEmail?: EmailSender;
  /** Defaults to 32 KiB. */
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders },
  });
}

function isSameOrigin(originHeader: string, requestUrl: string): boolean {
  try {
    return new URL(originHeader).origin === new URL(requestUrl).origin;
  } catch {
    // An `Origin` header that is not a valid URL cannot be same-origin.
    return false;
  }
}

type ParsedContentType = 'json' | 'urlencoded' | 'multipart';

function parseContentType(header: string | null): ParsedContentType | null {
  if (header === null) return null;
  const mediaType = header.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType === 'application/json') return 'json';
  if (mediaType === 'application/x-www-form-urlencoded') return 'urlencoded';
  if (mediaType === 'multipart/form-data') return 'multipart';
  return null;
}

// `Uint8Array<ArrayBuffer>`, not the bare (and, as of TypeScript 5.7+,
// looser-by-default) `Uint8Array`: `new Uint8Array(total)` below always
// allocates a real, non-shared `ArrayBuffer`, and pinning that here is what
// lets `parseBody` hand these bytes straight to `new Response(bytes, ...)`,
// whose `BodyInit` only accepts a `Uint8Array<ArrayBuffer>` view.
type ReadBodyResult = { kind: 'ok'; bytes: Uint8Array<ArrayBuffer> } | { kind: 'too_large' };

/**
 * Reads the request body in one bounded pass, chunk by chunk, stopping and
 * reporting `too_large` the moment the running total exceeds `maxBytes`
 * (the bytes already buffered are discarded; nothing further is read).
 *
 * This is deliberately NOT a defense against a *lying small*
 * `Content-Length`: a real HTTP server frames the body by the declared
 * length before the `Request` exists, so this handler only ever receives
 * the declared bytes. Verified against the built Worker over a raw socket:
 * a 40 KB JSON body declared as 10 bytes arrives truncated and ends as
 * `400 bad_request` from the parser below, never as an oversized read.
 * What the counted read guards against is a body sent with NO
 * `Content-Length` at all (`Transfer-Encoding: chunked`, or any streamed
 * body), and any environment that does not enforce the declared length
 * the way a real HTTP server does: the early `Content-Length` check
 * cannot run, or cannot be trusted, in either case.
 */
async function readBoundedBody(request: Request, maxBytes: number): Promise<ReadBodyResult> {
  if (!request.body) {
    return { kind: 'ok', bytes: new Uint8Array(0) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        // Not awaited on purpose: the limit has already been decided, and
        // there is no need to hold the response on the cancellation
        // settling.
        reader.cancel().catch(() => {});
        return { kind: 'too_large' };
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'ok', bytes };
}

interface ParsedBody {
  payload: Record<string, unknown>;
  captchaToken: unknown;
}

/**
 * Parses the already-read request body bytes per `contentType` into a
 * plain payload object plus the captcha token. JSON accepts
 * `captchaToken`, falling back to `cf-turnstile-response`; form-encoded and
 * multipart bodies only ever use `cf-turnstile-response` (the name
 * Turnstile's own widget submits). Throws on a malformed body (invalid
 * JSON, a non-object or array JSON value, or an unparsable form body); the
 * caller maps that to `bad_request`.
 */
async function parseBody(
  bytes: Uint8Array<ArrayBuffer>,
  contentType: ParsedContentType,
  rawContentTypeHeader: string,
): Promise<ParsedBody> {
  if (contentType === 'json') {
    const text = new TextDecoder('utf-8').decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
      throw new Error('bad_request: JSON body must be a plain object, not an array or a primitive');
    }
    const payload = parsed as Record<string, unknown>;
    return { payload, captchaToken: payload.captchaToken ?? payload['cf-turnstile-response'] };
  }

  if (contentType === 'urlencoded') {
    const text = new TextDecoder('utf-8').decode(bytes);
    const payload = Object.fromEntries(new URLSearchParams(text).entries());
    return { payload, captchaToken: payload['cf-turnstile-response'] };
  }

  // multipart/form-data: re-wrap the already-read bytes as a `Response`
  // carrying the original `Content-Type` (boundary included), so the
  // platform's own multipart parser can run against it without a second
  // read of the request.
  const formData = await new Response(bytes, {
    headers: { 'content-type': rawContentTypeHeader },
  }).formData();
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      payload[key] = value;
    }
  }
  return { payload, captchaToken: payload['cf-turnstile-response'] };
}

function mapResultToResponse(result: ContactRequestResult): Response {
  switch (result.kind) {
    case 'sent':
    case 'spam':
      // Byte-identical on purpose: a bot filling the honeypot must not be
      // able to tell its submission apart from a real one that was sent.
      return jsonResponse(200, { ok: true });
    case 'invalid':
      return jsonResponse(422, { ok: false, code: 'invalid', errors: result.errors });
    case 'captcha_failed':
      return jsonResponse(400, { ok: false, code: 'captcha_failed' });
    case 'not_configured':
      return jsonResponse(503, { ok: false, code: 'not_configured' });
    case 'delivery_failed':
      return jsonResponse(502, { ok: false, code: 'delivery_failed' });
  }
}

/**
 * Builds the `/api/contact` request handler. See the module doc comment
 * above for the framework-independence rationale.
 */
export function createContactHandler(
  deps: CreateContactHandlerDeps,
): (request: Request) => Promise<Response> {
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return async function contactHandler(request: Request): Promise<Response> {
    try {
      if (request.method !== 'POST') {
        return jsonResponse(405, { ok: false, code: 'method_not_allowed' }, { Allow: 'POST' });
      }

      const originHeader = request.headers.get('origin');
      if (originHeader !== null && !isSameOrigin(originHeader, request.url)) {
        return jsonResponse(403, { ok: false, code: 'forbidden_origin' });
      }

      const contentLengthHeader = request.headers.get('content-length');
      if (contentLengthHeader !== null) {
        const contentLength = Number(contentLengthHeader);
        if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
          return jsonResponse(413, { ok: false, code: 'too_large' });
        }
      }

      const bodyResult = await readBoundedBody(request, maxBodyBytes);
      if (bodyResult.kind === 'too_large') {
        return jsonResponse(413, { ok: false, code: 'too_large' });
      }

      const rawContentTypeHeader = request.headers.get('content-type');
      const contentType = parseContentType(rawContentTypeHeader);
      if (contentType === null) {
        return jsonResponse(415, { ok: false, code: 'unsupported_media_type' });
      }

      let parsed: ParsedBody;
      try {
        parsed = await parseBody(bodyResult.bytes, contentType, rawContentTypeHeader ?? '');
      } catch {
        return jsonResponse(400, { ok: false, code: 'bad_request' });
      }

      const remoteIp = request.headers.get('cf-connecting-ip');

      const result = await handleContactRequest(
        {
          payload: parsed.payload,
          captchaToken: parsed.captchaToken,
          ...(remoteIp !== null ? { remoteIp } : {}),
        },
        {
          siteName: deps.siteName,
          ...(deps.verifyCaptcha ? { verifyCaptcha: deps.verifyCaptcha } : {}),
          ...(deps.sendEmail ? { sendEmail: deps.sendEmail } : {}),
        },
      );

      return mapResultToResponse(result);
    } catch {
      return jsonResponse(500, { ok: false, code: 'internal' });
    }
  };
}
