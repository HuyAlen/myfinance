import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

describe("DASHBOARD-DECISION-INTELLIGENCE-2 Dashboard wiring", () => {
  it("reuses canonical budget spending for Safe to Spend", () => {
    expect(source).toContain("calculateBudgetSpendingCollection({");
    expect(source).toContain("const budgetSpendingSnapshot = useMemo(");
    expect(source).toContain("const budgetRemaining = useMemo(");
    expect(source).toContain("buildSafeToSpend({");
  });

  it("uses one normalized recurring occurrence stream for upcoming, runway and Safe to Spend", () => {
    expect(source).toContain("const recurringSchedules = useMemo(() => {");
    expect(source).toContain("expandRecurringScheduleOccurrences(recurringSchedules, new Date(), 90)");
    expect(source).toContain("const recurringOccurrences = useMemo(");
    expect(source).toContain("buildCashRunwayForecast({");
    expect(source).toContain("occurrences: recurringOccurrences");
  });

  it("renders the four requested decision surfaces", () => {
    expect(source).toContain('data-dashboard-decision="safe-to-spend"');
    expect(source).toContain('data-dashboard-decision="cash-runway"');
    expect(source).toContain('data-dashboard-decision="data-health"');
    expect(source).toContain('data-dashboard-decision="month-end-closeout"');
  });

  it("keeps Safe to Spend current-month only and does not count expected income as wallet cash", () => {
    expect(source).toContain("selectedMonthKey: dashboardMonthKey");
    expect(source).toContain("spendableCash: summary.liquidBalance");
    expect(source).toContain("budgetedCategoryIds");
  });

  it("adds no new storage read or Supabase query", () => {
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
    expect(source).not.toContain("getRecurringForecast");
    expect(source).not.toContain("saveMonthEndCloseout");
  });
});
