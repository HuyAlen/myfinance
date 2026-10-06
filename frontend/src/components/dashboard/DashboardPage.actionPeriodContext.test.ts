import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Action Center was intentionally removed, so its historical
 * `generateDashboardActions({ monthKey })` contract is no longer applicable.
 * Preserve one selected-month key for month-only surfaces while range-aware
 * drill-downs keep the active global period in non-month modes.
 */
describe("DashboardPage period context after Action Center removal", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("does not retain the removed Action Center generator", () => {
    expect(source).not.toContain("generateDashboardActions({");
    expect(source).not.toContain("const aiActions = useMemo(");
    expect(source).not.toContain("priorityActions");
  });

  it("dashboardMonthKey remains the single shared selected-month key", () => {
    expect(source.split("const dashboardMonthKey = useMemo(").length - 1).toBe(1);
    expect(source).toContain(
      "() => `${selectedYear}-${String(selectedMonth).padStart(2, \"0\")}`",
    );
  });

  it("Net Cash Flow KPI stays non-clickable because liquidity spans multiple domains", () => {
    const start = source.indexOf('title: "Dòng tiền ròng"');
    const end = source.indexOf('title: "Tiết kiệm & Đầu tư"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const kpi = source.slice(start, end);

    expect(kpi).toContain("href: undefined as string | undefined");
    expect(kpi).toContain(
      "Cash movement spans Transactions + Savings + Investments/Forex",
    );
  });

  it("Budget Attention and Monthly Progress still share dashboardMonthKey", () => {
    expect(source).toContain(
      "budgets.filter((budget) => budget.month.startsWith(dashboardMonthKey))",
    );
    expect(source).toContain("const monthKey = dashboardMonthKey;");
  });

  it("Transactions drill-down preserves month mode or the exact selected range", () => {
    expect(source).toContain("const dashboardTransactionPeriodNavigation = useMemo(");
    expect(source).toContain("? { month: dashboardMonthKey }");
    expect(source).toContain(
      ": { dateFrom: dateRange.startDate, dateTo: dateRange.endDate }",
    );
    const ctaIndex = source.indexOf("Xem tất cả giao dịch");
    expect(ctaIndex).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, ctaIndex - 700), ctaIndex);
    expect(before).toContain(
      "buildTransactionsHref(dashboardTransactionPeriodNavigation)",
    );
  });

  it("does not add a new transactions or budgets fetch", () => {
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });
});
