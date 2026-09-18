/**
 * Shared character-safety helper for the contact domain. Strips control
 * characters, invisible/zero-width characters, and Unicode bidi spoofing
 * controls, so no submitted field can inject a header, hide a directional
 * override, or smuggle an invisible character into composed output.
 *
 * Used from both `validate.ts` (before the whitespace normalization of
 * every field, so a spoofing character never reaches a length check or a
 * stored submission) and `compose.ts` (again, as defense in depth, so
 * `composeContactEmail` stays safe on its own for a caller that bypasses
 * validation).
 */

export interface StripUnsafeCharactersOptions {
  /**
   * When `true`, this call is sanitizing the free-form message body:
   * `\n` is preserved instead of removed, and the zero-width joiner
   * (U+200D) is preserved too (see the ZWJ note below). Every other
   * field in this domain is single-line and passes `false`.
   */
  keepNewlines: boolean;
}

const ZERO_WIDTH_JOINER = 0x200d;

/**
 * True for every code point this helper always removes, regardless of
 * `keepNewlines`: C0/C1 controls (including DEL and NEL), the soft
 * hyphen, the Unicode line/paragraph separators, the zero-width marks
 * other than ZWJ, the whole Unicode `Bidi_Control` set (U+061C, U+200E,
 * U+200F, U+202A..U+202E, U+2066..U+2069), the word joiner and invisible
 * math operators, the deprecated format controls (U+206A..U+206F, which
 * also alter shaping and mirroring), the Mongolian vowel separator, the
 * interlinear annotation controls, and the BOM.
 *
 * `\t` and `\n` are handled by the caller before this check runs (they
 * get their own, non-binary treatment), and the ZWJ (U+200D) is handled
 * by the caller too, since whether it is kept depends on `keepNewlines`.
 */
function isAlwaysUnsafeCodePoint(code: number): boolean {
  if (code <= 0x1f) return true; // C0 controls (\t and \n excluded by the caller)
  if (code === 0x7f) return true; // DEL
  if (code >= 0x80 && code <= 0x9f) return true; // C1 controls, incl. NEL (U+0085)
  if (code === 0x00ad) return true; // SOFT HYPHEN (invisible unless a line breaks on it)
  if (code === 0x061c) return true; // ARABIC LETTER MARK (bidi control)
  if (code === 0x180e) return true; // MONGOLIAN VOWEL SEPARATOR (invisible)
  if (code === 0x2028 || code === 0x2029) return true; // LINE / PARAGRAPH SEPARATOR
  if (code >= 0x200b && code <= 0x200f && code !== ZERO_WIDTH_JOINER) return true; // ZWSP, ZWNJ, LRM, RLM
  if (code >= 0x202a && code <= 0x202e) return true; // bidi embedding/override (LRE..RLO)
  // One block: word joiner and invisible operators (U+2060..U+2064), the
  // bidi isolates (U+2066..U+2069) and the deprecated format controls
  // (U+206A..U+206F). U+2065 is unassigned and default-ignorable.
  if (code >= 0x2060 && code <= 0x206f) return true;
  if (code === 0xfeff) return true; // BOM / zero-width no-break space
  if (code >= 0xfff9 && code <= 0xfffb) return true; // interlinear annotation controls
  return false;
}

/**
 * Removes unsafe and invisible characters from `value`.
 *
 * - `\t` is folded into a single space rather than removed: unlike the
 *   rest of this list it is ordinary, harmless whitespace.
 * - `\n` is removed unless `options.keepNewlines` is true.
 * - The zero-width joiner (U+200D) is a deliberate, documented tradeoff:
 *   it is removed from single-line fields (`keepNewlines: false`) —
 *   names and subject material have no legitimate use for it and it is
 *   a known homograph/spoofing building block there — but it is KEPT
 *   when `keepNewlines` is true, i.e. in the message body, so a real
 *   ZWJ emoji sequence a visitor types (family emoji, profession emoji
 *   with a skin-tone/gender modifier, etc.) is not broken apart. Every
 *   other bidi/invisible control is stripped in both modes.
 *
 * This function does not judge whether the *content* is a valid email,
 * name, etc. (that is `validate.ts`'s job); it only removes characters
 * that are unsafe or invisible regardless of context.
 */
export function stripUnsafeCharacters(
  value: string,
  options: StripUnsafeCharactersOptions,
): string {
  let result = '';

  for (const char of value) {
    if (char === '\t') {
      result += ' ';
      continue;
    }

    if (char === '\n') {
      if (options.keepNewlines) result += char;
      continue;
    }

    const code = char.codePointAt(0) ?? 0;

    if (code === ZERO_WIDTH_JOINER) {
      if (options.keepNewlines) result += char;
      continue;
    }

    if (isAlwaysUnsafeCodePoint(code)) {
      continue;
    }

    result += char;
  }

  return result;
}
