/**
 * Whether a script runs, by the HTML standard's "script block's type string". Shared by the
 * inline-hash check and the eager JavaScript budget, so the two cannot drift on what runs.
 */

/** The HTML standard's JavaScript MIME type essence strings, the whole closed list. */
export const JAVASCRIPT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

/**
 * An empty or absent `type` is JavaScript unless a non-empty `language` says otherwise. A parameter
 * after `;` is dropped: taking a doubtful type for JavaScript is the safe side for both callers.
 */
export function scriptTypeString(attrs: Readonly<Record<string, string>>): string {
  const { type, language } = attrs;
  if (type !== undefined && type !== '') return type.split(';')[0].trim().toLowerCase();
  if (type === undefined && language) return `text/${language.toLowerCase()}`;
  return 'text/javascript';
}

/**
 * Classic or module JavaScript. `importmap` and `speculationrules` never run as a program, so they are
 * not here. `nomodule` is ignored: counting a script that a modern browser skips is the safe side.
 */
export function isExecutableScriptType(attrs: Readonly<Record<string, string>>): boolean {
  const typeString = scriptTypeString(attrs);
  return typeString === 'module' || JAVASCRIPT_MIME_TYPES.has(typeString);
}
