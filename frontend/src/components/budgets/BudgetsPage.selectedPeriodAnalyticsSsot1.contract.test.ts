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

describe("BUDGET-SELECTED-PERIOD-ANALYTICS-SSOT-1 page wiring", () => {
  it("anchors monthly Smart Budget analytics to the DateFilter selected month", () => {
    const block = sliceBetween(
      "const smartBudget = useMemo",
      "const selectedPeriodViolations",
    );

    expect(block).toContain("computeSmartBudget(");
    expect(block).toContain("activeMonth");
  });

  it("derives non-month violations from selected period rollups", () => {
    const block = sliceBetween(
      "const selectedPeriodViolations = useMemo",
      "const selectedPeriodTrends",
    );

    expect(block).toContain('filterMode === "month"');
    expect(block).toContain("smartBudget.violations");
    expect(block).toContain("periodBudgetRollups");
    expect(block).toContain("isRealExpenseGroup");
    expect(block).toMatch(/rollup\.spent\s*>\s*rollup\.limit/);
  });

  it("uses trend signals only for a single selected month", () => {
    const block = sliceBetween(
      "const selectedPeriodTrends = useMemo",
      "const filteredBudgets = useMemo",
    );

    expect(block).toContain('filterMode === "month"');
    expect(block).toContain("smartBudget.overspendingTrend");
    expect(block).toContain("[]");
  });

  it("scores and labels health from selected-period signals only", () => {
    const healthBlock = sliceBetween(
      "const budgetHealthScore = useMemo",
      "// ── NEW: Category analysis lookup map",
    );

    expect(healthBlock).toContain("selectedPeriodViolations.length");
    expect(healthBlock).toContain("selectedPeriodTrends.length");
    expect(healthBlock).not.toContain("realExpenseViolations.length");
    expect(healthBlock).not.toContain("realExpenseTrends.length");

    expect(source).toContain(
      "`${selectedPeriodViolations.length} danh mục cần rà soát · ${healthGrade.label}`",
    );
  });
});
