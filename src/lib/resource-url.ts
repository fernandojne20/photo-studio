/** How a browser reads a URL, for the page's link classifier, the checks and the measuring alike. */

/** No tabs or line breaks, no leading control characters or spaces, and `\\` read as `/`. */
export function normalizeUrl(value: string): string {
  const compact = value.replace(/[\t\n\r]/g, '');
  let start = 0;
  while (start < compact.length && compact.charCodeAt(start) <= 0x20) start += 1;
  return compact.slice(start).replace(/\\/g, '/');
}

/** True for anything the browser would fetch from another origin, `//host/x` and `data:` included. */
export function isCrossOrigin(url: string): boolean {
  const normalized = normalizeUrl(url);
  return normalized.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized);
}
