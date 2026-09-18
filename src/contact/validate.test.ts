import { describe, expect, it } from 'vitest';
import { validateContactSubmission } from './validate';

// Built with `String.fromCodePoint` rather than `\uXXXX` string literals
// so this file's own source never embeds a raw bidi-override or invisible
// character.
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const NEL = String.fromCodePoint(0x85);
const MAN = String.fromCodePoint(0x1f468);
const WOMAN = String.fromCodePoint(0x1f469);
const GIRL = String.fromCodePoint(0x1f467);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);

describe('validateContactSubmission — minimal valid submission', () => {
  it('accepts an email-only submission, leaving every other field as an empty string', () => {
    const result = validateContactSubmission({ email: 'ana@example.com' });

    expect(result).toEqual({
      kind: 'valid',
      submission: {
        firstName: '',
        lastName: '',
        email: 'ana@example.com',
        phone: '',
        message: '',
      },
    });
  });
});

describe('validateContactSubmission — normalization', () => {
  it('trims and collapses internal whitespace runs in single-line fields, and lowercases the email', () => {
    const result = validateContactSubmission({
      firstName: '  Ana    María  ',
      lastName: '\tGómez  Pérez\n',
      email: '  Ana.Maria@EXAMPLE.com  ',
      phone: '  +54   9  11 2682  1220  ',
      message: 'Hola',
    });

    expect(result).toEqual({
      kind: 'valid',
      submission: {
        firstName: 'Ana María',
        lastName: 'Gómez Pérez',
        email: 'ana.maria@example.com',
        phone: '+54 9 11 2682 1220',
        message: 'Hola',
      },
    });
  });

  it('normalizes CRLF line endings, trims, and collapses runs of 3+ newlines to 2 in the message', () => {
    const result = validateContactSubmission({
      email: 'ana@example.com',
      message: '  Línea uno\r\n\r\n\r\n\r\nLínea dos\r\nLínea tres  ',
    });

    expect(result).toEqual({
      kind: 'valid',
      submission: {
        firstName: '',
        lastName: '',
        email: 'ana@example.com',
        phone: '',
        message: 'Línea uno\n\nLínea dos\nLínea tres',
      },
    });
  });

  it('normalizes lone CR (old Mac) line endings in the message to \\n', () => {
    const result = validateContactSubmission({
      email: 'ana@example.com',
      message: 'a\rb\rc',
    });

    expect(result).toEqual({
      kind: 'valid',
      submission: {
        firstName: '',
        lastName: '',
        email: 'ana@example.com',
        phone: '',
        message: 'a\nb\nc',
      },
    });
  });
});

describe('validateContactSubmission — invisible and spoofing characters', () => {
  it('strips a right-to-left override from firstName instead of letting it reach the submission', () => {
    const result = validateContactSubmission({
      firstName: `Invoice${RIGHT_TO_LEFT_OVERRIDE}txt.exe`,
      email: 'ana@example.com',
    });

    expect(result).toEqual({
      kind: 'valid',
      submission: {
        firstName: 'Invoicetxt.exe',
        lastName: '',
        email: 'ana@example.com',
        phone: '',
        message: '',
      },
    });
  });

  it('removes U+2028 (LINE SEPARATOR) and U+0085 (NEL) from a single-line field, never turning them into a line break', () => {
    const result = validateContactSubmission({
      firstName: `Ana${LINE_SEPARATOR}Maria${NEL}Gomez`,
      email: 'ana@example.com',
    });

    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.submission.firstName).toBe('AnaMariaGomez');
      expect(result.submission.firstName).not.toContain('\n');
    }
  });

  it('keeps a ZWJ emoji sequence intact in the message body', () => {
    const family = `${MAN}${ZERO_WIDTH_JOINER}${WOMAN}${ZERO_WIDTH_JOINER}${GIRL}`;
    const result = validateContactSubmission({
      email: 'ana@example.com',
      message: `Somos una familia ${family}`,
    });

    expect(result).toEqual({
      kind: 'valid',
      submission: {
        firstName: '',
        lastName: '',
        email: 'ana@example.com',
        phone: '',
        message: `Somos una familia ${family}`,
      },
    });
  });
});

