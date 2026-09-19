/**
 * Pure string helpers for the performance-budget measurement (PD-06):
 * finding the homepage's module script entries, static/dynamic import
 * specifiers inside a built JS chunk, stylesheet and preloaded-font
 * `<link>` hrefs, and the font URLs inside built `@font-face` blocks.
 * `scripts/measure-build.ts` keeps only file reading and gzip; every
 * string decision lives here, unit-tested with literal fixtures.
 */

import { posix } from 'node:path';
import {
  findElementContents,
  findTags,
  hasRelToken,
  parseAttributes,
  stripInertMarkup,
} from './built-html';

/** `<script type="module" src="...">` entries: order-of-attributes-proof via `parseAttributes`. */
export function extractModuleScriptEntries(html: string): string[] {
  const entries: string[] = [];
  for (const attrs of findTags(stripInertMarkup(html), ['script']).map(parseAttributes)) {
    if (attrs.type?.toLowerCase() === 'module' && attrs.src !== undefined) entries.push(attrs.src);
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

/** `<link rel="stylesheet" href="...">` hrefs, whatever order the attributes are written in. */
export function extractStylesheetHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const attrs of findTags(stripInertMarkup(html), ['link']).map(parseAttributes)) {
    // `rel` is a token list: `rel="preload stylesheet"` is a stylesheet too.
    if (hasRelToken(attrs, 'stylesheet') && attrs.href !== undefined) hrefs.push(attrs.href);
  }
  return hrefs;
}

/** `<link rel="preload" as="font" href="...">` hrefs — both `rel` and `as` required, in any order. */
export function extractPreloadedFontHrefs(html: string): string[] {
  const hrefs: string[] = [];
  for (const attrs of findTags(stripInertMarkup(html), ['link']).map(parseAttributes)) {
    if (
      hasRelToken(attrs, 'preload') &&
      attrs.as?.toLowerCase() === 'font' &&
      attrs.href !== undefined
    ) {
      hrefs.push(attrs.href);
    }
  }
  return hrefs;
}

/** Every `url(...)` inside one `@font-face { ... }` block's own CSS text (a block may list several, e.g. woff2+ttf). */
function extractFontFaceUrls(fontFaceBody: string): string[] {
  return [...fontFaceBody.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
}

/** Every font URL referenced by any `@font-face` rule in any inline `<style>` block of the page. */
export function extractAllFontFaceUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const styleContent of findElementContents(stripInertMarkup(html), ['style'])) {
    for (const block of styleContent.matchAll(/@font-face\{([^}]*)\}/g)) {
      for (const url of extractFontFaceUrls(block[1])) urls.add(url);
    }
  }
  return [...urls];
}

/** Number of live `<img>` tags: what the HTML budget scales with. */
export function countImages(html: string): number {
  return findTags(stripInertMarkup(html), ['img']).length;
}
