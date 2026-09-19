/**
 * Shared, pure reading of built HTML for every check and measurement
 * (PD-06). Astro does not escape `<` or `>` inside attribute values, and
 * alt text is editor content, so the document is read in ONE left-to-right
 * pass: a comment, an element whose content is not markup, or a quote-aware
 * tag. Whatever sits inside an attribute value or a script is consumed by
 * its token and can never be mistaken for a tag or a comment of its own.
 */

/** Elements whose content the HTML parser does not read as markup. */
const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'title',
  'iframe',
  'noembed',
  'noframes',
  'xmp',
  'plaintext',
]);

/** Never painted or executed by default, so never evidence of anything. */
const INERT_ELEMENTS: ReadonlySet<string> = new Set(['noscript', 'template']);

/** A tag name runs to whitespace, `/` or `>`, as in the HTML tokenizer: `<script@x>` is not a script. */
const TAG_NAME = /^[a-zA-Z][^\s/>]*/;

interface Token {
  kind: 'comment' | 'element' | 'tag';
  /** Lowercased tag name; empty for a comment. */
  name: string;
  /** The opening tag; empty for a comment. */
  tag: string;
  /** Raw content of an `element` token; empty otherwise. */
  content: string;
  start: number;
  end: number;
}

/**
 * Index of the `>` that closes the tag whose name ends at `from`, or -1.
 * A quote only opens a value right after `=`, as in the HTML tokenizer; a
 * quote anywhere else is an ordinary character.
 */
function findTagEnd(html: string, from: number): number {
  let quote = '';
  let expectValue = false;
  for (let i = from; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '>') return i;
    if (char === '=') {
      expectValue = true;
    } else if (expectValue && (char === '"' || char === "'")) {
      quote = char;
      expectValue = false;
    } else if (!/\s/.test(char)) {
      expectValue = false;
    }
  }
  return -1;
}

/**
 * Start of `</name` followed by whitespace, `/` or `>`, or -1. A longer
 * name such as `</scripture>` inside a script does not end the element.
 */
function findClosingTag(lower: string, name: string, from: number): number {
  const needle = `</${name}`;
  let index = lower.indexOf(needle, from);
  while (index !== -1) {
    const next = lower[index + needle.length];
    if (next === undefined || next === '>' || next === '/' || /\s/.test(next)) return index;
    index = lower.indexOf(needle, index + 1);
  }
  return -1;
}

/**
 * One linear pass. A tag that never closes ends the scan, as it does in a
 * browser, where the rest of the document is swallowed by that tag; trying
 * every later `<` instead made corrupted input take quadratic time.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start === -1) break;
    if (html.startsWith('<!--', start)) {
      const close = html.indexOf('-->', start + 4);
      const end = close === -1 ? html.length : close + 3;
      tokens.push({ kind: 'comment', name: '', tag: '', content: '', start, end });
      cursor = end;
      continue;
    }
    const nameMatch = TAG_NAME.exec(html.slice(start + 1, start + 65));
    if (!nameMatch) {
      cursor = start + 1;
      continue;
    }
    const tagEnd = findTagEnd(html, start + 1 + nameMatch[0].length);
    if (tagEnd === -1) break;
    const name = nameMatch[0].toLowerCase();
    const tag = html.slice(start, tagEnd + 1);
    if (!RAW_TEXT_ELEMENTS.has(name)) {
      tokens.push({ kind: 'tag', name, tag, content: '', start, end: tagEnd + 1 });
      cursor = tagEnd + 1;
      continue;
    }
    // `<plaintext>` has no end: even `</plaintext>` is text to the HTML parser.
    const closeStart = name === 'plaintext' ? -1 : findClosingTag(lower, name, tagEnd + 1);
    const closeEnd = closeStart === -1 ? -1 : html.indexOf('>', closeStart);
    const contentEnd = closeStart === -1 ? html.length : closeStart;
    const end = closeEnd === -1 ? html.length : closeEnd + 1;
    tokens.push({
      kind: 'element',
      name,
      tag,
      content: html.slice(tagEnd + 1, contentEnd),
      start,
      end,
    });
    cursor = end;
  }
  return tokens;
}

/** Removes comments and whole `<noscript>` and `<template>` elements. */
export function stripInertMarkup(html: string): string {
  let result = '';
  let cursor = 0;
  for (const token of tokenize(html)) {
    const inert =
      token.kind === 'comment' || (token.kind === 'element' && INERT_ELEMENTS.has(token.name));
    if (!inert) continue;
    result += html.slice(cursor, token.start);
    cursor = token.end;
  }
  return result + html.slice(cursor);
}

