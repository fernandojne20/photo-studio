import { describe, expect, it } from 'vitest';
import { composeContactEmail } from './compose';
import type { ContactSubmission } from './types';

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

const siteName = 'Laury Herrera';

function submission(overrides: Partial<ContactSubmission> = {}): ContactSubmission {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    message: '',
    ...overrides,
  };
}

describe('composeContactEmail — full submission', () => {
  it('produces the exact subject, text and replyTo for a complete submission', () => {
    const result = composeContactEmail(
      submission({
        firstName: 'Ana',
        lastName: 'Gómez',
        email: 'ana@example.com',
        phone: '+54 9 11 2682 1220',
        message: 'Hola, quiero info.',
      }),
      { siteName },
    );

    expect(result).toEqual({
      subject: 'Nueva consulta desde Laury Herrera — Ana Gómez',
      text:
        'Nombre: Ana Gómez\n' +
        'E-mail: ana@example.com\n' +
        'Teléfono: +54 9 11 2682 1220\n' +
        '\n' +
        'Mensaje:\n' +
        'Hola, quiero info.',
      replyTo: 'ana@example.com',
    });
  });
});

describe('composeContactEmail — email-only submission', () => {
  it('omits the Nombre and Teléfono lines and uses the no-message placeholder', () => {
    const result = composeContactEmail(submission({ email: 'ana@example.com' }), { siteName });

    expect(result).toEqual({
      subject: 'Nueva consulta desde Laury Herrera',
      text: 'E-mail: ana@example.com\n\nMensaje: (sin mensaje)',
      replyTo: 'ana@example.com',
    });
  });
});

describe('composeContactEmail — message with several lines', () => {
  it('keeps the message newlines intact after the Mensaje: label', () => {
    const result = composeContactEmail(
      submission({
        email: 'ana@example.com',
        message: 'Línea uno\n\nLínea dos\nLínea tres',
      }),
      { siteName },
    );

    expect(result).toEqual({
      subject: 'Nueva consulta desde Laury Herrera',
      text: 'E-mail: ana@example.com\n\nMensaje:\nLínea uno\n\nLínea dos\nLínea tres',
      replyTo: 'ana@example.com',
    });
  });
});

describe('composeContactEmail — header injection defense in depth', () => {
  it('strips CR/LF from a single-line field and from siteName, producing a subject and text with no CR or LF characters from the injection', () => {
    const result = composeContactEmail(
      submission({
        firstName: 'Ana\r\nBcc: evil@example.com',
        email: 'ana@example.com',
      }),
      { siteName: 'Evil\nSite' },
    );

    expect(result.subject).toBe('Nueva consulta desde EvilSite — AnaBcc: evil@example.com');
    expect(result.subject).not.toMatch(/[\r\n]/);
    expect(result.text).toBe(
      'Nombre: AnaBcc: evil@example.com\nE-mail: ana@example.com\n\nMensaje: (sin mensaje)',
    );
    // The injected "Bcc:" text is glued onto the preceding value: it never
    // starts its own line, because the newline that would have introduced
    // it was stripped, not converted into a line break.
    expect(result.text).not.toMatch(/^Bcc:/m);
  });

  it('removes control characters from the message while newlines stay, and a tab becomes a space', () => {
    const result = composeContactEmail(
      submission({
        email: 'ana@example.com',
        message: 'Hola\x07mundo\ttest\r\ncontinúa',
      }),
      { siteName },
    );

    expect(result.text).toBe('E-mail: ana@example.com\n\nMensaje:\nHolamundo test\ncontinúa');
  });
});

describe('composeContactEmail — invisible and spoofing characters (defense in depth)', () => {
  it('strips a right-to-left override from the name so the subject cannot render reversed', () => {
    const result = composeContactEmail(
      submission({
        firstName: `Invoice${RIGHT_TO_LEFT_OVERRIDE}txt.exe`,
        email: 'ana@example.com',
      }),
      { siteName },
    );

    expect(result.subject).toBe('Nueva consulta desde Laury Herrera — Invoicetxt.exe');
    expect(result.subject).not.toContain(RIGHT_TO_LEFT_OVERRIDE);
    expect(result.text).toContain('Invoicetxt.exe');
    expect(result.text).not.toContain(RIGHT_TO_LEFT_OVERRIDE);
  });

  it('removes U+2028 (LINE SEPARATOR) and U+0085 (NEL) from a single-line field, never turning them into a line break', () => {
    const result = composeContactEmail(
      submission({
        firstName: `Ana${LINE_SEPARATOR}Maria${NEL}Gomez`,
        email: 'ana@example.com',
      }),
      { siteName },
    );

    expect(result.subject).toBe('Nueva consulta desde Laury Herrera — AnaMariaGomez');
    expect(result.subject).not.toContain('\n');
  });

  it('keeps a ZWJ emoji sequence intact in the message body', () => {
    const family = `${MAN}${ZERO_WIDTH_JOINER}${WOMAN}${ZERO_WIDTH_JOINER}${GIRL}`;
    const result = composeContactEmail(
      submission({ email: 'ana@example.com', message: `Somos una familia ${family}` }),
      { siteName },
    );

    expect(result.text).toBe(`E-mail: ana@example.com\n\nMensaje:\nSomos una familia ${family}`);
  });
});
