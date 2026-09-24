/**
 * Pure assertions on the built Content Security Policy (PD-04/PD-06), in
 * three layers. A FLOOR that is written here and nowhere else, so weakening
 * the declared policy cannot also weaken its check. A comparison with the
 * declared policy in `security-headers.mjs`, directive by directive. And
 * the relation between the pages and `_headers`: the header is the pages'
 * policy plus `frame-ancestors`, with exactly the union of their hashes.
 * Tokens are compared as sets and a repeated directive is rejected, because
 * browsers ignore token order and enforce only the FIRST of two directives.
 */

import { createHash } from 'node:crypto';
import { readLiveElements } from './built-dom';
import type { LiveElement } from './built-dom';
import { getHeader, parseHeadersFile } from './headers-file';
import { CSP_DIRECTIVES, SCRIPT_RESOURCES, STYLE_RESOURCES } from './security-headers.mjs';

interface CspDirective {
  name: string;
  tokens: string[];
}

type StyleResource = string | { resource: string; kind: string };

const REQUIRED_HEADER_NAMES: readonly string[] = [
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'X-Frame-Options',
  'Cross-Origin-Opener-Policy',
  'Strict-Transport-Security',
];

function isHashToken(token: string): boolean {
  return /^'sha(256|384|512)-/.test(token);
}

function nonHashTokens(tokens: readonly string[]): string[] {
  return tokens.filter((token) => !isHashToken(token));
}

function sameTokenSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((token) => right.has(token));
}

function describeTokens(tokens: readonly string[]): string {
  return [...tokens].sort().join(' ');
}

/** Directive names that appear more than once: browsers enforce only the first. */
function duplicateDirectiveNames(directives: readonly CspDirective[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { name } of directives) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  return [...duplicates];
}

/** The only script sources this site may ever allow, besides hashes. */
const ALLOWED_SCRIPT_SOURCES: ReadonlySet<string> = new Set([
  "'self'",
  'https://challenges.cloudflare.com',
]);

const LOCKED_DIRECTIVES: readonly string[] = ['default-src', 'object-src', 'base-uri'];

/** Independent of `security-headers.mjs` on purpose (see the file header). */
function checkPolicyFloor(directives: readonly CspDirective[], where: string): string[] {
  const problems: string[] = [];
  for (const name of duplicateDirectiveNames(directives)) {
    problems.push(`${where}: "${name}" appears more than once; browsers enforce only the first.`);
  }
  // First occurrence wins, as in a browser.
  const byName = new Map<string, string[]>();
  for (const { name, tokens } of directives) if (!byName.has(name)) byName.set(name, tokens);

  for (const name of LOCKED_DIRECTIVES) {
    const tokens = byName.get(name);
    if (!tokens || !sameTokenSet(tokens, ["'none'"]))
      problems.push(`${where}: "${name}" must be 'none'.`);
  }
  const scriptSrc = byName.get('script-src');
  if (!scriptSrc) {
    problems.push(`${where}: missing the "script-src" directive.`);
  } else {
    for (const token of nonHashTokens(scriptSrc)) {
      if (!ALLOWED_SCRIPT_SOURCES.has(token))
        problems.push(`${where}: script-src includes the forbidden token ${token}.`);
    }
  }
  for (const [name, tokens] of byName) {
    if (name !== 'style-src-attr' && tokens.includes("'unsafe-inline'"))
      problems.push(
        `${where}: 'unsafe-inline' is only allowed under style-src-attr, found under "${name}".`,
      );
  }
  return problems;
}

/** `"name tok tok; name2 tok"` -> `[{ name, tokens }, ...]`, in order. */
function parseCspContent(content: string): CspDirective[] {
  return content
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...tokens] = part.split(/\s+/);
      return { name, tokens };
    });
}

/** A browser only obeys a Content-Security-Policy meta that sits in `<head>`. */
function findCspMetaContents(elements: readonly LiveElement[]): {
  inHead: string[];
  outsideHead: number;
} {
  const metas = elements.filter(
    (element) =>
      element.name === 'meta' &&
      element.attrs['http-equiv']?.toLowerCase() === 'content-security-policy',
  );
  return {
    inHead: metas.filter((meta) => meta.inHead).map((meta) => meta.attrs.content ?? ''),
    outsideHead: metas.filter((meta) => !meta.inHead).length,
  };
}

/** Directive name -> expected non-hash tokens, derived straight from `security-headers.mjs`. */
function buildExpectedDirectives(): Map<string, string[]> {
  const expected = new Map<string, string[]>();
  for (const { name, tokens } of parseCspContent((CSP_DIRECTIVES as string[]).join('; '))) {
    expected.set(name, tokens);
  }
  const resources: StyleResource[] = SCRIPT_RESOURCES;
  expected.set(
    'script-src',
    resources.filter((r): r is string => typeof r === 'string'),
  );
  const styleResources: StyleResource[] = STYLE_RESOURCES;
  expected.set(
    'style-src',
    styleResources.filter((r): r is string => typeof r === 'string'),
  );
  expected.set(
    'style-src-attr',
    styleResources
      .filter(
        (r): r is { resource: string; kind: string } =>
          typeof r === 'object' && r.kind === 'attribute',
      )
      .map((r) => r.resource),
  );
  return expected;
}