/**
 * Opening tags in document order, optionally restricted by tag name
 * (case-insensitive). Every tag is tokenized before filtering, so text that
 * looks like a tag inside another tag's attribute is never returned.
 */
export function findTags(html: string, names?: readonly string[]): string[] {
  const wanted = names && names.length > 0 ? new Set(names.map((n) => n.toLowerCase())) : undefined;
  return tokenize(html)
    .filter((token) => token.kind !== 'comment' && (!wanted || wanted.has(token.name)))
    .map((token) => token.tag);
}

/** Named references an attribute value can plausibly use; numeric ones are decoded generally. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  quot: '"',
  QUOT: '"',
  amp: '&',
  AMP: '&',
  lt: '<',
  LT: '<',
  gt: '>',
  GT: '>',
  apos: "'",
  colon: ':',
  sol: '/',
  bsol: '\\',
  period: '.',
  commat: '@',
  num: '#',
  quest: '?',
  equals: '=',
  nbsp: String.fromCodePoint(0xa0),
  Tab: String.fromCodePoint(0x9),
  NewLine: String.fromCodePoint(0xa),
};

/** Decodes `&#116;`, `&#x74;` and the named references above, as a browser does before using a value. */
function decodeEntities(value: string): string {
  return value.replace(
    /&(?:(#[xX][0-9a-fA-F]+|#[0-9]+);?|([a-zA-Z]+);)/g,
    (match, numeric: string | undefined, named: string | undefined) => {
      const body = numeric ?? named ?? '';
      if (body[0] !== '#') return NAMED_ENTITIES[body] ?? match;
      const hex = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff;
      return valid ? String.fromCodePoint(codePoint) : match;
    },
  );
}

/** name="value" | name='value' | name=value | name (boolean), any order, name lowercased, value entity-decoded. The FIRST of two attributes with one name wins, as in the HTML parser. */
export function parseAttributes(tag: string): Record<string, string> {
  const body = tag.replace(/^<[a-zA-Z][^\s/>]*/, '').replace(/\/?>$/, '');
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(pattern)) {
    const [, name, dq, sq, bare] = match;
    const raw = dq ?? sq ?? bare ?? '';
    const key = name.toLowerCase();
    if (!(key in attrs)) attrs[key] = decodeEntities(raw);
  }
  return attrs;
}

/**
 * Content of every `script`, `style` or `title` element (the elements whose
 * content is not markup), optionally filtered by its parsed attributes.
 */
export function findElementContents(
  html: string,
  names: readonly string[],
  predicate?: (attrs: Record<string, string>) => boolean,
): string[] {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  return tokenize(html)
    .filter((token) => token.kind === 'element' && wanted.has(token.name))
    .filter((token) => !predicate || predicate(parseAttributes(token.tag)))
    .map((token) => token.content);
}

/** `rel` is a space-separated token list: `rel="alternate stylesheet"` is a stylesheet. */
export function hasRelToken(attrs: Record<string, string>, token: string): boolean {
  return (attrs.rel ?? '').toLowerCase().split(/\s+/).includes(token);
}

export interface HeadersRule {
  path: string;
  /** Header name exactly as written (case as generated); values already trimmed. */
  headers: Record<string, string>;
}

/** Parses a Cloudflare `_headers` file into per-path rules. A blank line ends a rule. */
export function parseHeadersFile(text: string): HeadersRule[] {
  const rules: HeadersRule[] = [];
  let current: HeadersRule | undefined;
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      current = undefined;
      continue;
    }
    if (/^\s/.test(line)) {
      if (!current) continue;
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      current.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      continue;
    }
    current = { path: line.trim(), headers: {} };
    rules.push(current);
  }
  return rules;
}

/** Case-insensitive header lookup within one rule's headers. */
export function getHeader(rule: HeadersRule, name: string): string | undefined {
  const lower = name.toLowerCase();
  const key = Object.keys(rule.headers).find((candidate) => candidate.toLowerCase() === lower);
  return key ? rule.headers[key] : undefined;
}
