/** Reads Cloudflare's `_headers` file as the build wrote it: per-path rules and their headers. */

export interface HeadersRule {
  path: string;
  /** Header name exactly as written (case as generated); values already trimmed. */
  headers: Record<string, string>;
}

/** Parses a Cloudflare `_headers` file into per-path rules. A blank line ends a rule. */
export function parseHeadersFile(text: string): HeadersRule[] {
  const rules: HeadersRule[] = [];
  let current: HeadersRule | undefined;
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      current = undefined;
      continue;
    }
    if (/^\s/.test(line)) {
      if (!current) continue;
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      current.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      continue;
    }
    current = { path: line.trim(), headers: {} };
    rules.push(current);
  }
  return rules;
}

/** Case-insensitive header lookup within one rule's headers. */
export function getHeader(rule: HeadersRule, name: string): string | undefined {
  const lower = name.toLowerCase();
  const key = Object.keys(rule.headers).find((candidate) => candidate.toLowerCase() === lower);
  return key ? rule.headers[key] : undefined;
}