/** Every directive name and non-hash token must match the source exactly: nothing missing, nothing extra, nothing widened. */
function compareToSource(actual: CspDirective[], where: string): string[] {
  const problems: string[] = [];
  const expected = buildExpectedDirectives();
  const actualByName = new Map<string, string[]>();
  for (const { name, tokens } of actual)
    if (!actualByName.has(name)) actualByName.set(name, tokens);

  for (const name of expected.keys()) {
    if (!actualByName.has(name)) problems.push(`${where}: missing the "${name}" directive.`);
  }
  for (const name of actualByName.keys()) {
    if (!expected.has(name)) problems.push(`${where}: unexpected extra directive "${name}".`);
  }
  for (const [name, expectedTokens] of expected) {
    const actualTokens = actualByName.get(name);
    if (!actualTokens) continue;
    const nonHash = nonHashTokens(actualTokens);
    if (!sameTokenSet(nonHash, expectedTokens))
      problems.push(
        `${where}: "${name}" must be "${describeTokens(expectedTokens)}", found "${describeTokens(nonHash)}".`,
      );
  }
  return problems;
}

/** The header is generated FROM the pages: same non-hash tokens, exactly the union of their hashes, frame-ancestors the only addition. */
function compareHeaderToPages(
  header: CspDirective[],
  pages: readonly CspDirective[][],
  where: string,
): string[] {
  const problems: string[] = [];
  const headerByName = new Map<string, string[]>();
  for (const { name, tokens } of header)
    if (!headerByName.has(name)) headerByName.set(name, tokens);
  const pageHashes = new Map<string, Set<string>>();

  for (const [pageIndex, directives] of pages.entries()) {
    const seen = new Set<string>();
    for (const { name, tokens } of directives) {
      if (seen.has(name)) continue;
      seen.add(name);
      const hashes = pageHashes.get(name) ?? new Set<string>();
      pageHashes.set(name, hashes);
      const headerTokens = headerByName.get(name);
      if (!headerTokens) {
        problems.push(`${where}: page ${pageIndex}'s "${name}" is missing from the header.`);
        continue;
      }
      const pageNonHash = nonHashTokens(tokens);
      const headerNonHash = nonHashTokens(headerTokens);
      if (!sameTokenSet(pageNonHash, headerNonHash))
        problems.push(
          `${where}: page ${pageIndex}'s "${name}" ("${describeTokens(pageNonHash)}") differs from the header's ("${describeTokens(headerNonHash)}").`,
        );
      for (const hash of tokens.filter(isHashToken)) {
        hashes.add(hash);
        if (!headerTokens.includes(hash))
          problems.push(
            `${where}: page ${pageIndex}'s "${name}" hash ${hash} is missing from the header.`,
          );
      }
    }
  }

  for (const [name, tokens] of headerByName) {
    const known = pageHashes.get(name) ?? new Set<string>();
    for (const hash of tokens.filter(isHashToken)) {
      if (!known.has(hash))
        problems.push(`${where}: "${name}" carries the hash ${hash}, which no page declares.`);
    }
  }

  const extraNames = [...headerByName.keys()].filter((name) => !pageHashes.has(name));
  if (extraNames.length !== 1 || extraNames[0] !== 'frame-ancestors') {
    problems.push(
      `${where}: its only directive beyond the pages' must be frame-ancestors, found extra ${JSON.stringify(extraNames)}.`,
    );
  } else if (!sameTokenSet(headerByName.get('frame-ancestors') ?? [], ["'none'"])) {
    problems.push(`${where}: frame-ancestors must be 'none'.`);
  }

  return problems;
}

/** The HTML standard's JavaScript MIME type essence strings, the whole closed list. */
const JAVASCRIPT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

/** Not JavaScript MIME types, yet inline content the policy has to allow. */
const OTHER_CHECKED_SCRIPT_TYPES: ReadonlySet<string> = new Set([
  'module',
  'importmap',
  'speculationrules',
]);

/**
 * Follows the standard's "script block's type string": an empty or absent
 * `type` is JavaScript unless a non-empty `language` says otherwise. A
 * parameter after `;` is dropped, because asking for a hash once too often
 * is the safe side. Any other type is a data block, which never runs.
 */
function inlineScriptNeedsHash(attrs: Record<string, string>): boolean {
  if (attrs.src !== undefined) return false;
  const { type, language } = attrs;
  let typeString = 'text/javascript';
  if (type !== undefined && type !== '') typeString = type.split(';')[0].trim().toLowerCase();
  else if (type === undefined && language) typeString = `text/${language.toLowerCase()}`;
  return JAVASCRIPT_MIME_TYPES.has(typeString) || OTHER_CHECKED_SCRIPT_TYPES.has(typeString);
}

