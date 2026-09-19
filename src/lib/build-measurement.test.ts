import { describe, expect, it } from 'vitest';
import {
  countImages,
  extractAllFontFaceUrls,
  extractDynamicImportSpecifiers,
  extractModuleScriptEntries,
  extractPreloadedFontHrefs,
  extractStaticImportSpecifiers,
  extractStylesheetHrefs,
  resolveSpecifier,
} from './build-measurement';

describe('extractModuleScriptEntries', () => {
  it('finds a module script src regardless of attribute order', () => {
    expect(
      extractModuleScriptEntries('<script src="/_astro/a.js" type="module"></script>'),
    ).toEqual(['/_astro/a.js']);
  });

  it('ignores a non-module script', () => {
    expect(extractModuleScriptEntries('<script src="/a.js"></script>')).toEqual([]);
  });

  it('finds every module script on the page', () => {
    const html =
      '<script type="module" src="/a.js"></script><script type="module" src="/b.js"></script>';
    expect(extractModuleScriptEntries(html)).toEqual(['/a.js', '/b.js']);
  });
});

describe('extractStaticImportSpecifiers', () => {
  it('finds a bare from"..." re-export', () => {
    expect(extractStaticImportSpecifiers('export*from"./analytics.js";')).toEqual([
      './analytics.js',
    ]);
  });

  it('finds a side-effect import"..."', () => {
    expect(extractStaticImportSpecifiers('import"./analytics.js";')).toEqual(['./analytics.js']);
  });

  it('never matches a dynamic import()', () => {
    expect(extractStaticImportSpecifiers('import("./lazy.js")')).toEqual([]);
  });
});

describe('extractDynamicImportSpecifiers', () => {
  it('finds a quoted dynamic import', () => {
    expect(extractDynamicImportSpecifiers('import("./lazy.js")')).toEqual(['./lazy.js']);
  });

  it('finds a template-literal dynamic import', () => {
    expect(extractDynamicImportSpecifiers('import(`./lazy.js`)')).toEqual(['./lazy.js']);
  });

  it('never matches a static import', () => {
    expect(extractDynamicImportSpecifiers('import"./eager.js"')).toEqual([]);
  });
});

describe('resolveSpecifier', () => {
  it('resolves a relative specifier against the importer directory', () => {
    expect(resolveSpecifier('/_astro/a.js', './b.js')).toBe('/_astro/b.js');
  });
});

describe('extractStylesheetHrefs', () => {
  it('finds a stylesheet href regardless of attribute order', () => {
    expect(extractStylesheetHrefs('<link href="/_astro/a.css" rel="stylesheet">')).toEqual([
      '/_astro/a.css',
    ]);
  });

  it('reads rel as a token list, for stylesheets and for preloaded fonts', () => {
    expect(extractStylesheetHrefs('<link rel="preload stylesheet" href="/_astro/b.css">')).toEqual([
      '/_astro/b.css',
    ]);
    expect(
      extractPreloadedFontHrefs('<link rel="PRELOAD prefetch" as="font" href="/_astro/f.woff2">'),
    ).toEqual(['/_astro/f.woff2']);
  });

  it('ignores a non-stylesheet link', () => {
    expect(extractStylesheetHrefs('<link rel="icon" href="/favicon.ico">')).toEqual([]);
  });
});

describe('extractPreloadedFontHrefs', () => {
  it('requires both rel=preload and as=font, in any order', () => {
    expect(
      extractPreloadedFontHrefs(
        '<link as="font" href="/_astro/fonts/a.woff2" rel="preload" type="font/woff2">',
      ),
    ).toEqual(['/_astro/fonts/a.woff2']);
  });

  it('ignores a preload for a non-font resource', () => {
    expect(
      extractPreloadedFontHrefs('<link rel="preload" as="style" href="/_astro/a.css">'),
    ).toEqual([]);
  });

  it('ignores a font link that is not preloaded', () => {
    expect(
      extractPreloadedFontHrefs('<link rel="stylesheet" as="font" href="/_astro/fonts/a.woff2">'),
    ).toEqual([]);
  });
});

describe('extractAllFontFaceUrls', () => {
  it('finds the url of a single @font-face block', () => {
    const html =
      '<style>@font-face{font-family:X;src:url("/_astro/fonts/a.woff2") format("woff2");}</style>';
    expect(extractAllFontFaceUrls(html)).toEqual(['/_astro/fonts/a.woff2']);
  });

  it('finds every url of a block with several src URLs', () => {
    const html =
      '<style>@font-face{font-family:X;src:url("/_astro/fonts/a.woff2") format("woff2"),url("/_astro/fonts/a.ttf") format("truetype");}</style>';
    expect(extractAllFontFaceUrls(html)).toEqual(['/_astro/fonts/a.woff2', '/_astro/fonts/a.ttf']);
  });

  it('collects urls across several <style> blocks, deduplicated', () => {
    const html =
      '<style>@font-face{font-family:X;src:url("/_astro/fonts/a.woff2");}</style>' +
      '<style>@font-face{font-family:Y;src:url("/_astro/fonts/b.ttf");}</style>' +
      '<style>@font-face{font-family:Z;src:url("/_astro/fonts/a.woff2");}</style>';
    expect(extractAllFontFaceUrls(html)).toEqual(['/_astro/fonts/a.woff2', '/_astro/fonts/b.ttf']);
  });

  it('never reads a @font-face block hidden inside a comment', () => {
    const html = '<!-- <style>@font-face{font-family:X;src:url("/a.woff2");}</style> -->';
    expect(extractAllFontFaceUrls(html)).toEqual([]);
  });
});

describe('countImages', () => {
  it('counts live images only, whatever their alt text says', () => {
    const html =
      '<img src="/a.jpg" alt="antes > <img src=x> despues"><img src="/b.jpg">' +
      '<!-- <img src="/c.jpg"> --><noscript><img src="/d.jpg"></noscript>';
    expect(countImages(html)).toBe(2);
  });
});
