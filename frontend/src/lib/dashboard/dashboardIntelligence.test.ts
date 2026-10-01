import { describe, expect, it } from "vitest";
import {
  buildFinanceReviewInbox,
  buildInvestmentAllocationOverview,
  buildMonthlySpendingPace,
  buildNetWorthAttribution,
  buildRecurringCashForecast,
} from "./dashboardIntelligence";
import type { Category, NetWorthSnapshot, Transaction } from "@/src/types/finance";

const categories: Category[] = [
  { id: "food", name: "Ăn uống", type: "expense", planningGroup: "variable" },
  { id: "salary", name: "Lương", type: "income", planningGroup: "income" },
];

function tx(overrides: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    type: "expense",
    amount: 100_000,
    categoryId: "food",
    walletId: "wallet-1",
    note: "",
    date: "2026-10-01",
    ...overrides,
  };
}

describe("MONTHLY-SPENDING-PACE-1", () => {
  it("compares budget usage with elapsed-month pace", () => {
    expect(buildMonthlySpendingPace({ spent: 6_000_000, budgetLimit: 10_000_000, elapsedDays: 10, daysInMonth: 20 })).toMatchObject({
      available: true,
      timeProgress: 50,
      spendingProgress: 60,
      paceDelta: 10,
      status: "faster",
      idealSpendToDate: 5_000_000,
      remainingBudget: 4_000_000,
    });
  });

  it("fails closed when no budget exists", () => {
    expect(buildMonthlySpendingPace({ spent: 1, budgetLimit: 0, elapsedDays: 10, daysInMonth: 30 })).toEqual({ available: false });
  });
});

describe("FINANCE-REVIEW-INBOX-1", () => {
  it("detects stale categories, likely duplicates and unusually large expenses", () => {
    const transactions = [
      tx({ id: "a", note: "Coffee", amount: 50_000 }),
      tx({ id: "b", note: "Coffee", amount: 50_000 }),
      tx({ id: "c", amount: 60_000 }),
      tx({ id: "d", amount: 70_000 }),
      tx({ id: "e", amount: 80_000 }),
      tx({ id: "f", amount: 1_000_000 }),
      tx({ id: "g", categoryId: "missing", amount: 90_000 }),
    ];
    const result = buildFinanceReviewInbox({ transactions, categories });
    expect(result.duplicateCount).toBe(2);
    expect(result.uncategorizedCount).toBe(1);
    expect(result.unusualExpenseCount).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(4);
  });
});

describe("RECURRING-CASH-FORECAST-1", () => {
  it("deduplicates mirror schedules and rolls 7/30-day cash flow", () => {
    const result = buildRecurringCashForecast(
      [
        { id: "a", type: "expense", amount: 500_000, date: "2026-10-05", categoryName: "Internet" },
        { id: "b", type: "expense", amount: 500_000, date: "2026-10-05", categoryName: "Internet" },
        { id: "c", type: "income", amount: 30_000_000, date: "2026-10-20", categoryName: "Lương" },
      ],
      "2026-10-01",
    );
    expect(result.eventCount30).toBe(2);
    expect(result.expense7).toBe(500_000);
    expect(result.income30).toBe(30_000_000);
    expect(result.net30).toBe(29_500_000);
  });
});

describe("INVESTMENT-ALLOCATION-OVERVIEW-1", () => {
  it("combines portfolio types with Forex without mutating investment semantics", () => {
    const result = buildInvestmentAllocationOverview({
      investments: [
        { id: "s", name: "ETF", type: "fund", investedAmount: 4_000_000, currentValue: 5_000_000 },
        { id: "g", name: "Gold", type: "gold", investedAmount: 2_000_000, currentValue: 2_000_000 },
      ],
      forexAssetValue: 3_000_000,
    });
    expect(result.total).toBe(10_000_000);
    expect(result.buckets.map((item) => item.label)).toEqual(["Quỹ", "Forex", "Vàng"]);
    expect(result.buckets[0].percent).toBe(50);
  });
});

describe("NET-WORTH-ATTRIBUTION-1", () => {
  it("explains canonical snapshot delta by asset and debt components", () => {
    const snapshots: NetWorthSnapshot[] = [
      { id: "1", snapshotMonth: "2026-09", cashAndWallets: 10, savings: 20, investments: 30, forex: 40, totalAssets: 100, totalDebt: 10, netWorth: 90, capturedAt: "2026-09-30T00:00:00Z" },
      { id: "2", snapshotMonth: "2026-10", cashAndWallets: 12, savings: 25, investments: 29, forex: 50, totalAssets: 116, totalDebt: 6, netWorth: 110, capturedAt: "2026-10-31T00:00:00Z" },
    ];
    const result = buildNetWorthAttribution({ snapshots, selectedYear: 2026, selectedMonth: 10 });
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.netWorthDelta).toBe(20);
    expect(result.items.find((item) => item.key === "debt")?.delta).toBe(4);
    expect(result.items.reduce((sum, item) => sum + item.delta, 0)).toBe(20);
  });
});
