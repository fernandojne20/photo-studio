import { describe, expect, it } from 'vitest';
import {
  findElementContents,
  findTags,
  hasRelToken,
  getHeader,
  parseAttributes,
  parseHeadersFile,
  stripInertMarkup,
} from './built-html';

describe('stripInertMarkup', () => {
  it('removes HTML comments, including a tag hidden inside one', () => {
    const html = '<p>a</p><!-- <meta name="robots" content="noindex, nofollow"> --><p>b</p>';
    expect(stripInertMarkup(html)).toBe('<p>a</p><p>b</p>');
  });

  it('removes a whole <noscript> block, keeping the rest live', () => {
    const html =
      '<meta name="robots" content="index, follow"><noscript><a href="mailto:x@example.com">x</a></noscript>';
    expect(stripInertMarkup(html)).toBe('<meta name="robots" content="index, follow">');
  });

  it('removes a whole <template> block', () => {
    expect(stripInertMarkup('<template><img src="/a.jpg"></template><p>live</p>')).toBe(
      '<p>live</p>',
    );
  });

  it('leaves live data-analytics-event markup untouched', () => {
    const html =
      '<a href="tel:+1" data-analytics-event="phone_click" data-analytics-placement="contact">t</a>';
    expect(stripInertMarkup(html)).toBe(html);
  });
});

describe('findTags', () => {
  it('does not truncate on a > inside a quoted attribute value', () => {
    const html = '<img alt="antes > después" width="10" height="10">';
    expect(findTags(html, ['img'])).toEqual([html]);
  });

  it('does not truncate on markup-looking text inside an attribute value', () => {
    const html = '<img alt="Foto &lt;script&gt;&quot;&lt;/script&gt;" width="10" height="10">';
    expect(findTags(html, ['img'])).toEqual([html]);
  });

  it('matches attributes in single quotes', () => {
    const html = "<meta name='robots' content='noindex, nofollow'>";
    expect(findTags(html, ['meta'])).toEqual([html]);
  });

  it('matches whatever order the attributes are written in', () => {
    const html = '<img height="10" src="/a.jpg" width="10" alt="x">';
    expect(findTags(html, ['img'])).toEqual([html]);
  });

  it('matches an uppercase tag name and scheme case-insensitively', () => {
    const html = '<A HREF="MAILTO:X@EXAMPLE.COM">x</A>';
    expect(findTags(html, ['a'])).toEqual(['<A HREF="MAILTO:X@EXAMPLE.COM">']);
  });

  it('matches across a line break inside the tag', () => {
    const html = '<link\n  rel="canonical"\n  href="https://x.test/">';
    expect(findTags(html, ['link'])).toEqual([html]);
  });

  it('never matches a tag hidden inside a comment', () => {
    const html = '<!-- <img src="/a.jpg" width="1" height="1"> --><p>text</p>';
    expect(findTags(stripInertMarkup(html), ['img'])).toEqual([]);
  });

  it('never matches a tag whose only occurrence is inside <noscript>', () => {
    const html = '<noscript><meta name="robots" content="noindex, nofollow"></noscript>';
    expect(findTags(stripInertMarkup(html), ['meta'])).toEqual([]);
  });

  it('matches every tag when no name filter is given', () => {
    const html = '<p>a</p><a href="/">b</a>';
    expect(findTags(html)).toEqual(['<p>', '<a href="/">']);
  });

  it('finds a Content-Security-Policy meta tag by http-equiv', () => {
    const html = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">';
    expect(findTags(html, ['meta'])).toEqual([html]);
  });
});

describe('findElementContents', () => {
  it('reads JSON-LD script content, unaffected by braces or quotes inside it', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Organization","name":"a \\"b\\""}</script>';
    const [content] = findElementContents(
      html,
      ['script'],
      (attrs) => attrs.type === 'application/ld+json',
    );
    expect(JSON.parse(content)).toEqual({ '@type': 'Organization', name: 'a "b"' });
  });

  it('skips a script whose type does not match the predicate', () => {
    const html = '<script type="module" src="/a.js"></script>';
    expect(
      findElementContents(html, ['script'], (attrs) => attrs.type === 'application/ld+json'),
    ).toEqual([]);
  });

  it('reads multiple <style> blocks in document order', () => {
    const html = '<style>a{color:red}</style><style>b{color:blue}</style>';
    expect(findElementContents(html, ['style'])).toEqual(['a{color:red}', 'b{color:blue}']);
  });
});

