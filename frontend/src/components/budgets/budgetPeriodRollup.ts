import type { Budget } from "@/src/types/finance";

export type BudgetPeriodBreakdown = {
  budgetId: string;
  month: string;
  originalLimit: number;
  effectiveLimit: number;
  spent: number;
  overlapDays: number;
  daysInMonth: number;
};

export type BudgetPeriodRollup = {
  categoryId: string;
  budgetIds: string[];
  months: string[];
  monthCount: number;
  rawLimit: number;
  limit: number;
  spent: number;
  remaining: number;
  percent: number;
  breakdown: BudgetPeriodBreakdown[];
};

type BuildBudgetPeriodRollupsInput = {
  budgets: Budget[];
  startDate: string;
  endDate: string;
  getSpent: (budget: Budget) => number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseMonth(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }
  return { year, monthNumber };
}

function isoFromUtc(year: number, monthIndex: number, day: number) {
  const value = new Date(Date.UTC(year, monthIndex, day));
  return value.toISOString().slice(0, 10);
}

function inclusiveDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / DAY_MS) + 1;
}

export function getBudgetMonthOverlap(
  month: string,
  startDate: string,
  endDate: string,
) {
  const parsed = parseMonth(month);
  if (!parsed || startDate > endDate) {
    return { overlapDays: 0, daysInMonth: 0, ratio: 0 };
  }

  const { year, monthNumber } = parsed;
  const monthIndex = monthNumber - 1;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthStart = isoFromUtc(year, monthIndex, 1);
  const monthEnd = isoFromUtc(year, monthIndex, daysInMonth);
  const overlapStart = startDate > monthStart ? startDate : monthStart;
  const overlapEnd = endDate < monthEnd ? endDate : monthEnd;

  if (overlapStart > overlapEnd) {
    return { overlapDays: 0, daysInMonth, ratio: 0 };
  }

  const overlapDays = inclusiveDays(overlapStart, overlapEnd);
  return {
    overlapDays,
    daysInMonth,
    ratio: overlapDays / daysInMonth,
  };
}

/**
 * Canonical presentation rollup for Budget periods.
 *
 * Storage remains monthly (one Budget row per category/month). For any selected
 * date range, rows are grouped by category. Limit amounts are weighted by the
 * portion of each calendar month that intersects the selected period, while
 * spending is supplied by the page's canonical calculateBudgetSpending path.
 */
export function buildBudgetPeriodRollups({
  budgets,
  startDate,
  endDate,
  getSpent,
}: BuildBudgetPeriodRollupsInput): BudgetPeriodRollup[] {
  const byCategory = new Map<
    string,
    Omit<BudgetPeriodRollup, "remaining" | "percent" | "monthCount">
  >();

  for (const budget of budgets) {
    const overlap = getBudgetMonthOverlap(budget.month, startDate, endDate);
    if (overlap.overlapDays <= 0) continue;

    const effectiveLimit = Math.round(budget.limitAmount * overlap.ratio);
    const spent = getSpent(budget);
    const current = byCategory.get(budget.categoryId) ?? {
      categoryId: budget.categoryId,
      budgetIds: [],
      months: [],
      rawLimit: 0,
      limit: 0,
      spent: 0,
      breakdown: [],
    };

    current.budgetIds.push(budget.id);
    if (!current.months.includes(budget.month)) current.months.push(budget.month);
    current.rawLimit += budget.limitAmount;
    current.limit += effectiveLimit;
    current.spent += spent;
    current.breakdown.push({
      budgetId: budget.id,
      month: budget.month,
      originalLimit: budget.limitAmount,
      effectiveLimit,
      spent,
      overlapDays: overlap.overlapDays,
      daysInMonth: overlap.daysInMonth,
    });
    byCategory.set(budget.categoryId, current);
  }

  return [...byCategory.values()]
    .map((rollup) => {
      rollup.months.sort();
      rollup.breakdown.sort((a, b) => a.month.localeCompare(b.month));
      const remaining = rollup.limit - rollup.spent;
      return {
        ...rollup,
        monthCount: rollup.months.length,
        remaining,
        percent:
          rollup.limit > 0 ? Math.round((rollup.spent / rollup.limit) * 100) : 0,
      };
    })
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId));
}
