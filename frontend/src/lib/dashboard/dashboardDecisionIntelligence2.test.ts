import { describe, expect, it } from "vitest";
import {
  buildCashRunwayForecast,
  buildFinanceDataHealth,
  buildMonthEndCloseout,
  buildSafeToSpend,
  expandRecurringScheduleOccurrences,
} from "./dashboardIntelligence";

describe("DASHBOARD-DECISION-INTELLIGENCE-2 pure decision helpers", () => {
  it("expands monthly recurrence with end-of-month clamping and restores the anchor day", () => {
    const occurrences = expandRecurringScheduleOccurrences(
      [{
        id: "rent",
        title: "Rent",
        categoryId: "rent",
        categoryName: "Rent",
        amount: 1_000_000,
        type: "expense",
        nextRunDate: "2026-01-31",
        recurrence: "monthly",
      }],
      "2026-01-30",
      65,
    );
    expect(occurrences.map((item) => [item.date.getMonth() + 1, item.date.getDate()])).toEqual([
      [1, 31],
      [2, 28],
      [3, 31],
    ]);
  });

  it("deduplicates category and legacy recurring rows for the same category/date/amount", () => {
    const occurrences = expandRecurringScheduleOccurrences(
      [
        { id: "category-rent", title: "Rent", categoryId: "rent", categoryName: "Rent", amount: 2_000_000, type: "expense", nextRunDate: "2026-10-05" },
        { id: "transaction-rent", title: "Rent legacy", categoryId: "rent", categoryName: "Rent", amount: 2_000_000, type: "expense", nextRunDate: "2026-10-05" },
      ],
      "2026-10-01",
      30,
    );
    expect(occurrences).toHaveLength(1);
  });

  it("keeps Safe to Spend conservative by reserving recurring expense and not pre-spending future income", () => {
    const occurrences = expandRecurringScheduleOccurrences(
      [
        { id: "rent", title: "Rent", categoryId: "rent", amount: 2_000_000, type: "expense", nextRunDate: "2026-10-10" },
        { id: "salary", title: "Salary", categoryId: "salary", amount: 20_000_000, type: "income", nextRunDate: "2026-10-25" },
      ],
      "2026-10-01",
      30,
    );
    const result = buildSafeToSpend({
      selectedMonthKey: "2026-10",
      today: "2026-10-01",
      spendableCash: 8_000_000,
      budgetConfigured: true,
      budgetRemaining: 5_000_000,
      budgetedCategoryIds: ["rent"],
      occurrences,
    });
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.budgetReservedForRecurring).toBe(2_000_000);
    expect(result.expectedRecurringIncome).toBe(20_000_000);
    expect(result.budgetCapacity).toBe(3_000_000);
    expect(result.liquidityCapacity).toBe(6_000_000);
    expect(result.amount).toBe(3_000_000);
    expect(result.limitingConstraint).toBe("budget");
  });

  it("makes liquidity the Safe-to-Spend constraint when wallet cash is tighter than the budget", () => {
    const result = buildSafeToSpend({
      selectedMonthKey: "2026-10",
      today: "2026-10-01",
      spendableCash: 2_500_000,
      budgetConfigured: true,
      budgetRemaining: 9_000_000,
      budgetedCategoryIds: [],
      occurrences: [{ id: "bill:2026-10-03", scheduleId: "bill", title: "Bill", amount: 1_000_000, type: "expense", date: new Date("2026-10-03") }],
    });
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.amount).toBe(1_500_000);
    expect(result.limitingConstraint).toBe("liquidity");
  });

  it("projects 30/60/90 recurring cash runway and the lowest balance", () => {
    const forecast = buildCashRunwayForecast({
      startingBalance: 10_000_000,
      today: "2026-10-01",
      occurrences: [
        { id: "a", scheduleId: "a", title: "Rent", amount: 4_000_000, type: "expense", date: new Date("2026-10-10") },
        { id: "b", scheduleId: "b", title: "Salary", amount: 6_000_000, type: "income", date: new Date("2026-11-05") },
        { id: "c", scheduleId: "c", title: "Insurance", amount: 8_000_000, type: "expense", date: new Date("2026-12-15") },
      ],
    });
    expect(forecast.points.map((item) => item.projectedBalance)).toEqual([6_000_000, 12_000_000, 4_000_000]);
    expect(forecast.lowPointBalance).toBe(4_000_000);
    expect(forecast.lowPointDate).toBe("2026-12-15");
  });

  it("reports only evidence-backed current-month data health issues", () => {
    const health = buildFinanceDataHealth({
      selectedMonthKey: "2026-10",
      today: "2026-10-05",
      reviewInbox: { total: 3, uncategorizedCount: 1, duplicateCount: 2, unusualExpenseCount: 0, items: [] },
      netWorthSnapshots: [],
      invalidRecurringScheduleCount: 1,
      hasFinancialData: true,
    });
    expect(health.available).toBe(true);
    if (!health.available) return;
    expect(health.issues.map((item) => item.key)).toEqual([
      "missing-category",
      "possible-duplicate",
      "recurring-config",
      "net-worth-snapshot",
    ]);
  });

  it("shows closeout only in the final five days or first three days of the following month", () => {
    expect(buildMonthEndCloseout({ selectedMonthKey: "2026-10", today: "2026-10-27", budgetConfigured: true, budgetUsage: 80, reviewPending: 0, overBudgetCount: 0, netCashMovement: 1, netWorthDelta: null }).visible).toBe(true);
    const review = buildMonthEndCloseout({ selectedMonthKey: "2026-10", today: "2026-11-02", budgetConfigured: true, budgetUsage: 80, reviewPending: 0, overBudgetCount: 0, netCashMovement: 1, netWorthDelta: null });
    expect(review.visible).toBe(true);
    if (review.visible) expect(review.mode).toBe("review");
    expect(buildMonthEndCloseout({ selectedMonthKey: "2026-10", today: "2026-10-15", budgetConfigured: true, budgetUsage: 80, reviewPending: 0, overBudgetCount: 0, netCashMovement: 1, netWorthDelta: null }).visible).toBe(false);
  });
});
