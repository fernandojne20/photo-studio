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
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const ARABIC_SEMICOLON = String.fromCodePoint(0x61b); // visible neighbour of U+061C
const ARABIC_LETTER_MARK = String.fromCodePoint(0x61c);
const ARABIC_GREETING = String.fromCodePoint(0x645, 0x631, 0x62d, 0x628, 0x627);
const MONGOLIAN_VOWEL_SEPARATOR = String.fromCodePoint(0x180e);
const MEDIUM_MATHEMATICAL_SPACE = String.fromCodePoint(0x205f); // just below the U+2060 block
const INHIBIT_SYMMETRIC_SWAPPING = String.fromCodePoint(0x206a);
const NOMINAL_DIGIT_SHAPES = String.fromCodePoint(0x206f);
const SUPERSCRIPT_ZERO = String.fromCodePoint(0x2070); // just above the U+2060 block
const INTERLINEAR_ANNOTATION_ANCHOR = String.fromCodePoint(0xfff9);
const INTERLINEAR_ANNOTATION_TERMINATOR = String.fromCodePoint(0xfffb);
const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd); // visible, above the annotation controls
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
    ['SOFT HYPHEN (U+00AD) is removed', `a${SOFT_HYPHEN}b`, 'ab'],
    ['ARABIC LETTER MARK (U+061C) is removed', `a${ARABIC_LETTER_MARK}b`, 'ab'],
    [
      'ARABIC LETTER MARK is removed without touching the Arabic text around it',
      `${ARABIC_GREETING}${ARABIC_LETTER_MARK}${ARABIC_SEMICOLON}`,
      `${ARABIC_GREETING}${ARABIC_SEMICOLON}`,
    ],
    ['MONGOLIAN VOWEL SEPARATOR (U+180E) is removed', `a${MONGOLIAN_VOWEL_SEPARATOR}b`, 'ab'],
    [
      'INHIBIT SYMMETRIC SWAPPING (U+206A, deprecated format control) is removed',
      `a${INHIBIT_SYMMETRIC_SWAPPING}b`,
      'ab',
    ],
    [
      'NOMINAL DIGIT SHAPES (U+206F, deprecated format control) is removed',
      `a${NOMINAL_DIGIT_SHAPES}b`,
      'ab',
    ],
    [
      'the neighbours of the U+2060..U+206F block are kept',
      `a${MEDIUM_MATHEMATICAL_SPACE}b${SUPERSCRIPT_ZERO}`,
      `a${MEDIUM_MATHEMATICAL_SPACE}b${SUPERSCRIPT_ZERO}`,
    ],
    [
      'INTERLINEAR ANNOTATION ANCHOR (U+FFF9) is removed',
      `a${INTERLINEAR_ANNOTATION_ANCHOR}b`,
      'ab',
    ],
    [
      'INTERLINEAR ANNOTATION TERMINATOR (U+FFFB) is removed',
      `a${INTERLINEAR_ANNOTATION_TERMINATOR}b`,
      'ab',
    ],
    [
      'the visible REPLACEMENT CHARACTER (U+FFFD) is kept',
      `a${REPLACEMENT_CHARACTER}b`,
      `a${REPLACEMENT_CHARACTER}b`,
    ],
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
    ['ARABIC LETTER MARK (U+061C) is still removed', `a${ARABIC_LETTER_MARK}b`, 'ab'],
    ['SOFT HYPHEN (U+00AD) is still removed', `a${SOFT_HYPHEN}b`, 'ab'],
    ['NOMINAL DIGIT SHAPES (U+206F) is still removed', `a${NOMINAL_DIGIT_SHAPES}b`, 'ab'],
    [
      'INTERLINEAR ANNOTATION ANCHOR (U+FFF9) is still removed',
      `a${INTERLINEAR_ANNOTATION_ANCHOR}b`,
      'ab',
    ],
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