describe('parseAttributes', () => {
  it('reads double-quoted values, decoding entities', () => {
    expect(parseAttributes('<img alt="antes &gt; despu&eacute;s" width="10">').alt).toBe(
      'antes > despu&eacute;s',
    );
  });

  it('reads single-quoted values', () => {
    expect(parseAttributes("<meta name='robots' content='noindex, nofollow'>")).toEqual({
      name: 'robots',
      content: 'noindex, nofollow',
    });
  });

  it('is insensitive to attribute name case', () => {
    expect(parseAttributes('<META NAME="robots" CONTENT="index, follow">')).toEqual({
      name: 'robots',
      content: 'index, follow',
    });
  });

  it('decodes &quot;, &amp;, &lt;, &gt; and &#39;', () => {
    expect(parseAttributes('<img alt="&quot;a&quot; &amp; &lt;b&gt; &#39;c&#39;">').alt).toBe(
      '"a" & <b> \'c\'',
    );
  });

  it('is unaffected by attribute order', () => {
    expect(parseAttributes('<img height="10" src="/a.jpg" width="10">')).toEqual({
      height: '10',
      src: '/a.jpg',
      width: '10',
    });
  });

  it('reads data-analytics-event and data-analytics-placement', () => {
    expect(
      parseAttributes(
        '<a href="tel:+1" data-analytics-event="phone_click" data-analytics-placement="contact">',
      ),
    ).toEqual({
      href: 'tel:+1',
      'data-analytics-event': 'phone_click',
      'data-analytics-placement': 'contact',
    });
  });

  it('treats a valueless attribute as present with an empty value', () => {
    expect(parseAttributes('<input disabled>')).toEqual({ disabled: '' });
  });
});

const HEADERS_TEXT = [
  '/_astro/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/*',
  '  X-Content-Type-Options: nosniff',
  "  Content-Security-Policy: default-src 'none'; img-src 'self' https://cdn.sanity.io",
  '  X-Robots-Tag: noindex, nofollow',
  '',
].join('\n');

describe('parseHeadersFile', () => {
  it('groups headers under their path pattern', () => {
    const rules = parseHeadersFile(HEADERS_TEXT);
    expect(rules).toEqual([
      { path: '/_astro/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
      {
        path: '/*',
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; img-src 'self' https://cdn.sanity.io",
          'X-Robots-Tag': 'noindex, nofollow',
        },
      },
    ]);
  });

  it('keeps embedded colons in a header value intact', () => {
    const rules = parseHeadersFile(
      '/*\n  Content-Security-Policy: frame-src https://x.test:8443\n',
    );
    expect(rules[0].headers['Content-Security-Policy']).toBe('frame-src https://x.test:8443');
  });
});

describe('getHeader', () => {
  it('looks up a header name case-insensitively', () => {
    const [, staticRule] = parseHeadersFile(HEADERS_TEXT);
    expect(getHeader(staticRule, 'x-robots-tag')).toBe('noindex, nofollow');
  });

  it('is undefined when the header is not on that rule', () => {
    const [astroRule] = parseHeadersFile(HEADERS_TEXT);
    expect(getHeader(astroRule, 'X-Robots-Tag')).toBeUndefined();
  });
});

describe('editor text can never pose as markup', () => {
  const realLink =
    '<a href="https://wa.me/1" data-analytics-event="whatsapp_click" data-analytics-placement="hero">';

  it('does not return a tag written inside the attribute of another tag', () => {
    const html = `<img alt="Foto <a href=mailto:x@y.z> de estudio" width="1" height="1">${realLink}wa</a>`;
    expect(findTags(stripInertMarkup(html), ['a'])).toEqual([realLink]);
  });

  it('does not start a comment inside an attribute value', () => {
    const html = `<img alt="antes <!-- nota" width="1">${realLink}wa</a><p>fin --></p>`;
    const live = stripInertMarkup(html);
    expect(findTags(live, ['a'])).toEqual([realLink]);
    expect(findTags(live, ['p'])).toEqual(['<p>']);
  });

  it('does not treat the word noscript inside an attribute as an element', () => {
    const html = `<img alt="<noscript> texto" width="1"><meta name="robots" content="index, follow"><p></noscript></p>`;
    expect(findTags(stripInertMarkup(html), ['meta'])).toEqual([
      '<meta name="robots" content="index, follow">',
    ]);
  });

  it('does not read tags out of a script or a style', () => {
    const html =
      `<script type="module">const s = "<a href='tel:1'>x</a> <!-- x -->";</script>` +
      `<style>.a::after{content:"<img src=x>"}</style>${realLink}wa</a>`;
    const live = stripInertMarkup(html);
    expect(findTags(live, ['a'])).toEqual([realLink]);
    expect(findTags(live, ['img'])).toEqual([]);
  });

  it('removes a comment that contains tags, and an unterminated comment to the end', () => {
    expect(
      findTags(stripInertMarkup('<!-- <meta name="robots" content="noindex"> --><p>'), ['meta']),
    ).toEqual([]);
    expect(stripInertMarkup('<p>a</p><!-- never closed <p>b</p>')).toBe('<p>a</p>');
  });

  it('returns the raw content of a script even when it contains a closing-tag lookalike in a quoted attribute', () => {
    const html = '<script type="application/ld+json" data-note="</script>">{"a":1}</script>';
    expect(findElementContents(html, ['script'])).toEqual(['{"a":1}']);
  });
});

