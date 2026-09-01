import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "BudgetsPage.tsx"), "utf8");

describe("BUDGET-PERIOD-AGGREGATION-1 page integration", () => {
  it("builds one canonical period rollup model from filtered monthly rows", () => {
    expect(source).toContain("buildBudgetPeriodRollups");
    expect(source).toContain("const periodBudgetRollups = useMemo");
    expect(source).toContain("startDate: dateRange.startDate");
    expect(source).toContain("endDate: dateRange.endDate");
  });

  it("uses rollups for KPI summary and allocation chart", () => {
    expect(source).toContain("const realExpenseRollups = periodBudgetRollups.filter");
    expect(source).toContain("periodBudgetRollups.map((rollup, index) => ({");
  });

  it("uses the same rollups for financial planning instead of duplicating monthly categories", () => {
    expect(source).toContain("periodBudgetRollups.forEach((rollup) => {");
    expect(source).not.toContain("filteredBudgets.forEach((budget) => {");
  });

  it("keeps monthly CRUD but renders synthetic category cards for multi-period filters", () => {
    expect(source).toContain('filterMode === "month"');
    expect(source).toContain("const displayBudgets = useMemo<BudgetCardModel[]>");
    expect(source).toContain("{displayBudgets.map((budget) => {");
    expect(source).toContain("!budget.isPeriodRollup");
  });

  it("drills aggregate cards into the exact selected date range", () => {
    expect(source).toContain("buildTransactionsHref({");
    expect(source).toContain("dateFrom: dateRange.startDate");
    expect(source).toContain("dateTo: dateRange.endDate");
  });

  it("exposes monthly breakdown instead of editing or deleting a synthetic rollup", () => {
    expect(source).toContain("periodBreakdown");
    expect(source).toContain("Chi tiết");
    expect(source).toContain("overlapDays");
    expect(source).toContain("daysInMonth");
  });
});
