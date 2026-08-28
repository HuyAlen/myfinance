import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatISODateInTimeZone,
  formatLocalISODate,
  formatYearMonthInTimeZone,
} from "@/src/lib/date/calendarDate";
import type { Category, Transaction } from "@/src/types/finance";
import { computeHealthScoreV2 } from "./analytics/healthScore";
import { computeSmartBudget } from "./analytics/smartBudget";
import { detectSpendingAnomalies } from "./analytics/spendingAnalytics";

const category = (
  id: string,
  planningGroup: Category["planningGroup"],
): Category => ({
  id,
  name: id,
  type: "expense",
  planningGroup,
});

const transaction = (
  id: string,
  categoryId: string,
  amount: number,
  date: string,
  type: Transaction["type"] = "expense",
): Transaction => ({
  id,
  type,
  amount,
  categoryId,
  walletId: "wallet-1",
  note: id,
  date,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FINAL-CROSSPAGE-AUDIT-1 runtime reconciliation", () => {
  it("keeps calendar-day helpers out of UTC drift at finance boundaries", () => {
    const localWallClock = new Date(2026, 7, 28, 0, 5, 0);
    expect(formatLocalISODate(localWallClock)).toBe("2026-08-28");

    const instant = new Date("2026-08-27T17:30:00.000Z");
    expect(formatISODateInTimeZone(instant, "Asia/Ho_Chi_Minh")).toBe(
      "2026-08-28",
    );
    expect(formatYearMonthInTimeZone(instant, "Asia/Ho_Chi_Minh")).toBe(
      "2026-08",
    );
  });

  it("excludes saving/investment allocations from Health Score spending concentration", () => {
    const categories: Category[] = [
      category("food", "variable"),
      category("transport", "fixed"),
      category("saving", "saving"),
    ];
    const transactions: Transaction[] = [
      transaction("food-expense", "food", 100, "2026-08-10"),
      transaction("transport-expense", "transport", 100, "2026-08-11"),
      transaction("saving-allocation", "saving", 1_000, "2026-08-12"),
    ];

    const health = computeHealthScoreV2(
      [],
      [],
      [],
      [],
      transactions,
      [],
      categories,
      3,
    );
    const concentration = health.factors.find(
      (factor) => factor.label === "Phân tán chi tiêu",
    );

    expect(concentration?.score).toBe(4);
    expect(concentration?.note).toContain("50%");
  });

  it("does not report saving-allocation spikes as spending anomalies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0));

    const categories = [category("saving", "saving")];
    const transactions = [
      transaction("aug", "saving", 1_000, "2026-08-05"),
      transaction("jul", "saving", 100, "2026-07-05"),
      transaction("jun", "saving", 100, "2026-06-05"),
      transaction("may", "saving", 100, "2026-05-05"),
      transaction("apr", "saving", 100, "2026-04-05"),
      transaction("mar", "saving", 100, "2026-03-05"),
    ];

    expect(detectSpendingAnomalies(transactions, categories, 6)).toEqual([]);
  });

  it("uses canonical Budget Spending semantics for historical Smart Budget trends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0));

    const categories = [category("future-fund", "saving")];
    const transactions = [
      transaction("aug", "future-fund", 300, "2026-08-05", "saving"),
      transaction("jul", "future-fund", 200, "2026-07-05", "saving"),
      transaction("jun", "future-fund", 100, "2026-06-05", "saving"),
    ];
    const analysis = computeSmartBudget(
      transactions,
      categories,
      [
        {
          id: "budget-aug",
          categoryId: "future-fund",
          month: "2026-08",
          limitAmount: 1_000,
        },
      ],
      3,
    );

    expect(analysis.categoryAnalysis[0]?.actualSpend).toBe(300);
    expect(analysis.categoryAnalysis[0]?.trend).toBe("increasing");
    expect(analysis.categoryAnalysis[0]?.trendRate).toBeGreaterThan(0);
  });
});
