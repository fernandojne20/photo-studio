import { describe, expect, it } from 'vitest';
import { failingProblems, parseBudgetMode, splitBudgetFailures } from './budget-mode';
import type { BudgetCheckResult } from './performance-budgets';

describe('parseBudgetMode', () => {
  it('defaults to enforce when the flag is absent', () => {
    expect(parseBudgetMode(undefined)).toBe('enforce');
  });

  it('accepts enforce and report', () => {
    expect(parseBudgetMode('enforce')).toBe('enforce');
    expect(parseBudgetMode('report')).toBe('report');
  });

  it('rejects an unknown, empty or differently-cased value', () => {
    for (const value of ['foo', '', 'Report', 'off']) {
      expect(() => parseBudgetMode(value)).toThrow(
        `--budgets must be "enforce" or "report", got "${value}".`,
      );
    }
  });
});

describe('failingProblems', () => {
  const problems = ['csp: broken'];
  const budgets = ['eager-js-gzip: 30.0 kB exceeds the 24.0 kB budget'];

  it('fails on budget problems too when enforcing', () => {
    expect(failingProblems('enforce', problems, budgets)).toEqual([...problems, ...budgets]);
  });

  it('drops the budget problems, and only those, when reporting', () => {
    expect(failingProblems('report', problems, budgets)).toEqual(problems);
  });

  it('passes a report-mode run whose only problems are budgets', () => {
    expect(failingProblems('report', [], budgets)).toEqual([]);
  });
});

describe('splitBudgetFailures', () => {
  const base = { description: 'd', unit: 'bytes' as const };
  const result = (over: Partial<BudgetCheckResult>): BudgetCheckResult => ({
    ...base,
    name: 'x',
    measured: 0,
    limit: 100,
    ok: true,
    ...over,
  });

  it('puts only an exceeded maximum in overLimit', () => {
    const results = [
      result({ name: 'ok', measured: 50 }),
      result({ name: 'over', measured: 150, ok: false, problem: 'exceeds' }),
    ];
    expect(splitBudgetFailures(results)).toEqual({ overLimit: ['over: exceeds'], broken: [] });
  });

  it('treats missing, negative and below-minimum measurements as broken, never as over the limit', () => {
    const results = [
      result({ name: 'missing', measured: 0, ok: false, problem: 'no measurement' }),
      result({ name: 'negative', measured: -1, ok: false, problem: 'negative' }),
      result({ name: 'low', measured: 0, ok: false, problem: 'below the minimum' }),
    ];
    expect(splitBudgetFailures(results)).toEqual({
      overLimit: [],
      broken: ['missing: no measurement', 'negative: negative', 'low: below the minimum'],
    });
  });
});
