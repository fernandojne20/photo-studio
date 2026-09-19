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
  /** Text content of `script`, `style` and `title`; empty for every other element. */
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

/** name="value" pairs as the parser decoded them; the first of a repeated name wins. */
function attrsOf(element: ElementNode): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of element.attrs) {
    const key = attr.name.toLowerCase();
    if (!(key in attrs)) attrs[key] = attr.value;
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

function collect(
  parent: ParentNode,
  html: string,
  headElement: ElementNode | undefined,
  inHead: boolean,
  out: LiveElement[],
): void {
  for (const child of parent.childNodes) {
    if (!isElement(child)) continue;
    const startTag = child.sourceCodeLocation?.startTag;
    if (startTag) out.push(buildElement(child, html, startTag, inHead));
    const childInHead = inHead || child === headElement;
    // A <template>'s content lives in `.content`, never `.childNodes`: skip it.
    if (child.tagName === 'template') continue;
    collect(child, html, headElement, childInHead, out);
  }
}

export function readLiveElements(html: string): LiveElement[] {
  const cached = cache.get(html);
  if (cached) return cached;

  const document = parse(html, { sourceCodeLocationInfo: true });
  const elements: LiveElement[] = [];
  collect(document, html, findHead(document), false, elements);
  Object.freeze(elements);

  cache.set(html, elements);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return elements;
}