describe('validateContactSubmission — field limits at the boundary', () => {
  it('accepts a firstName of exactly 80 characters', () => {
    const result = validateContactSubmission({
      firstName: 'a'.repeat(80),
      email: 'ana@example.com',
    });

    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.submission.firstName).toBe('a'.repeat(80));
    }
  });

  it('rejects a firstName of 81 characters with too_long', () => {
    const result = validateContactSubmission({
      firstName: 'a'.repeat(81),
      email: 'ana@example.com',
    });

    expect(result).toEqual({ kind: 'invalid', errors: { firstName: 'too_long' } });
  });

  it('accepts a lastName of exactly 80 characters', () => {
    const result = validateContactSubmission({
      lastName: 'a'.repeat(80),
      email: 'ana@example.com',
    });

    expect(result.kind).toBe('valid');
  });

  it('rejects a lastName of 81 characters with too_long', () => {
    const result = validateContactSubmission({
      lastName: 'a'.repeat(81),
      email: 'ana@example.com',
    });

    expect(result).toEqual({ kind: 'invalid', errors: { lastName: 'too_long' } });
  });

  it('accepts a phone of exactly 30 digits', () => {
    const result = validateContactSubmission({
      email: 'ana@example.com',
      phone: '1'.repeat(30),
    });

    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.submission.phone).toBe('1'.repeat(30));
    }
  });

  it('rejects a phone of 31 digits with too_long, not phone_invalid', () => {
    const result = validateContactSubmission({
      email: 'ana@example.com',
      phone: '1'.repeat(31),
    });

    expect(result).toEqual({ kind: 'invalid', errors: { phone: 'too_long' } });
  });

  it('accepts a message of exactly 2000 characters', () => {
    const result = validateContactSubmission({
      email: 'ana@example.com',
      message: 'a'.repeat(2000),
    });

    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.submission.message).toBe('a'.repeat(2000));
    }
  });

  it('rejects a message of 2001 characters with too_long', () => {
    const result = validateContactSubmission({
      email: 'ana@example.com',
      message: 'a'.repeat(2001),
    });

    expect(result).toEqual({ kind: 'invalid', errors: { message: 'too_long' } });
  });

  it('accepts an email of exactly 254 characters', () => {
    // Local part at its own 64-char max; domain built from 63-char labels
    // (the label max) plus a final all-letter label, so the whole address
    // is syntactically valid at exactly 254 characters:
    // 64 (local) + 1 (@) + 63 + 1 (.) + 63 + 1 (.) + 61 (domain) = 254.
    const localPart = 'a'.repeat(64);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    const email = `${localPart}@${domain}`;
    expect(email).toHaveLength(254);

    const result = validateContactSubmission({ email });

    expect(result).toEqual({
      kind: 'valid',
      submission: { firstName: '', lastName: '', email, phone: '', message: '' },
    });
  });

  it('rejects an email of 255 characters with too_long', () => {
    const localPart = 'a'.repeat(65);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    const email = `${localPart}@${domain}`;
    expect(email).toHaveLength(255);

    const result = validateContactSubmission({ email });

    expect(result).toEqual({ kind: 'invalid', errors: { email: 'too_long' } });
  });
});

describe('validateContactSubmission — several invalid fields reported together', () => {
  it('reports every invalid field in the same result, not only the first', () => {
    const result = validateContactSubmission({
      firstName: 'a'.repeat(81),
      email: 'not-an-email',
      phone: 'call me maybe',
      message: 'a'.repeat(2001),
    });

    expect(result).toEqual({
      kind: 'invalid',
      errors: {
        firstName: 'too_long',
        email: 'email_invalid',
        phone: 'phone_invalid',
        message: 'too_long',
      },
    });
  });
});

describe('validateContactSubmission — email required vs invalid', () => {
  it('reports email_required when the email field is missing', () => {
    const result = validateContactSubmission({});
    expect(result).toEqual({ kind: 'invalid', errors: { email: 'email_required' } });
  });

  it('reports email_required when the email field is blank after trimming', () => {
    const result = validateContactSubmission({ email: '    ' });
    expect(result).toEqual({ kind: 'invalid', errors: { email: 'email_required' } });
  });

  it.each([
    'a@b.co',
    'first.last+tag@sub.example.com',
    "o'brien@example.co.uk",
    'a_b-c.d+tag@sub-domain.example.com',
    'x@xn--caf-dma.com',
  ])('accepts the valid address %j', (email) => {
    const result = validateContactSubmission({ email });
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.submission.email).toBe(email.toLowerCase());
    }
  });

  it.each([
    ['no @ sign', 'ab.com'],
    ['two @ signs', 'a@b@c.com'],
    ['no dot in domain', 'a@b'],
    ['leading dot in domain', 'a@.com'],
    ['consecutive dots in domain', 'a@b..com'],
    ['trailing dot in domain', 'a@b.com.'],
    ['space inside the address', 'a b@c.com'],
    ['leading dot in the local part', '.ana@example.com'],
    ['trailing dot in the local part', 'ana.@example.com'],
    ['consecutive dots in the local part', 'an..a@example.com'],
    ['leading hyphen in a domain label', 'a@-b.com'],
    ['trailing hyphen in a domain label', 'a@b-.com'],
    ['an IP literal instead of a domain', 'a@[192.168.1.1]'],
    ['a quoted local part with an embedded angle-bracket address', '"x"<a@b.com>'],
    ['a bare angle-bracketed address', '<a@b.com>'],
    ['a trailing comma-separated second recipient', 'a@b.com,evilrecipient.com'],
  ])('rejects %s (%j) with email_invalid', (_reason, email) => {
    const result = validateContactSubmission({ email });
    expect(result).toEqual({ kind: 'invalid', errors: { email: 'email_invalid' } });
  });
});