function sha256Token(content: string): string {
  return `'sha256-${createHash('sha256').update(content).digest('base64')}'`;
}

/**
 * Every inline script that executes and every inline style must be allowed
 * by a hash of the page's own policy. If the hashes were ever dropped, the
 * two policies would still agree with each other and the browser would
 * block the page's own code. Data blocks such as JSON-LD are not executed.
 */
function checkInlineContentHashes(
  elements: readonly LiveElement[],
  directives: readonly CspDirective[],
  where: string,
): string[] {
  const problems: string[] = [];
  const tokensOf = (name: string) =>
    new Set(directives.find((directive) => directive.name === name)?.tokens ?? []);
  const scriptTokens = tokensOf('script-src');
  const styleTokens = tokensOf('style-src');

  const scripts = elements
    .filter((element) => element.name === 'script' && inlineScriptNeedsHash(element.attrs))
    .map((element) => element.text);
  for (const [index, content] of scripts.entries()) {
    if (!scriptTokens.has(sha256Token(content)))
      problems.push(`${where}: inline script ${index} has no matching hash in script-src.`);
  }
  const styles = elements
    .filter((element) => element.name === 'style')
    .map((element) => element.text);
  for (const [index, content] of styles.entries()) {
    if (!styleTokens.has(sha256Token(content)))
      problems.push(`${where}: inline style ${index} has no matching hash in style-src.`);
  }
  return problems;
}

/** Every security header, and the policy itself, must sit under `_headers`' `/*` rule, not only `/_astro/*`. */
function checkHeadersScope(headersText: string): string[] {
  const problems: string[] = [];
  const staticRules = parseHeadersFile(headersText).filter((rule) => rule.path === '/*');
  const [staticRule] = staticRules;
  if (!staticRule) return ['_headers has no /* rule.'];
  if (staticRules.length > 1)
    problems.push(`_headers must have exactly one /* rule, found ${staticRules.length}.`);
  // `! Name` under a narrower rule removes, for those paths, a header that /* set.
  if (headersText.split('\n').some((line) => line.trim().startsWith('!')))
    problems.push('_headers must not detach a header (a line starting with "!").');
  for (const name of [...REQUIRED_HEADER_NAMES, 'Content-Security-Policy']) {
    if (getHeader(staticRule, name) === undefined)
      problems.push(`_headers' /* rule is missing the ${name} header.`);
  }
  return problems;
}

/**
 * Asserts the Content Security Policy across every given page's `<meta>`
 * AND in `_headers`. `pageHtmls` should cover every page whose hashes the
 * `_headers` policy unions (homepage and 404 today).
 */
export function checkContentSecurityPolicy(input: {
  pageHtmls: readonly string[];
  headersText: string;
}): string[] {
  const problems: string[] = [];
  const pagesDirectives: CspDirective[][] = [];

  for (const [pageIndex, html] of input.pageHtmls.entries()) {
    const elements = readLiveElements(html);
    const { inHead: contents, outsideHead } = findCspMetaContents(elements);
    if (outsideHead > 0)
      problems.push(
        `page ${pageIndex}: ${outsideHead} Content-Security-Policy <meta> outside <head>, which browsers ignore.`,
      );
    // Browsers enforce EVERY delivered policy, so a second one could block
    // the site while the first still looks compliant.
    if (contents.length > 1)
      problems.push(
        `page ${pageIndex}: ${contents.length} live Content-Security-Policy <meta> tags; there must be exactly one.`,
      );
    const [content] = contents;
    if (!content) {
      problems.push(`page ${pageIndex}: no live Content-Security-Policy <meta> tag.`);
      continue;
    }
    const directives = parseCspContent(content);
    pagesDirectives.push(directives);
    problems.push(...checkPolicyFloor(directives, `page ${pageIndex} policy`));
    problems.push(...checkInlineContentHashes(elements, directives, `page ${pageIndex} policy`));
    problems.push(...compareToSource(directives, `page ${pageIndex} policy`));
  }

  const cspLineCount = input.headersText
    .split('\n')
    .filter((line) => /^\s*Content-Security-Policy:/i.test(line)).length;
  if (cspLineCount !== 1) {
    problems.push(
      `_headers must have exactly one Content-Security-Policy line, found ${cspLineCount}.`,
    );
  } else {
    const staticRule = parseHeadersFile(input.headersText).find((rule) => rule.path === '/*');
    const headerValue = staticRule ? getHeader(staticRule, 'Content-Security-Policy') : undefined;
    if (!headerValue) {
      problems.push("_headers' /* rule has no Content-Security-Policy header.");
    } else {
      const headerDirectives = parseCspContent(headerValue);
      problems.push(...checkPolicyFloor(headerDirectives, '_headers policy'));
      problems.push(...compareHeaderToPages(headerDirectives, pagesDirectives, '_headers policy'));
    }
  }

  problems.push(...checkHeadersScope(input.headersText));
  return problems;
}
