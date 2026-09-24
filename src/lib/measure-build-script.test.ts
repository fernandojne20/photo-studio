import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { measureBuild } from '../../scripts/measure-build';

// The measuring script reads real files, so it is tested against a throwaway folder of them.
const dist = mkdtempSync(join(tmpdir(), 'measure-build-'));
afterAll(() => rmSync(dist, { recursive: true, force: true }));

function write(path: string, content: string): void {
  mkdirSync(join(dist, path, '..'), { recursive: true });
  writeFileSync(join(dist, path), content);
}

describe('measureBuild on real files', () => {
  it('follows the imports of a URL that is loaded as a classic script first and as a module later', () => {
    write('a.js', 'import"./b.js";'); // minified, as a built chunk is
    write('b.js', 'export const b = 1;');
    const html =
      '<script src="/a.js?v=1"></script><script type="module" src="/a.js"></script>' +
      '<img src="/x.jpg" width="1" height="1">';
    write('index.html', html);
    const measured = measureBuild(dist, html);
    expect(measured['eager-js-file-count']).toBe(2);
  });
});
