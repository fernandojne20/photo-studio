/**
 * Pure string helpers for the performance-budget measurement (PD-06/VH-02):
 * finding the homepage's module script entries, static/dynamic import
 * specifiers inside a built JS chunk, stylesheet and preloaded-font
 * `<link>` hrefs, and the font URLs inside built `@font-face` blocks.
 * `scripts/measure-build.ts` keeps only file reading and gzip; every
 * string decision lives here, unit-tested with literal fixtures.
 */

import { posix } from 'node:path';
import { hasRelToken, readLiveElements } from './built-dom';
import { isCrossOrigin } from './resource-url';
import { isExecutableScriptType, scriptTypeString } from './script-type';

/** The file a same-origin URL names: a cache-busting query or a fragment is not part of it. */
function filePathOf(url: string): string {
  return url.replace(/[?#].*$/, '');
}

export interface EagerScriptEntry {
  src: string;
  /** Only a module has static imports to follow. */
  isModule: boolean;
}

/**
 * Every executable external script, classic ones included: `defer` or not, the browser fetches it.
 * A cross-origin one is the hygiene check's problem; here it is skipped so the measuring cannot crash.
 */
export function extractEagerScriptEntries(html: string): EagerScriptEntry[] {
  const entries: EagerScriptEntry[] = [];
  for (const element of readLiveElements(html)) {
    if (element.name !== 'script') continue;
    const { attrs } = element;
    if (attrs.src === undefined || isCrossOrigin(attrs.src)) continue;
    if (!isExecutableScriptType(attrs)) continue;
    entries.push({ src: filePathOf(attrs.src), isModule: scriptTypeString(attrs) === 'module' });
  }
  return entries;
}

/** Bare-specifier static imports/re-exports in a built (minified) JS chunk: `from"./x.js"`, `import"./x.js"`. */
export function extractStaticImportSpecifiers(js: string): string[] {
  const specs = new Set<string>();
  for (const match of js.matchAll(/\bfrom"([^"]+\.js)"/g)) specs.add(match[1]);
  for (const match of js.matchAll(/\bimport"([^"]+\.js)"/g)) specs.add(match[1]);
  return [...specs];
}

/** `import("./x.js")` / `` import(`./x.js`) ``: only these ever become a lazy chunk. */
export function extractDynamicImportSpecifiers(js: string): string[] {
  return [...js.matchAll(/\bimport\(\s*[`"']([^`"']+\.js)[`"']\s*\)/g)].map((match) => match[1]);
}

/** Resolves a chunk-relative specifier against the importing file's own path; every chunk lives flat under `_astro/`. */
export function resolveSpecifier(importerAbsPath: string, spec: string): string {
  return posix.normalize(posix.join(posix.dirname(importerAbsPath), spec));
}

/** `<link rel="stylesheet" href="...">` hrefs. */
export function extractStylesheetHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const element of readLiveElements(html)) {
    if (element.name !== 'link') continue;
    const { attrs } = element;
    // `rel` is a token list: `rel="preload stylesheet"` is a stylesheet too.
    if (hasRelToken(attrs, 'stylesheet') && attrs.href !== undefined)
      hrefs.push(filePathOf(attrs.href));
  }
  return hrefs;
}

/** `<link rel="preload" as="font" href="...">` hrefs — both `rel` and `as` required, in any order. */
export function extractPreloadedFontHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const element of readLiveElements(html)) {
    if (element.name !== 'link') continue;
    const { attrs } = element;
    if (
      hasRelToken(attrs, 'preload') &&
      attrs.as?.toLowerCase() === 'font' &&
      attrs.href !== undefined
    ) {
      hrefs.push(filePathOf(attrs.href));
    }
  }
  return hrefs;
}

/**
 * The font FILES one `@font-face` block names (it may list several, e.g. woff2 and ttf), without a
 * query or fragment. A `data:` font is already inside the stylesheet's bytes; another origin's is not ours.
 */
function extractFontFaceUrls(fontFaceBody: string): string[] {
  return [...fontFaceBody.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)]
    .map((match) => match[1])
    .filter((url) => !isCrossOrigin(url))
    .map(filePathOf);
}

const FONT_FACE_BLOCK = /@font-face\s*\{([^}]*)\}/gi;

/** A rule inside a comment loads nothing. */
function withoutCssComments(cssText: string): string {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every font URL referenced by any `@font-face` rule in any inline `<style>` block of the page. */
export function extractAllFontFaceUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const element of readLiveElements(html)) {
    if (element.name !== 'style') continue;
    for (const block of withoutCssComments(element.text).matchAll(FONT_FACE_BLOCK)) {
      // Relative to the homepage, so the same file is never counted under two spellings.
      for (const url of extractFontFaceUrls(block[1]))
        urls.add(url.startsWith('/') ? url : resolveSpecifier('/index.html', url));
    }
  }
  return [...urls];
}

/** Font files of a linked stylesheet. A relative `url(...)` in a CSS file is relative to THAT file, not to the page. */
export function extractCssFontFaceUrls(cssText: string, cssFilePath: string): string[] {
  const urls = new Set<string>();
  for (const block of withoutCssComments(cssText).matchAll(FONT_FACE_BLOCK)) {
    for (const url of extractFontFaceUrls(block[1])) {
      urls.add(url.startsWith('/') ? url : resolveSpecifier(cssFilePath, url));
    }
  }
  return [...urls];
}

/** An `@import` would load a stylesheet that neither the CSS budget nor the font budget ever reads. */
export function hasCssImport(cssText: string): boolean {
  // Strings are emptied too: `content: "@import"` imports nothing, `@import "x.css"` still does.
  const bare = withoutCssComments(cssText).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  return /@import\b/i.test(bare);
}

/** Number of live `<img>` tags: what the HTML budget scales with. */
export function countImages(html: string): number {
  return readLiveElements(html).filter((element) => element.name === 'img').length;
}