describe('the scan is linear and follows the HTML tokenizer', () => {
  it('finishes at once on many unclosed quoted values (corrupted output)', () => {
    expect(findTags('<a href="'.repeat(200_000))).toEqual([]);
  });

  it('stops at a tag that never closes, as a browser does', () => {
    expect(findTags('<p><a href="x><p><meta name=robots content=noindex>')).toEqual(['<p>']);
  });

  it('reads attribute soup the way the HTML tokenizer pairs its quotes', () => {
    const soup = '<a href="x><p><meta name="robots" content="noindex">';
    expect(findTags(`<p>${soup}`)).toEqual(['<p>', soup]);
  });

  it('treats a quote that does not follow = as an ordinary character', () => {
    expect(findTags("<a title=it's><p>", ['p'])).toEqual(['<p>']);
  });

  it('sees tag names with an underscore, a colon or a dot', () => {
    expect(findTags('<my_tag><svg:rect><x.y><p>')).toEqual([
      '<my_tag>',
      '<svg:rect>',
      '<x.y>',
      '<p>',
    ]);
  });

  it('ignores a < that does not start a tag', () => {
    expect(findTags('a < b <3 </p> <!doctype html><p>')).toEqual(['<p>']);
  });
});

describe('details of the HTML tokenizer that checks rely on', () => {
  it('does not end a script at a longer closing name such as </scripture>', () => {
    const html = `<script>const s = "</scripture><a href='mailto:x'>";</script><p>`;
    expect(findTags(html)).toEqual(['<script>', '<p>']);
    expect(findElementContents(html, ['script'])).toEqual([
      `const s = "</scripture><a href='mailto:x'>";`,
    ]);
  });

  it('ends a script at </script followed by whitespace, a slash or >', () => {
    expect(
      findElementContents('<script>a</script ><script>b</script/><script>c</SCRIPT>', ['script']),
    ).toEqual(['a', 'b', 'c']);
  });

  it('decodes decimal, hexadecimal and named character references in attribute values', () => {
    expect(
      parseAttributes(
        '<a href="mail&#116;o&colon;x&#x40;example.com" title="a &amp; b &lt;c&gt;">',
      ),
    ).toEqual({
      href: 'mailto:x@example.com',
      title: 'a & b <c>',
    });
  });

  it('decodes &bsol;, which a browser then reads as a slash in a URL', () => {
    expect(parseAttributes('<script src="&bsol;&bsol;evil.test/x.js">').src).toBe(
      '\\\\evil.test/x.js',
    );
  });

  it.each(['iframe', 'noembed', 'noframes', 'xmp'])(
    'does not read tags out of <%s>, whose content is text',
    (name) => {
      const html = `<${name}><a href="mailto:x@example.com">fallback</a><img src="x"></${name}><p>`;
      expect(findTags(html)).toEqual([`<${name}>`, '<p>']);
    },
  );

  it('reads nothing after <plaintext>, which never closes', () => {
    expect(findTags('<p><plaintext><a href="mailto:x@example.com">x</a></plaintext><img>')).toEqual(
      ['<p>', '<plaintext>'],
    );
  });

  it('leaves an unknown or invalid reference as written', () => {
    expect(parseAttributes('<a title="&bogus; &#0; &#x110000;">').title).toBe(
      '&bogus; &#0; &#x110000;',
    );
  });
});

describe('attributes as the HTML parser reads them', () => {
  it('decodes a numeric character reference without its semicolon', () => {
    expect(parseAttributes('<script src="&#104ttps://evil.test/x.js">').src).toBe(
      'https://evil.test/x.js',
    );
    expect(parseAttributes('<a href="mail&#x74o:x@example.com">').href).toBe(
      'mailto:x@example.com',
    );
  });

  it('does not decode a named reference without its semicolon', () => {
    expect(parseAttributes('<a href="/x?a=1&amp=2&colon">').href).toBe('/x?a=1&amp=2&colon');
  });

  it('keeps the first of two attributes with the same name', () => {
    expect(parseAttributes(`<meta content="first" CONTENT="second">`).content).toBe('first');
  });

  it('reads rel as a token list, whatever the case or spacing', () => {
    expect(hasRelToken(parseAttributes('<link rel="alternate  StyleSheet">'), 'stylesheet')).toBe(
      true,
    );
    expect(hasRelToken(parseAttributes('<link rel="stylesheets">'), 'stylesheet')).toBe(false);
    expect(hasRelToken(parseAttributes('<link href="/x">'), 'stylesheet')).toBe(false);
  });
});