describe('validateContactSubmission — phone format', () => {
  it.each(['+54 9 11 2682 1220', '(011) 4444-5555'])('accepts the valid phone %j', (phone) => {
    const result = validateContactSubmission({ email: 'ana@example.com', phone });
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.submission.phone).toBe(phone);
    }
  });

  it.each([
    ['letters', 'call me at 555'],
    ['fewer than 6 digits', '123-45'],
  ])('rejects a phone with %s (%j) with phone_invalid', (_reason, phone) => {
    const result = validateContactSubmission({ email: 'ana@example.com', phone });
    expect(result).toEqual({ kind: 'invalid', errors: { phone: 'phone_invalid' } });
  });

  it('leaves an empty phone valid, since it is optional', () => {
    const result = validateContactSubmission({ email: 'ana@example.com', phone: '' });
    expect(result.kind).toBe('valid');
  });
});

describe('validateContactSubmission — never throws on malformed input', () => {
  it.each([null, undefined, 42, 'a string', [], true])(
    'treats non-object input %j as an empty payload, reporting email_required instead of throwing',
    (input) => {
      expect(() => validateContactSubmission(input)).not.toThrow();
      const result = validateContactSubmission(input);
      expect(result).toEqual({ kind: 'invalid', errors: { email: 'email_required' } });
    },
  );

  it('treats non-string field values as empty strings instead of throwing', () => {
    const malformedPayload = {
      firstName: true,
      lastName: 42,
      email: { toString: () => 'ana@example.com' },
      phone: null,
      message: {},
    };

    expect(() => validateContactSubmission(malformedPayload)).not.toThrow();
    expect(validateContactSubmission(malformedPayload)).toEqual({
      kind: 'invalid',
      errors: { email: 'email_required' },
    });
  });

  it('treats a throwing getter as an empty field instead of throwing', () => {
    const payload: Record<string, unknown> = { firstName: 'Ana' };
    Object.defineProperty(payload, 'email', {
      get(): string {
        throw new Error('boom');
      },
      enumerable: true,
    });

    expect(() => validateContactSubmission(payload)).not.toThrow();
    expect(validateContactSubmission(payload)).toEqual({
      kind: 'invalid',
      errors: { email: 'email_required' },
    });
  });
});

describe('validateContactSubmission — honeypot', () => {
  it('reports spam when the honeypot field is filled, ignoring otherwise-invalid fields', () => {
    const result = validateContactSubmission({
      website: 'http://spam.example',
      email: 'not-an-email',
      firstName: 'a'.repeat(200),
    });

    expect(result).toEqual({ kind: 'spam' });
  });

  it('reports spam even when every other field is perfectly valid', () => {
    const result = validateContactSubmission({
      website: 'http://spam.example',
      email: 'ana@example.com',
    });

    expect(result).toEqual({ kind: 'spam' });
  });

  it('does not treat a whitespace-only honeypot as filled', () => {
    const result = validateContactSubmission({ website: '   ', email: 'ana@example.com' });

    expect(result).toEqual({
      kind: 'valid',
      submission: {
        firstName: '',
        lastName: '',
        email: 'ana@example.com',
        phone: '',
        message: '',
      },
    });
  });

  it.each([
    ['a boolean', true],
    ['a number', 123],
    ['an empty array', []],
    ['an empty object', {}],
  ])('does not treat a non-string honeypot value (%s: %j) as spam', (_label, website) => {
    const result = validateContactSubmission({ website, email: 'ana@example.com' });
    expect(result.kind).not.toBe('spam');
  });
});
