import { describe, expect, it } from "vitest";
import type { Budget, Category, Transaction } from "@/src/types/finance";
import { computeSmartBudget } from "./smartBudget";

const categories: Category[] = [
  {
    id: "cat-food",
    name: "Ăn uống",
    type: "expense",
    planningGroup: "variable",
  },
];

function budget(month: string, limitAmount: number): Budget {
  return {
    id: `budget-food-${month}`,
    categoryId: "cat-food",
    month,
    limitAmount,
  };
}

function tx(id: string, date: string, amount: number): Transaction {
  return {
    id,
    type: "expense",
    amount,
    categoryId: "cat-food",
    walletId: "wallet-1",
    note: "",
    date,
  };
}

describe("BUDGET-SELECTED-PERIOD-ANALYTICS-SSOT-1 smart-budget anchor", () => {
  it("uses the explicit selected month for status and violations instead of wall-clock month", () => {
    const result = computeSmartBudget(
      [
        tx("june", "2025-06-10", 100_000),
        tx("july", "2025-07-10", 200_000),
        tx("aug", "2025-08-10", 400_000),
        tx("later", "2026-10-10", 9_000_000),
      ],
      categories,
      [budget("2025-08", 300_000), budget("2026-10", 20_000_000)],
      3,
      "2025-08",
    );

    const food = result.categoryAnalysis.find(
      (item) => item.categoryId === "cat-food",
    );

    expect(result.currentMonth).toBe("2025-08");
    expect(food).toMatchObject({
      budgetLimit: 300_000,
      actualSpend: 400_000,
      variance: 100_000,
      status: "over",
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({
      categoryId: "cat-food",
      budgetLimit: 300_000,
      actualSpend: 400_000,
      overage: 100_000,
    });
  });

  it("anchors the lookback trend to the selected month", () => {
    const result = computeSmartBudget(
      [
        tx("june", "2025-06-10", 100_000),
        tx("july", "2025-07-10", 200_000),
        tx("aug", "2025-08-10", 400_000),
      ],
      categories,
      [budget("2025-08", 1_000_000)],
      3,
      "2025-08",
    );

    const food = result.categoryAnalysis.find(
      (item) => item.categoryId === "cat-food",
    );

    expect(food?.trend).toBe("increasing");
    expect(food?.trendRate).toBeGreaterThan(8);
    expect(result.overspendingTrend.map((item) => item.categoryId)).toEqual([
      "cat-food",
    ]);
  });
});
