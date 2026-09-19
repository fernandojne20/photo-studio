import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readLiveElements } from './built-dom';

function names(html: string): string[] {
  return readLiveElements(html).map((element) => element.name);
}

function find(html: string, name: string) {
  return readLiveElements(html).filter((element) => element.name === name);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('editor text can never pose as markup', () => {
  it('does not truncate on a > inside an attribute value', () => {
    const html = '<img alt="antes > después" width="10" height="10">';
    expect(find(html, 'img')).toHaveLength(1);
    expect(find(html, 'img')[0].attrs.alt).toBe('antes > después');
  });

  it('reads a fake link and comment inside alt text as ordinary text, not markup', () => {
    const html = '<img alt="Foto <a href=mailto:x@y.z> y <!-- nota">';
    expect(names(html)).toEqual(['img']);
    expect(find(html, 'a')).toHaveLength(0);
  });

  it('does not treat the word noscript inside an attribute as an element', () => {
    const html = '<meta name="robots" content="<noscript> texto">';
    expect(find(html, 'meta')[0].attrs.content).toBe('<noscript> texto');
    expect(find(html, 'noscript')).toHaveLength(0);
  });
});

describe('comments', () => {
  it('does not read a tag hidden inside a comment as an element', () => {
    const html = '<!-- <meta name="robots" content="noindex"> --><p>text</p>';
    expect(find(html, 'meta')).toHaveLength(0);
    expect(find(html, 'p')).toHaveLength(1);
  });

  it('an unterminated comment swallows the rest of the document', () => {
    const html = '<p>a</p><!-- never closed <p>b</p>';
    expect(find(html, 'p')).toHaveLength(1);
  });

  it('the alternate ending --!> ends the comment', () => {
    const html = '<!-- note --!><script src="https://evil.test/x.js"></script>';
    const scripts = find(html, 'script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].attrs.src).toBe('https://evil.test/x.js');
  });
});

describe('<noscript>', () => {
  it('reads a link and a meta inside <noscript> as text, not as elements', () => {
    const html =
      '<noscript><a href="mailto:x@example.com">x</a><meta name="robots" content="x"></noscript>';
    expect(find(html, 'a')).toHaveLength(0);
    expect(find(html, 'meta')).toHaveLength(0);
    expect(find(html, 'noscript')).toHaveLength(1);
  });
});

describe('<template>', () => {
  it('does not read the content of a <template> as live', () => {
    const html = '<template><img src="/a.jpg"></template><p>live</p>';
    expect(names(html)).toEqual(['template', 'p']);
    expect(find(html, 'img')).toHaveLength(0);
  });
});

describe('raw-text elements', () => {
  it.each(['script', 'style', 'title', 'textarea', 'iframe', 'noembed', 'noframes', 'xmp'])(
    'does not read a tag inside <%s> as an element',
    (tag) => {
      const html = `<${tag}><a href="mailto:x@example.com">fallback</a><img src="x"></${tag}><p>after</p>`;
      expect(find(html, 'a')).toHaveLength(0);
      expect(find(html, 'img')).toHaveLength(0);
      expect(find(html, tag)).toHaveLength(1);
      expect(find(html, 'p')).toHaveLength(1);
    },
  );

  it('does not end a script at a longer closing name such as </scripture>', () => {
    const html = `<script>const s = "</scripture><a href='mailto:x'>";</script><p>after</p>`;
    expect(find(html, 'a')).toHaveLength(0);
    expect(find(html, 'script')).toHaveLength(1);
    expect(find(html, 'script')[0].text).toBe(`const s = "</scripture><a href='mailto:x'>";`);
    expect(find(html, 'p')).toHaveLength(1);
  });

  it('ends a script at </script followed by whitespace, a slash, or >, case-insensitively', () => {
    const html = '<script>a</script ><script>b</script/><script>c</SCRIPT>';
    expect(find(html, 'script').map((element) => element.text)).toEqual(['a', 'b', 'c']);
  });

  it('never ends <plaintext>, so nothing after it is live', () => {
    const html = '<p>before</p><plaintext><a href="mailto:x@example.com">x</a></plaintext><img>';
    expect(names(html)).toEqual(['p', 'plaintext']);
  });
});

describe('tag names', () => {
  it('a tag name runs to whitespace, / or >, so <script@x> is not a script', () => {
    const html = '<script@x><script src="x.js"></script>';
    expect(names(html).filter((name) => name.startsWith('script'))).toEqual(['script@x', 'script']);
    expect(find(html, 'script')[0].attrs.src).toBe('x.js');
  });

  it('reads tag names with an underscore, a colon and a dot', () => {
    const html = '<my_tag></my_tag><svg-rect></svg-rect><x.y></x.y>';
    expect(names(html)).toEqual(['my_tag', 'svg-rect', 'x.y']);
  });

  it('lowercases an uppercase tag name', () => {
    const html = '<A HREF="MAILTO:X@EXAMPLE.COM">x</A>';
    expect(find(html, 'a')).toHaveLength(1);
    expect(find(html, 'a')[0].attrs.href).toBe('MAILTO:X@EXAMPLE.COM');
  });

  it('treats a < that does not start a tag as ordinary text', () => {
    const html = 'a < b <3 </p> <!doctype html><p>real</p>';
    expect(find(html, 'p')).toHaveLength(1);
  });
});

describe('attributes', () => {
  it('reads double-quoted, single-quoted, unquoted and valueless values', () => {
    const html = `<input disabled data-a="x" data-b='y' data-c=z>`;
    const attrs = find(html, 'input')[0].attrs;
    expect(attrs).toEqual({ disabled: '', 'data-a': 'x', 'data-b': 'y', 'data-c': 'z' });
  });

  it('is unaffected by attribute order', () => {
    const html = '<img height="10" src="/a.jpg" width="10">';
    expect(find(html, 'img')[0].attrs).toEqual({ height: '10', src: '/a.jpg', width: '10' });
  });

  it('lowercases an uppercase attribute name', () => {
    const html = '<META NAME="robots" CONTENT="index, follow">';
    expect(find(html, 'meta')[0].attrs).toEqual({ name: 'robots', content: 'index, follow' });
  });

  it('reads attributes across a line break inside the tag', () => {
    const html = '<link\n  rel="canonical"\n  href="https://x.test/">';
    expect(find(html, 'link')[0].attrs).toEqual({ rel: 'canonical', href: 'https://x.test/' });
  });

  it('keeps the first of two attributes with the same name', () => {
    const html = '<meta content="first" CONTENT="second">';
    expect(find(html, 'meta')[0].attrs.content).toBe('first');
  });
});

describe('character references in attribute values', () => {
  it('decodes &amp;, &AMP;, &quot; and &#39;', () => {
    const html = `<a title="a &amp; b &AMP; c" data-q="&quot;" data-apos="&#39;">x</a>`;
    const attrs = find(html, 'a')[0].attrs;
    expect(attrs.title).toBe('a & b & c');
    expect(attrs['data-q']).toBe('"');
    expect(attrs['data-apos']).toBe("'");
  });

  it('decodes &#116; and &#x74; (both spell "t")', () => {
    const html = '<a href="mail&#116;o:x@example.com" data-hex="&#x74;">x</a>';
    const attrs = find(html, 'a')[0].attrs;
    expect(attrs.href).toBe('mailto:x@example.com');
    expect(attrs['data-hex']).toBe('t');
  });

  it('decodes a numeric reference without its trailing semicolon', () => {
    const html = '<script src="&#104ttps://evil.test/x.js"></script>';
    expect(find(html, 'script')[0].attrs.src).toBe('https://evil.test/x.js');
  });

  it('decodes &colon;, &bsol;, &Tab; and &NewLine;', () => {
    const html =
      '<a href="mailto&colon;x@example.com" data-b="&bsol;&bsol;evil" title="a&Tab;b&NewLine;c">x</a>';
    const attrs = find(html, 'a')[0].attrs;
    expect(attrs.href).toBe('mailto:x@example.com');
    expect(attrs['data-b']).toBe('\\\\evil');
    expect(attrs.title).toBe('a\tb\nc');
  });

  it('leaves an unknown named reference such as &bogus; unchanged', () => {
    const html = '<a title="&bogus;">x</a>';
    expect(find(html, 'a')[0].attrs.title).toBe('&bogus;');
  });

  it('replaces &#0; with the Unicode replacement character, not the literal null', () => {
    // Surprise: the HTML standard replaces a null-character numeric reference
    // with U+FFFD; it does not leave "&#0;" as written.
    const html = '<a title="&#0;">x</a>';
    expect(find(html, 'a')[0].attrs.title).toBe('�');
  });
});

describe('head and body', () => {
  it('a policy meta written inside <head> has inHead true', () => {
    const html =
      '<html><head><meta http-equiv="Content-Security-Policy" content="x"></head><body></body></html>';
    expect(find(html, 'meta')[0].inHead).toBe(true);
  });

  it('a meta written after <body> has inHead false', () => {
    const html =
      '<html><head></head><body><p>x</p><meta name="robots" content="noindex"></body></html>';
    expect(find(html, 'meta')[0].inHead).toBe(false);
  });

  it('a meta after an implicitly opened body has inHead false', () => {
    const html = '<head></head><p>x</p><meta http-equiv="Content-Security-Policy" content="x">';
    expect(find(html, 'meta')[0].inHead).toBe(false);
  });

  it('a meta written between </head> and <body> is moved into head by the parser', () => {
    const html = '<html><head></head><meta name="a" content="b"><body><p>x</p></body></html>';
    expect(find(html, 'meta')[0].inHead).toBe(true);
  });

  it('with no html, head or body tags at all, a meta lands in head and a link lands in body', () => {
    const html = '<meta name="robots" content="noindex"><a href="#">x</a>';
    expect(find(html, 'meta')[0].inHead).toBe(true);
    expect(find(html, 'a')[0].inHead).toBe(false);
  });
});

describe('text', () => {
  it('reads JSON-LD script content unaffected by braces, quotes or a closing-tag lookalike', () => {
    const html =
      '<script type="application/ld+json">{"@type":"Organization","name":"a \\"b\\" </scripture>"}</script>';
    const text = find(html, 'script')[0].text;
    expect(JSON.parse(text)).toEqual({ '@type': 'Organization', name: 'a "b" </scripture>' });
  });

  it('reads an inline module script verbatim', () => {
    const html = `<script type="module">import { x } from "./x.js"; console.log(x < 1 && x > -1);</script>`;
    expect(find(html, 'script')[0].text).toBe(
      'import { x } from "./x.js"; console.log(x < 1 && x > -1);',
    );
  });

  it('reads two <style> blocks in document order', () => {
    const html = '<style>a{color:red}</style><style>b{color:blue}</style>';
    expect(find(html, 'style').map((element) => element.text)).toEqual([
      'a{color:red}',
      'b{color:blue}',
    ]);
  });

  it('is empty for an element other than script, style or title', () => {
    const html = '<p>hello</p>';
    expect(find(html, 'p')[0].text).toBe('');
  });

  it('is byte-identical to what was written, verified by comparing SHA-256 hashes', () => {
    const literal = '{"a":1,"b":"<script>","c":"</scripture>"}';
    const html = `<script type="application/ld+json">${literal}</script>`;
    expect(sha256(find(html, 'script')[0].text)).toBe(sha256(literal));
  });
});

describe('source', () => {
  it('equals the start tag exactly as written, including odd spacing and quoting', () => {
    const tag = '<img   alt=\'x\'  width="10"   height=10>';
    const html = `${tag}<p>x</p>`;
    expect(find(html, 'img')[0].source).toBe(tag);
  });

  it('is correct with CRLF line endings before the tag', () => {
    const html = 'line1\r\nline2\r\n<img alt="x" src="a.jpg">';
    expect(find(html, 'img')[0].source).toBe('<img alt="x" src="a.jpg">');
  });

  it('is correct with a non-BMP character (an emoji) before the tag', () => {
    const html = '\u{1F600}<img alt="x" src="a.jpg">';
    expect(find(html, 'img')[0].source).toBe('<img alt="x" src="a.jpg">');
  });
});

describe('foreign content', () => {
  it('reads an SVG <title> as an ordinary element with its own text', () => {
    const html = '<svg><title>Logo</title><foreignObject></foreignObject></svg>';
    const elements = readLiveElements(html);
    const svgTitle = elements.find((element) => element.name === 'title');
    expect(svgTitle?.text).toBe('Logo');
    expect(elements.some((element) => element.name === 'foreignobject')).toBe(true);
  });
});

describe('robustness', () => {
  it('never throws on the empty string', () => {
    expect(readLiveElements('')).toEqual([]);
  });

  it('never throws on a lone <', () => {
    expect(() => readLiveElements('<')).not.toThrow();
  });

  it('finishes well under 5 seconds on 300,000 unclosed quoted attribute values', () => {
    const start = Date.now();
    const html = '<a href="'.repeat(300_000);
    expect(() => readLiveElements(html)).not.toThrow();
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

describe('memoization', () => {
  it('returns the same array instance for two calls with the same string', () => {
    const html = '<p>memo test unique marker A</p>';
    const first = readLiveElements(html);
    const second = readLiveElements(html);
    expect(second).toBe(first);
  });

  it('re-parses (without breaking) an input evicted after four more distinct inputs', () => {
    const html = '<p>memo eviction marker B</p>';
    const first = readLiveElements(html);
    readLiveElements('<p>1</p>');
    readLiveElements('<p>2</p>');
    readLiveElements('<p>3</p>');
    readLiveElements('<p>4</p>');
    const again = readLiveElements(html);
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });
});
