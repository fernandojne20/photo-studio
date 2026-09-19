import { describe, expect, it } from 'vitest';
import {
  budgetProblems,
  evaluateBudgets,
  formatBudgetValue,
  IMAGE_COUNT_KEY,
  PERFORMANCE_BUDGETS,
} from './performance-budgets';

describe('PERFORMANCE_BUDGETS', () => {
  it('gives every budget a name, a positive limit and a non-empty reason', () => {
    for (const budget of PERFORMANCE_BUDGETS) {
      expect(budget.name.length).toBeGreaterThan(0);
      expect(budget.limit).toBeGreaterThan(0);
      expect(budget.reason.length).toBeGreaterThan(0);
    }
  });

  it('sets a minimum on every byte/count row a broken measurement could silently read as 0', () => {
    const withMin = [
      'eager-js-gzip',
      'eager-js-file-count',
      'stylesheets-gzip',
      'total-font-bytes',
      'preloaded-font-bytes',
    ];
    for (const name of withMin) {
      expect(PERFORMANCE_BUDGETS.find((b) => b.name === name)?.min).toBe(1);
    }
  });
});

describe('evaluateBudgets', () => {
  it('is ok when every measurement is at or under its limit and at/above its minimum', () => {
    const measurements = {
      ...Object.fromEntries(PERFORMANCE_BUDGETS.map((b) => [b.name, b.limit])),
      [IMAGE_COUNT_KEY]: 0,
    };
    const results = evaluateBudgets(measurements);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.every((r) => r.problem === undefined)).toBe(true);
  });

  it('flags a measurement over its limit', () => {
    const measurements = {
      ...Object.fromEntries(PERFORMANCE_BUDGETS.map((b) => [b.name, b.limit + 1])),
      [IMAGE_COUNT_KEY]: 0,
    };
    const results = evaluateBudgets(measurements);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results.every((r) => r.problem?.includes('exceeds the'))).toBe(true);
  });

  it('treats a missing measurement as its own distinct failure, not zero-passes', () => {
    const [result] = evaluateBudgets({ [IMAGE_COUNT_KEY]: 0 });
    expect(result.ok).toBe(false);
    expect(result.measured).toBe(0);
    expect(result.problem).toContain('no measurement was reported');
  });

  it('treats a non-finite value as its own distinct failure', () => {
    const results = evaluateBudgets({
      'eager-js-gzip': Number.NaN,
      'eager-js-file-count': Number.POSITIVE_INFINITY,
    });
    expect(results.find((r) => r.name === 'eager-js-gzip')?.problem).toContain(
      'not a finite number',
    );
    expect(results.find((r) => r.name === 'eager-js-file-count')?.problem).toContain(
      'not a finite number',
    );
  });

  it('treats a non-number value as not a finite number, never as zero-passes', () => {
    const results = evaluateBudgets({ 'eager-js-gzip': '10000' });
    expect(results.find((r) => r.name === 'eager-js-gzip')?.ok).toBe(false);
  });

  it('rejects a negative value distinctly from "over budget"', () => {
    const results = evaluateBudgets({ 'eager-js-gzip': -1 });
    const result = results.find((r) => r.name === 'eager-js-gzip');
    expect(result?.ok).toBe(false);
    expect(result?.problem).toContain('negative');
  });

  it('fails a present-but-zero value on a row with a minimum, naming the measurement as broken', () => {
    const results = evaluateBudgets({ 'eager-js-file-count': 0 });
    const result = results.find((r) => r.name === 'eager-js-file-count');
    expect(result?.ok).toBe(false);
    expect(result?.problem).toContain('probably broken');
  });

  it('a row with no minimum still passes at zero', () => {
    const results = evaluateBudgets({ 'lazy-js-gzip': 0 });
    expect(results.find((r) => r.name === 'lazy-js-gzip')?.ok).toBe(true);
  });
});

describe('budgetProblems', () => {
  it('is empty when nothing is over budget', () => {
    const measurements = {
      ...Object.fromEntries(PERFORMANCE_BUDGETS.map((b) => [b.name, b.limit])),
      [IMAGE_COUNT_KEY]: 0,
    };
    expect(budgetProblems(evaluateBudgets(measurements))).toEqual([]);
  });

  it('names the budget for each failure', () => {
    const [problem] = budgetProblems(evaluateBudgets({}));
    expect(problem.startsWith(`${PERFORMANCE_BUDGETS[0].name}:`)).toBe(true);
  });
});

describe('formatBudgetValue', () => {
  it('renders bytes as kilobytes with one decimal', () => {
    expect(formatBudgetValue(15914, 'bytes')).toBe('15.9 kB');
  });

  it('renders a count as a bare integer', () => {
    expect(formatBudgetValue(4, 'count')).toBe('4');
  });
});

describe('the HTML budget scales with the number of images', () => {
  const others = Object.fromEntries(
    PERFORMANCE_BUDGETS.filter((b) => b.name !== 'homepage-html-gzip').map((b) => [
      b.name,
      b.min ?? 0,
    ]),
  );
  const html = (bytes: number, images: unknown) =>
    evaluateBudgets({ ...others, 'homepage-html-gzip': bytes, [IMAGE_COUNT_KEY]: images }).find(
      (r) => r.name === 'homepage-html-gzip',
    );

  it('allows 20 kB plus 1 kB per image', () => {
    expect(html(20_000, 0)).toMatchObject({ ok: true, limit: 20_000 });
    expect(html(35_000, 15)).toMatchObject({ ok: true, limit: 35_000 });
    expect(html(35_001, 15)).toMatchObject({ ok: false, limit: 35_000 });
  });

  it('never fails a large portfolio at the measured cost per photo', () => {
    // 10 kB of page plus 0.7 kB per photo, as measured on real content.
    expect(html(10_000 + 700 * 400, 400)).toMatchObject({ ok: true });
  });

  it('still catches a blob that does not come with images', () => {
    expect(html(10_000 + 700 * 15 + 30_000, 15)).toMatchObject({ ok: false });
  });

  it('fails as broken when the image count is missing or not a whole number', () => {
    for (const images of [undefined, Number.NaN, -1, 1.5, '15']) {
      expect(html(15_000, images)).toMatchObject({
        ok: false,
        problem: 'the image count it scales with was not reported (Homepage HTML, gzip).',
      });
    }
  });
});
