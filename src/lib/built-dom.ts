/**
 * Reads built HTML the way a browser does, using parse5's implementation of
 * the HTML standard's tree-construction algorithm (PD-06 follow-up, VH-01).
 * "Live" means part of the actual document tree: not inside a `<template>`'s
 * content, and not an element the parser invented rather than read from the
 * input. One parse per distinct input; results are memoized and frozen.
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

type ElementNode = DefaultTreeAdapterTypes.Element;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type StartTag = NonNullable<NonNullable<ElementNode['sourceCodeLocation']>['startTag']>;

export interface LiveElement {
  /** Lowercase tag name as the parser read it: `<a@x>` is `a@x`, not `a`. */
  name: string;
  /** Decoded by the parser; the first of two attributes with one name wins. Names lowercase. */
  attrs: Record<string, string>;
  /** The start tag exactly as written in the input, for problem messages. */
  source: string;
  /** The tree builder placed the element inside the document's `<head>`. */
  inHead: boolean;
  /** Child text content (direct text nodes, what a browser runs and hashes) of `script`, `style` and `title`; empty otherwise. */
  text: string;
}

/** The only elements whose text content this reader exposes. */
const TEXT_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style', 'title']);

const CACHE_LIMIT = 4;
const cache = new Map<string, LiveElement[]>();

function isElement(node: ChildNode): node is ElementNode {
  return 'tagName' in node;
}

function isTextNode(node: ChildNode): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === '#text';
}

function findChild(parent: ParentNode, tagName: string): ElementNode | undefined {
  return parent.childNodes.find(
    (node): node is ElementNode => isElement(node) && node.tagName === tagName,
  );
}

/** The document's `<head>`, however it got there: written, moved, or implicit. */
function findHead(document: DefaultTreeAdapterTypes.Document): ElementNode | undefined {
  const html = findChild(document, 'html');
  return html && findChild(html, 'head');
}

function textOf(element: ElementNode): string {
  let text = '';
  for (const child of element.childNodes) {
    if (isTextNode(child)) text += child.value;
  }
  return text;
}

/**
 * The parser has already decoded the values and dropped every repeat of a name but the first.
 * In SVG it splits `xlink:href` into a prefix and a name: keep both, or it would pose as `href`.
 */
function attrsOf(element: ElementNode): Record<string, string> {
  // No prototype: an attribute named `__proto__` or `constructor` is just a name.
  const attrs: Record<string, string> = Object.create(null);
  for (const attr of element.attrs) {
    const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name;
    attrs[name.toLowerCase()] = attr.value;
  }
  return attrs;
}

function buildElement(
  element: ElementNode,
  html: string,
  startTag: StartTag,
  inHead: boolean,
): LiveElement {
  const name = element.tagName.toLowerCase();
  const result: LiveElement = {
    name,
    attrs: Object.freeze(attrsOf(element)),
    source: html.slice(startTag.startOffset, startTag.endOffset),
    inHead,
    text: TEXT_ELEMENTS.has(name) ? textOf(element) : '',
  };
  return Object.freeze(result);
}

/** Document order with an explicit stack: recursion would overflow on absurdly deep nesting. */
function collect(
  document: DefaultTreeAdapterTypes.Document,
  html: string,
  headElement: ElementNode | undefined,
): LiveElement[] {
  const out: LiveElement[] = [];
  const pending: { node: ChildNode; inHead: boolean }[] = [];
  const pushChildren = (parent: ParentNode, inHead: boolean) => {
    for (let i = parent.childNodes.length - 1; i >= 0; i -= 1)
      pending.push({ node: parent.childNodes[i], inHead });
  };
  pushChildren(document, false);
  for (let item = pending.pop(); item; item = pending.pop()) {
    const { node, inHead } = item;
    if (!isElement(node)) continue;
    const startTag = node.sourceCodeLocation?.startTag;
    if (startTag) out.push(buildElement(node, html, startTag, inHead));
    // A <template>'s content lives in `.content`, which this walk never enters.
    pushChildren(node, inHead || node === headElement);
  }
  return out;
}

/** `rel` is a space-separated token list: `rel="alternate stylesheet"` is a stylesheet. */
export function hasRelToken(attrs: Readonly<Record<string, string>>, token: string): boolean {
  return (attrs.rel ?? '').toLowerCase().split(/\s+/).includes(token);
}

export function readLiveElements(html: string): LiveElement[] {
  const cached = cache.get(html);
  if (cached) return cached;

  const document = parse(html, { sourceCodeLocationInfo: true });
  const elements = Object.freeze(collect(document, html, findHead(document))) as LiveElement[];

  cache.set(html, elements);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return elements;
}
