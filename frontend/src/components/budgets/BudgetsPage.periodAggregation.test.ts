import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "BudgetsPage.tsx"), "utf8");

function sliceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("BUDGET-PERIOD-AGGREGATION-1 page integration", () => {
  it("builds one canonical period rollup model from filtered monthly rows", () => {
    expect(source).toContain("buildBudgetPeriodRollups");
    expect(source).toContain("const periodBudgetRollups = useMemo");
    expect(source).toContain("startDate: dateRange.startDate");
    expect(source).toContain("endDate: dateRange.endDate");
  });

  it("uses rollups for KPI summary and sorts allocation by limit descending", () => {
    expect(source).toContain("const realExpenseRollups = periodBudgetRollups.filter");

    const pieDataBlock = sliceBetween(
      "const pieData = useMemo",
      "// BUDGET-ALLOCATION-COLUMN-MAJOR-1",
    );

    expect(pieDataBlock).toContain("[...periodBudgetRollups]");
    expect(pieDataBlock).toContain("const limitDiff = b.limit - a.limit;");
    expect(pieDataBlock).toContain("if (limitDiff !== 0) return limitDiff;");
    expect(pieDataBlock).toContain('return nameA.localeCompare(nameB, "vi");');
    expect(pieDataBlock).toContain(".map((rollup, index) => ({");
    expect(pieDataBlock).toContain("value: rollup.limit");
  });

  it("renders desktop allocation in column-major descending order", () => {
    const columnBlock = sliceBetween(
      "// BUDGET-ALLOCATION-COLUMN-MAJOR-1",
      "// ── NEW: Health score",
    );

    expect(columnBlock).toContain("Math.ceil(pieData.length / 2)");
    expect(columnBlock).toContain("pieData.slice(0, splitIndex)");
    expect(columnBlock).toContain("pieData.slice(splitIndex)");
    expect(source).toContain("{allocationColumns.map((column, columnIndex) => (");
    expect(source).toContain("{column.map((item) => (");
    expect(source).toContain('className="space-y-2 md:hidden"');
    expect(source).toContain('className="hidden gap-x-8 md:grid md:grid-cols-2"');
  });

  it("keeps budget-card ranking separate and based on actual spend descending", () => {
    const cardSortBlock = sliceBetween(
      "const sortedDisplayBudgets = useMemo",
      "// ── Selected-period budget summary",
    );

    expect(cardSortBlock).toContain(
      "const spentA = a.periodSpent ?? getSpent(a);",
    );
    expect(cardSortBlock).toContain(
      "const spentB = b.periodSpent ?? getSpent(b);",
    );
    expect(cardSortBlock).toContain("return spentB - spentA;");
    expect(cardSortBlock).not.toContain("limitAmount");
    expect(source).toContain("{sortedDisplayBudgets.map((budget) => {");
  });

  it("uses the same rollups for financial planning instead of duplicating monthly categories", () => {
    expect(source).toContain("periodBudgetRollups.forEach((rollup) => {");
    expect(source).not.toContain("filteredBudgets.forEach((budget) => {");
  });

  it("keeps monthly CRUD but renders synthetic category cards for multi-period filters", () => {
    expect(source).toContain('filterMode === "month"');
    expect(source).toContain("const displayBudgets = useMemo<BudgetCardModel[]>");
    expect(source).toContain("{sortedDisplayBudgets.map((budget) => {");
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
