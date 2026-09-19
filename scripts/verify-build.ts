/**
 * Thin IO layer for PD-06: reads `dist/client`, hands plain strings to the
 * pure assertions, prints the budget table and every problem, and exits
 * non-zero on any. Every check (and the measuring) runs wrapped: one bad
 * check must never hide the others' results or crash the whole run. Import
 * and call blocks below are grouped by pull request on purpose (PR1
 * indexing, PR2 policy + markup, PR3 budgets — see PD-06 in
 * `odd/tasks/production-delivery.md`).
 *
 *   pnpm build:verify --mode=non-indexable
 *   PUBLIC_SITE_URL=https://www.example.com pnpm build:verify --mode=indexable --origin=https://www.example.com
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// PR1: indexing policy + the environment-consistency check.
import {
  checkEnvironmentConsistency,
  checkIndexingPolicy,
  effectivePublicSiteUrl,
  type Mode,
} from '../src/lib/build-verification-indexing';
// PR2: the Content Security Policy relation, and per-page markup/hygiene.
import { checkContentSecurityPolicy } from '../src/lib/build-verification-policy';
import { checkAnalyticsMarkup, checkPageHygiene } from '../src/lib/build-verification-markup';
// PR3: the budget table and its measuring.
import {
  budgetProblems,
  evaluateBudgets,
  formatBudgetValue,
  PERFORMANCE_BUDGETS,
} from '../src/lib/performance-budgets';
import { resolveSiteUrl } from '../src/lib/seo';
import { measureBuild } from './measure-build';

interface Args {
  mode: Mode;
  origin?: string;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = arg.match(/^--([a-z]+)=(.*)$/);
    if (match) flags.set(match[1], match[2]);
  }
  const mode = flags.get('mode');
  if (mode !== 'indexable' && mode !== 'non-indexable') {
    console.error('Usage: verify-build.ts --mode=indexable|non-indexable [--origin=https://...]');
    process.exit(1);
  }
  const origin = flags.get('origin');
  if (mode === 'indexable' && !origin) {
    console.error('--origin=<https://...> is required for --mode=indexable.');
    process.exit(1);
  }
  // Same rule as PUBLIC_SITE_URL: a bare https origin, or the check would
  // silently compare against a trimmed value.
  if (origin !== undefined && resolveSiteUrl(origin) === undefined) {
    console.error(
      `--origin must be a bare https origin without a path, query or hash, got "${origin}".`,
    );
    process.exit(1);
  }
  return { mode, origin };
}

/** The dotenv files `astro build` reads, in Vite's order; only PUBLIC_SITE_URL is taken from them. */
const DOTENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];

function readText(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

function findHtmlFiles(distClient: string): string[] {
  return (readdirSync(distClient, { recursive: true, encoding: 'utf8' }) as string[]).filter(
    (entry) => entry.endsWith('.html'),
  );
}

/** A check must never hide the others behind a crash: an exception becomes one problem line naming what broke. */
function safely(label: string, run: () => string[]): string[] {
  try {
    return run();
  } catch (error) {
    return [`${label}: threw ${error instanceof Error ? error.message : String(error)}`];
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const distClient = join(process.cwd(), 'dist', 'client');
  if (!existsSync(distClient)) {
    console.error(`${distClient} does not exist. Run "pnpm build" first.`);
    process.exit(1);
  }

  const homepageHtml = readText(join(distClient, 'index.html'));
  const notFoundHtml = readText(join(distClient, '404.html'));
  const robotsTxt = readText(join(distClient, 'robots.txt'));
  const sitemapXml = readText(join(distClient, 'sitemap.xml'));
  const headersText = readText(join(distClient, '_headers'));
  if (!homepageHtml || !notFoundHtml || !robotsTxt || !headersText) {
    console.error('dist/client is missing index.html, 404.html, robots.txt or _headers.');
    process.exit(1);
  }

  const problems: string[] = [];

  // PR1: indexing policy + environment consistency.
  let indexable = false;
  problems.push(
    ...safely('indexing policy', () => {
      const result = checkIndexingPolicy({
        mode: args.mode,
        origin: args.origin,
        homepageHtml,
        notFoundHtml,
        robotsTxt,
        sitemapXml,
        headersText,
      });
      indexable = result.indexable;
      return result.problems;
    }),
  );
  problems.push(
    ...safely('environment consistency', () =>
      checkEnvironmentConsistency({
        mode: args.mode,
        publicSiteUrlRaw: effectivePublicSiteUrl(
          process.env.PUBLIC_SITE_URL,
          DOTENV_FILES.map((file) => readText(join(process.cwd(), file)) ?? ''),
        ),
        indexable,
      }),
    ),
  );

  // PR2: the Content Security Policy relation, and per-page markup/hygiene.
  problems.push(
    ...safely('Content Security Policy', () =>
      checkContentSecurityPolicy({ pageHtmls: [homepageHtml, notFoundHtml], headersText }),
    ),
  );
  for (const relPath of findHtmlFiles(distClient)) {
    const html = readFileSync(join(distClient, relPath), 'utf8');
    problems.push(...safely(`${relPath} analytics markup`, () => checkAnalyticsMarkup(html)));
    problems.push(...safely(`${relPath} page hygiene`, () => checkPageHygiene(html)));
  }

  // PR3: the budget table and its measuring.
  let measurements: Record<string, number> = {};
  try {
    measurements = measureBuild(distClient, homepageHtml);
  } catch (error) {
    problems.push(
      `measuring the build: threw ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const budgetResults = evaluateBudgets(measurements);
  problems.push(...budgetProblems(budgetResults));

  console.log(`\nPerformance budgets (${PERFORMANCE_BUDGETS.length}):`);
  console.log('name'.padEnd(24), 'measured'.padStart(12), 'limit'.padStart(12), 'status');
  for (const result of budgetResults) {
    console.log(
      result.name.padEnd(24),
      formatBudgetValue(result.measured, result.unit).padStart(12),
      formatBudgetValue(result.limit, result.unit).padStart(12),
      result.ok ? 'ok' : result.measured > result.limit ? 'OVER' : 'BROKEN',
    );
  }

  if (problems.length > 0) {
    console.error(`\nBuild verification failed (${args.mode}), ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nBuild verification passed (${args.mode}).`);
}

main();
