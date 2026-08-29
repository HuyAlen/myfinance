import { describe, expect, it } from "vitest";
import type { Budget } from "@/src/types/finance";
import {
  buildBudgetPeriodRollups,
  getBudgetMonthOverlap,
} from "./budgetPeriodRollup";

function budget(
  id: string,
  categoryId: string,
  month: string,
  limitAmount: number,
): Budget {
  return { id, categoryId, month, limitAmount };
}

describe("BUDGET-PERIOD-AGGREGATION-1 canonical rollup", () => {
  it("rolls three monthly rows of the same category into one Q1 category", () => {
    const rows = [
      budget("jan", "food", "2026-01", 5_000_000),
      budget("feb", "food", "2026-02", 5_000_000),
      budget("mar", "food", "2026-03", 6_000_000),
    ];
    const spent = new Map([
      ["jan", 4_000_000],
      ["feb", 3_000_000],
      ["mar", 5_000_000],
    ]);

    const result = buildBudgetPeriodRollups({
      budgets: rows,
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      getSpent: (row) => spent.get(row.id) ?? 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      categoryId: "food",
      monthCount: 3,
      limit: 16_000_000,
      spent: 12_000_000,
      remaining: 4_000_000,
      percent: 75,
    });
  });

  it("keeps different categories separate while rolling each category", () => {
    const rows = [
      budget("food-jan", "food", "2026-01", 1_000_000),
      budget("food-feb", "food", "2026-02", 1_000_000),
      budget("rent-jan", "rent", "2026-01", 3_000_000),
      budget("rent-feb", "rent", "2026-02", 3_000_000),
    ];

    const result = buildBudgetPeriodRollups({
      budgets: rows,
      startDate: "2026-01-01",
      endDate: "2026-02-28",
      getSpent: () => 0,
    });

    expect(result).toHaveLength(2);
    expect(result.find((item) => item.categoryId === "food")?.limit).toBe(
      2_000_000,
    );
    expect(result.find((item) => item.categoryId === "rent")?.limit).toBe(
      6_000_000,
    );
  });

  it("prorates first and last month for a custom Jan 15 to Feb 15 range", () => {
    const rows = [
      budget("jan", "food", "2026-01", 3_100_000),
      budget("feb", "food", "2026-02", 2_800_000),
    ];

    const result = buildBudgetPeriodRollups({
      budgets: rows,
      startDate: "2026-01-15",
      endDate: "2026-02-15",
      getSpent: () => 0,
    });

    expect(result[0].breakdown[0]).toMatchObject({
      overlapDays: 17,
      daysInMonth: 31,
      effectiveLimit: 1_700_000,
    });
    expect(result[0].breakdown[1]).toMatchObject({
      overlapDays: 15,
      daysInMonth: 28,
      effectiveLimit: 1_500_000,
    });
    expect(result[0].limit).toBe(3_200_000);
  });

  it("uses 29 days for leap-year February", () => {
    const overlap = getBudgetMonthOverlap(
      "2028-02",
      "2028-02-01",
      "2028-02-15",
    );
    expect(overlap).toEqual({ overlapDays: 15, daysInMonth: 29, ratio: 15 / 29 });
  });

  it("ignores rows that do not intersect the selected range", () => {
    const result = buildBudgetPeriodRollups({
      budgets: [budget("apr", "food", "2026-04", 1_000_000)],
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      getSpent: () => 123,
    });
    expect(result).toEqual([]);
  });

  it("sorts monthly breakdown chronologically", () => {
    const result = buildBudgetPeriodRollups({
      budgets: [
        budget("mar", "food", "2026-03", 1),
        budget("jan", "food", "2026-01", 1),
        budget("feb", "food", "2026-02", 1),
      ],
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      getSpent: () => 0,
    });
    expect(result[0].months).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});
