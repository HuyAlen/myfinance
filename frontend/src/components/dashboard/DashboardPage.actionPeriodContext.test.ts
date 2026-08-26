import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Action Center was intentionally removed, so its historical
 * `generateDashboardActions({ monthKey })` contract is no longer applicable.
 * Preserve the selected-month key for the Dashboard surfaces that still use it.
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

  it("Net Cash Flow KPI still carries the selected month to Transactions", () => {
    expect(source).toContain(
      "href: buildTransactionsHref({ month: dashboardMonthKey }),",
    );
  });

  it("Budget Attention and Monthly Progress still share dashboardMonthKey", () => {
    expect(source).toContain(
      "budgets.filter((budget) => budget.month.startsWith(dashboardMonthKey))",
    );
    expect(source).toContain("const monthKey = dashboardMonthKey;");
  });

  it("Transactions 'Xem tất cả' still preserves the selected month", () => {
    const ctaIndex = source.indexOf("Xem tất cả giao dịch");
    expect(ctaIndex).toBeGreaterThan(-1);
    const before = source.slice(Math.max(0, ctaIndex - 500), ctaIndex);
    expect(before).toContain(
      "router.push(buildTransactionsHref({ month: dashboardMonthKey }))",
    );
  });

  it("does not add a new transactions or budgets fetch", () => {
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });
});
