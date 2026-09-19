/**
 * Measures the built homepage for the budget table (PD-06): gzip sizes of
 * the HTML, the eager and lazy JavaScript and the stylesheets, and the font
 * bytes the page preloads and references. Only file reading and gzip live
 * here; every string decision (which files those are) is the pure
 * `src/lib/build-measurement.ts`, unit-tested with literal fixtures.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  extractAllFontFaceUrls,
  extractDynamicImportSpecifiers,
  extractModuleScriptEntries,
  extractPreloadedFontHrefs,
  extractStaticImportSpecifiers,
  extractStylesheetHrefs,
  resolveSpecifier,
} from '../src/lib/build-measurement';

/** Walks only static edges from the entry points: what the browser must fetch before the page is interactive. */
function buildEagerJsSet(distClient: string, entries: string[]): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const queue = [...entries];
  while (queue.length > 0) {
    const abs = queue.shift() as string;
    if (files.has(abs)) continue;
    const buffer = readFileSync(join(distClient, abs));
    files.set(abs, buffer);
    for (const spec of extractStaticImportSpecifiers(buffer.toString('utf8'))) {
      queue.push(resolveSpecifier(abs, spec));
    }
  }
  return files;
}

/** Everything reached only through a dynamic `import()` from the eager set (or transitively from there). */
function buildLazyJsSet(distClient: string, eager: Map<string, Buffer>): Map<string, Buffer> {
  const lazy = new Map<string, Buffer>();
  const queue: string[] = [];
  for (const [abs, buffer] of eager) {
    for (const spec of extractDynamicImportSpecifiers(buffer.toString('utf8'))) {
      queue.push(resolveSpecifier(abs, spec));
    }
  }
  while (queue.length > 0) {
    const abs = queue.shift() as string;
    if (eager.has(abs) || lazy.has(abs)) continue;
    const buffer = readFileSync(join(distClient, abs));
    lazy.set(abs, buffer);
    const source = buffer.toString('utf8');
    for (const spec of [
      ...extractStaticImportSpecifiers(source),
      ...extractDynamicImportSpecifiers(source),
    ]) {
      queue.push(resolveSpecifier(abs, spec));
    }
  }
  return lazy;
}

function gzipBytes(buffer: Buffer): number {
  return gzipSync(buffer, { level: 9 }).length;
}

function sumGzip(files: Iterable<Buffer>): number {
  let total = 0;
  for (const buffer of files) total += gzipBytes(buffer);
  return total;
}

/** Keys match the `name` column of `PERFORMANCE_BUDGETS`. */
export function measureBuild(distClient: string, homepageHtml: string): Record<string, number> {
  const entries = extractModuleScriptEntries(homepageHtml);
  const eagerJs = buildEagerJsSet(distClient, entries);
  const lazyJs = buildLazyJsSet(distClient, eagerJs);
  const cssFiles = extractStylesheetHrefs(homepageHtml).map((href) =>
    readFileSync(join(distClient, href)),
  );
  const preloadedFontBytes = extractPreloadedFontHrefs(homepageHtml).reduce(
    (total, href) => total + readFileSync(join(distClient, href)).byteLength,
    0,
  );
  const totalFontBytes = extractAllFontFaceUrls(homepageHtml).reduce(
    (total, href) => total + readFileSync(join(distClient, href)).byteLength,
    0,
  );

  return {
    'homepage-html-gzip': gzipBytes(readFileSync(join(distClient, 'index.html'))),
    'eager-js-gzip': sumGzip(eagerJs.values()),
    'lazy-js-gzip': sumGzip(lazyJs.values()),
    'stylesheets-gzip': sumGzip(cssFiles),
    'eager-js-file-count': eagerJs.size,
    'preloaded-font-bytes': preloadedFontBytes,
    'total-font-bytes': totalFontBytes,
  };
}
