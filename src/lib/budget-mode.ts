/**
 * Budget mode of `scripts/verify-build.ts` (PD-07). A deploy triggered by a
 * content change must not fail on size: editor text has no maximum, so
 * nobody could act on that failure. `report` prints the budget table and its
 * over-budget rows but keeps them out of the problems that fail the run.
 * Pure on purpose, so both decisions are tested with literal values.
 */

import type { BudgetCheckResult } from './performance-budgets';

export type BudgetMode = 'enforce' | 'report';

/** The `--budgets=` flag value; absent means `enforce`, anything unknown throws. */
export function parseBudgetMode(value: string | undefined): BudgetMode {
  if (value === undefined || value === 'enforce') return 'enforce';
  if (value === 'report') return 'report';
  throw new Error(`--budgets must be "enforce" or "report", got "${value}".`);
}

/**
 * The problems that fail the run. In `report` mode the exceeded maxima are
 * dropped (they are printed as warnings by the caller); every other problem,
 * broken budget measurements included, still fails it.
 */
export function failingProblems(
  mode: BudgetMode,
  problems: readonly string[],
  budgetProblems: readonly string[],
): string[] {
  return mode === 'report' ? [...problems] : [...problems, ...budgetProblems];
}

/**
 * Splits failed budgets in two. Only an exceeded maximum can come from the
 * editor's content. A missing, non-finite, negative or below-minimum
 * measurement means the measuring or the build is broken, so it must fail
 * the run in `report` mode too.
 */
export function splitBudgetFailures(results: readonly BudgetCheckResult[]): {
  overLimit: string[];
  broken: string[];
} {
  const overLimit: string[] = [];
  const broken: string[] = [];
  for (const result of results) {
    if (result.ok) continue;
    const problem = `${result.name}: ${result.problem}`;
    if (result.measured > result.limit) overLimit.push(problem);
    else broken.push(problem);
  }
  return { overLimit, broken };
}
