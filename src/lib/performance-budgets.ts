/**
 * Size budgets for `dist/client` (PD-06). Each row is a documented
 * threshold, not a guess: `limit` leaves headroom over what real content can
 * legitimately produce, and `reason` is what a future editor sees when
 * deciding whether to raise it — raising a limit needs a new `reason`, not a
 * bigger number with the same one. `min`, where set, is a sanity floor: a
 * measurement below it means the MEASURING is broken (e.g. a swapped
 * attribute made it see nothing), not that the build shrank to zero.
 * `scripts/measure-build.ts` is the only caller; this file stays pure data
 * plus a pure comparison, so both can be unit-tested with literal numbers.
 */

export type BudgetUnit = 'bytes' | 'count';

export interface BudgetDefinition {
  /** Stable key, also the measurement key `scripts/measure-build.ts` reports under. */
  name: string;
  description: string;
  limit: number;
  /** Sanity floor; omitted where zero is a legitimate value. */
  min?: number;
  unit: BudgetUnit;
  reason: string;
}

export const PERFORMANCE_BUDGETS: readonly BudgetDefinition[] = [
  {
    name: 'homepage-html-gzip',
    description: 'Homepage HTML, gzip',
    limit: 40_000,
    min: 1,
    unit: 'bytes',
    reason:
      "Grows with the editor's portfolio and copy, and a content change must never fail a build: this only catches accidental inlining (a base64 image, a large script).",
  },
  {
    name: 'eager-js-gzip',
    description:
      'Eager JavaScript (module scripts of the homepage plus their static imports), gzip',
    limit: 24_000,
    min: 1,
    unit: 'bytes',
    reason:
      "The services carousel (ServicesCarousel.astro) loads with a plain <script>, not import(): it is EAGER, not lazy, once the editor's 5th service triggers it (measured: 10.1 kB today, 17.8 kB with the carousel). A content change must never fail a build.",
  },
  {
    name: 'lazy-js-gzip',
    description: 'Lazy JavaScript (dynamically imported chunks), gzip',
    limit: 23_000,
    unit: 'bytes',
    reason:
      'PhotoSwipe (17 kB) only: the services carousel is eager (see eager-js-gzip), never lazy. Headroom for a PhotoSwipe upgrade. No minimum on purpose: an empty portfolio loads no lightbox, and a content change must never fail a build.',
  },
  {
    name: 'stylesheets-gzip',
    description: 'Stylesheets linked from the homepage, gzip',
    limit: 7_500,
    min: 1,
    unit: 'bytes',
    reason: 'One design system; a jump here usually means an unscoped or duplicated rule.',
  },
  {
    name: 'eager-js-file-count',
    description: 'Number of eager script files (module scripts plus their static imports)',
    limit: 6,
    min: 1,
    unit: 'count',
    reason:
      'Measured with a 5th placeholder service: 5 files (the carousel entry adds one, bundling Embla itself — no separate chunk). One spare for a genuinely new conversion component script.',
  },
  {
    name: 'preloaded-font-bytes',
    description: 'Bytes of the fonts marked `preload` (fetched at high priority)',
    limit: 70_000,
    min: 1,
    unit: 'bytes',
    reason:
      'Montserrat (16 kB) and Futura Light BT (37 kB) only. DM Sans also paints text in the first viewport on mobile, but its 239 kB would compete with the hero photo — the actual LCP — for bandwidth; font-display: swap covers it instead. A third preloaded font is a regression signal.',
  },
  {
    name: 'total-font-bytes',
    description: 'Total bytes of every font file the homepage references',
    limit: 735_000,
    min: 1,
    unit: 'bytes',
    reason:
      "Montserrat is fetched from Google at build time, so this number can drift a little with no code change here; the headroom is for that, not for a new font. Four files are uncompressed desktop formats: three await the owner's licensing decision on WOFF2, and DM Sans is open-licensed and can move to WOFF2 as a follow-up.",
  },
];

export interface BudgetCheckResult {
  name: string;
  description: string;
  measured: number;
  limit: number;
  unit: BudgetUnit;
  ok: boolean;
  /** Present only when `!ok`; explains which of the failure kinds this is. */
  problem?: string;
}

/**
 * Compares a measurement map (by budget `name`) against
 * {@link PERFORMANCE_BUDGETS}. A measurement can fail four distinct ways,
 * each with its own message: missing entirely, not a finite number,
 * negative, or (when `min` is set) implausibly low — the last three are
 * "the measurement is probably broken", not "the build shrank".
 */
export function evaluateBudgets(
  measurements: Readonly<Record<string, unknown>>,
): BudgetCheckResult[] {
  return PERFORMANCE_BUDGETS.map((budget) => {
    const base = {
      name: budget.name,
      description: budget.description,
      limit: budget.limit,
      unit: budget.unit,
    };
    if (!Object.hasOwn(measurements, budget.name)) {
      return {
        ...base,
        measured: 0,
        ok: false,
        problem: `no measurement was reported (${budget.description}).`,
      };
    }
    const value = measurements[budget.name];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return {
        ...base,
        measured: 0,
        ok: false,
        problem: `the reported value is not a finite number (${budget.description}).`,
      };
    }
    if (value < 0) {
      return {
        ...base,
        measured: value,
        ok: false,
        problem: `the reported value is negative (${budget.description}).`,
      };
    }
    if (budget.min !== undefined && value < budget.min) {
      return {
        ...base,
        measured: value,
        ok: false,
        problem:
          `${formatBudgetValue(value, budget.unit)} is below the ${formatBudgetValue(budget.min, budget.unit)} ` +
          `minimum — the measurement is probably broken (${budget.description}).`,
      };
    }
    if (value > budget.limit) {
      return {
        ...base,
        measured: value,
        ok: false,
        problem:
          `${formatBudgetValue(value, budget.unit)} exceeds the ${formatBudgetValue(budget.limit, budget.unit)} ` +
          `budget (${budget.description}).`,
      };
    }
    return { ...base, measured: value, ok: true };
  });
}

/** Human-readable problem list for every budget a build failed. */
export function budgetProblems(results: readonly BudgetCheckResult[]): string[] {
  return results
    .filter((result) => !result.ok)
    .map((result) => `${result.name}: ${result.problem}`);
}

/** `bytes` renders as kilobytes (one decimal) for a human reading the table; `count` is a bare integer. */
export function formatBudgetValue(value: number, unit: BudgetUnit): string {
  return unit === 'bytes' ? `${(value / 1000).toFixed(1)} kB` : String(value);
}
