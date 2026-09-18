import { describe, expect, it } from 'vitest';
import { stripUnsafeCharacters } from './sanitize';

// Built with `String.fromCodePoint` rather than `\uXXXX`/`\u{XXXXX}` string
// literals so this file's own source never embeds a raw control, invisible,
// or bidi-override character — the exact hazard this module defends
// against. Each constant is named after the Unicode character it produces.
const DEL = String.fromCodePoint(0x7f);
const NEL = String.fromCodePoint(0x85); // C1 control "next line"
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const ZERO_WIDTH_NON_JOINER = String.fromCodePoint(0x200c);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);
const RIGHT_TO_LEFT_MARK = String.fromCodePoint(0x200f);
const LEFT_TO_RIGHT_OVERRIDE = String.fromCodePoint(0x202d);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const WORD_JOINER = String.fromCodePoint(0x2060);
const LEFT_TO_RIGHT_ISOLATE = String.fromCodePoint(0x2066);
const POP_DIRECTIONAL_ISOLATE = String.fromCodePoint(0x2069);
const BOM = String.fromCodePoint(0xfeff);
const MAN = String.fromCodePoint(0x1f468);
const WOMAN = String.fromCodePoint(0x1f469);
const GIRL = String.fromCodePoint(0x1f467);
const THUMBS_UP = String.fromCodePoint(0x1f44d);

describe('stripUnsafeCharacters — single-line mode (keepNewlines: false)', () => {
  it.each([
    ['plain ASCII text is left untouched', 'Ana Gomez', 'Ana Gomez'],
    [
      'an emoji is left untouched (not a control character)',
      `Hola ${THUMBS_UP}`,
      `Hola ${THUMBS_UP}`,
    ],
    ['a C0 control other than tab/newline is removed', 'a\x07b', 'ab'],
    ['carriage return is removed', 'a\rb', 'ab'],
    ['a tab becomes a single space', 'a\tb', 'a b'],
    ['a newline is removed', 'a\nb', 'ab'],
    ['DEL (U+007F) is removed', `a${DEL}b`, 'ab'],
    ['a C1 control / NEL (U+0085) is removed', `a${NEL}b`, 'ab'],
    ['LINE SEPARATOR (U+2028) is removed', `a${LINE_SEPARATOR}b`, 'ab'],
    ['PARAGRAPH SEPARATOR (U+2029) is removed', `a${PARAGRAPH_SEPARATOR}b`, 'ab'],
    ['ZERO WIDTH SPACE (U+200B) is removed', `a${ZERO_WIDTH_SPACE}b`, 'ab'],
    ['ZERO WIDTH NON-JOINER (U+200C) is removed', `a${ZERO_WIDTH_NON_JOINER}b`, 'ab'],
    ['ZERO WIDTH JOINER (U+200D) is removed in single-line mode', `a${ZERO_WIDTH_JOINER}b`, 'ab'],
    ['LEFT-TO-RIGHT MARK (U+200E) is removed', `a${LEFT_TO_RIGHT_MARK}b`, 'ab'],
    ['RIGHT-TO-LEFT MARK (U+200F) is removed', `a${RIGHT_TO_LEFT_MARK}b`, 'ab'],
    ['LEFT-TO-RIGHT OVERRIDE (U+202D) is removed', `a${LEFT_TO_RIGHT_OVERRIDE}b`, 'ab'],
    ['RIGHT-TO-LEFT OVERRIDE (U+202E) is removed', `a${RIGHT_TO_LEFT_OVERRIDE}b`, 'ab'],
    ['WORD JOINER (U+2060) is removed', `a${WORD_JOINER}b`, 'ab'],
    ['LEFT-TO-RIGHT ISOLATE (U+2066) is removed', `a${LEFT_TO_RIGHT_ISOLATE}b`, 'ab'],
    ['POP DIRECTIONAL ISOLATE (U+2069) is removed', `a${POP_DIRECTIONAL_ISOLATE}b`, 'ab'],
    ['the BOM (U+FEFF) is removed', `a${BOM}b`, 'ab'],
  ])('%s', (_description, input, expected) => {
    expect(stripUnsafeCharacters(input, { keepNewlines: false })).toBe(expected);
  });
});

describe('stripUnsafeCharacters — message mode (keepNewlines: true)', () => {
  it.each([
    ['a newline is kept', 'a\nb', 'a\nb'],
    ['carriage return is still removed (only \\n counts as a newline)', 'a\rb', 'ab'],
    ['a tab still becomes a single space', 'a\tb', 'a b'],
    [
      'ZERO WIDTH JOINER (U+200D) is kept in message mode',
      `a${ZERO_WIDTH_JOINER}b`,
      `a${ZERO_WIDTH_JOINER}b`,
    ],
    ['ZERO WIDTH NON-JOINER (U+200C) is still removed', `a${ZERO_WIDTH_NON_JOINER}b`, 'ab'],
    ['RIGHT-TO-LEFT OVERRIDE (U+202E) is still removed', `a${RIGHT_TO_LEFT_OVERRIDE}b`, 'ab'],
    [
      'LINE SEPARATOR (U+2028) is still removed, never becomes a line break',
      `a${LINE_SEPARATOR}b`,
      'ab',
    ],
    ['the BOM (U+FEFF) is still removed', `a${BOM}b`, 'ab'],
  ])('%s', (_description, input, expected) => {
    expect(stripUnsafeCharacters(input, { keepNewlines: true })).toBe(expected);
  });
});

describe('stripUnsafeCharacters — ZWJ emoji sequence tradeoff', () => {
  it('keeps a family emoji ZWJ sequence intact in message mode', () => {
    const family = `${MAN}${ZERO_WIDTH_JOINER}${WOMAN}${ZERO_WIDTH_JOINER}${GIRL}`;
    expect(stripUnsafeCharacters(family, { keepNewlines: true })).toBe(family);
  });

  it('breaks a ZWJ sequence apart in single-line mode, by design (in a name or a subject, spoofing risk outweighs emoji fidelity)', () => {
    const coupleWithJoiner = `${MAN}${ZERO_WIDTH_JOINER}${WOMAN}`;
    const coupleWithoutJoiner = `${MAN}${WOMAN}`;
    expect(stripUnsafeCharacters(coupleWithJoiner, { keepNewlines: false })).toBe(
      coupleWithoutJoiner,
    );
  });
});
