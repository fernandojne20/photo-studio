import { describe, expect, it } from 'vitest';
import {
  hasCssImport,
  countImages,
  extractAllFontFaceUrls,
  extractCssFontFaceUrls,
  extractDynamicImportSpecifiers,
  extractEagerScriptEntries,
  extractPreloadedFontHrefs,
  extractStaticImportSpecifiers,
  extractStylesheetHrefs,
  resolveSpecifier,
} from './build-measurement';

describe('extractEagerScriptEntries', () => {
  it('finds a module script src regardless of attribute order, flagged as a module', () => {
    expect(extractEagerScriptEntries('<script src="/_astro/a.js" type="module"></script>')).toEqual(
      [{ src: '/_astro/a.js', isModule: true }],
    );
  });

  it('finds a classic script with no type at all, flagged as not a module', () => {
    expect(extractEagerScriptEntries('<script src="/a.js"></script>')).toEqual([
      { src: '/a.js', isModule: false },
    ]);
  });

  it('finds a classic script deferred or run async', () => {
    expect(extractEagerScriptEntries('<script src="/a.js" defer></script>')).toEqual([
      { src: '/a.js', isModule: false },
    ]);
    expect(extractEagerScriptEntries('<script src="/a.js" async></script>')).toEqual([
      { src: '/a.js', isModule: false },
    ]);
  });

  it('finds a classic script with an explicit text/javascript type', () => {
    expect(
      extractEagerScriptEntries('<script src="/a.js" type="text/javascript"></script>'),
    ).toEqual([{ src: '/a.js', isModule: false }]);
  });

  it('finds every executable script on the page, in document order', () => {
    const html =
      '<script type="module" src="/a.js"></script><script src="/b.js"></script>' +
      '<script type="module" src="/c.js"></script>';
    expect(extractEagerScriptEntries(html)).toEqual([
      { src: '/a.js', isModule: true },
      { src: '/b.js', isModule: false },
      { src: '/c.js', isModule: true },
    ]);
  });

  it('ignores importmap and speculationrules: never fetched scripts', () => {
    expect(extractEagerScriptEntries('<script type="importmap" src="/a.json"></script>')).toEqual(
      [],
    );
    expect(
      extractEagerScriptEntries('<script type="speculationrules" src="/a.json"></script>'),
    ).toEqual([]);
  });

  it('ignores a script with no src', () => {
    expect(extractEagerScriptEntries('<script type="module">import("/a.js");</script>')).toEqual(
      [],
    );
  });

  it('does not crash on a cross-origin script, and excludes it from the eager set', () => {
    expect(extractEagerScriptEntries('<script src="https://evil.test/x.js"></script>')).toEqual([]);
    expect(extractEagerScriptEntries('<script src="//evil.test/x.js"></script>')).toEqual([]);
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

describe('extractCssFontFaceUrls', () => {
  it('resolves a relative url against the stylesheet own directory, not the page', () => {
    const css = '@font-face{font-family:X;src:url("fonts/a.woff2") format("woff2");}';
    expect(extractCssFontFaceUrls(css, '/_astro/style.css')).toEqual(['/_astro/fonts/a.woff2']);
  });

  it('resolves ../ against the stylesheet directory', () => {
    const css = '@font-face{font-family:X;src:url(../fonts/a.woff2);}';
    expect(extractCssFontFaceUrls(css, '/_astro/style.css')).toEqual(['/fonts/a.woff2']);
  });

  it('leaves a root-absolute url unresolved (never doubled against the css directory)', () => {
    const css = '@font-face{font-family:X;src:url("/_astro/fonts/a.woff2");}';
    expect(extractCssFontFaceUrls(css, '/_astro/style.css')).toEqual(['/_astro/fonts/a.woff2']);
  });

  it('names no file for a font that is not a file of this site', () => {
    const css =
      '@font-face{src:url("https://fonts.example/a.woff2")}@font-face{src:url(//cdn.test/b.woff2)}' +
      '@font-face{src:url(data:font/woff2;base64,AAAA)}';
    expect(extractCssFontFaceUrls(css, '/_astro/style.css')).toEqual([]);
  });

  it('drops a query and a fragment, which are not part of the file name', () => {
    const css = '@font-face{src:url("fonts/icons.woff2?v=4.7.0#iefix") format("woff2")}';
    expect(extractCssFontFaceUrls(css, '/vendor/icons.css')).toEqual(['/vendor/fonts/icons.woff2']);
  });

  it('reads CSS names in any case', () => {
    const css = '@FONT-FACE{src:URL(c.woff2)}';
    expect(extractCssFontFaceUrls(css, '/css/site.css')).toEqual(['/css/c.woff2']);
  });

  it('reads a stylesheet that is not minified', () => {
    const css = '@font-face {\n  font-family: X;\n  src: url( "a.woff2" ) format("woff2");\n}\n';
    expect(extractCssFontFaceUrls(css, '/css/site.css')).toEqual(['/css/a.woff2']);
  });

  it('collects urls from several @font-face blocks in the same file, deduplicated', () => {
    const css =
      '@font-face{font-family:X;src:url("a.woff2");}@font-face{font-family:Y;src:url("a.woff2");}';
    expect(extractCssFontFaceUrls(css, '/_astro/style.css')).toEqual(['/_astro/a.woff2']);
  });
});

describe('a URL becomes a file name without its query or fragment', () => {
  it('for classic and module scripts', () => {
    const html =
      '<script src="/vendor.js?v=1"></script><script type="module" src="/_astro/a.js#x"></script>';
    expect(extractEagerScriptEntries(html)).toEqual([
      { src: '/vendor.js', isModule: false },
      { src: '/_astro/a.js', isModule: true },
    ]);
  });

  it('for stylesheets and preloaded fonts', () => {
    expect(extractStylesheetHrefs('<link rel="stylesheet" href="/css/site.css?v=2">')).toEqual([
      '/css/site.css',
    ]);
    expect(
      extractPreloadedFontHrefs('<link rel="preload" as="font" href="/fonts/a.woff2?v=3#x">'),
    ).toEqual(['/fonts/a.woff2']);
  });
});

describe('hasCssImport', () => {
  it('sees an @import in any case, and not one inside a comment', () => {
    expect(hasCssImport('@import url("fonts.css");body{margin:0}')).toBe(true);
    expect(hasCssImport('@IMPORT "fonts.css";')).toBe(true);
    expect(hasCssImport('/* @import "old.css"; */body{margin:0}')).toBe(false);
    expect(hasCssImport('.important{color:red}')).toBe(false);
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
