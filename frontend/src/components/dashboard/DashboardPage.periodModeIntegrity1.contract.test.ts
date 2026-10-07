import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("DASHBOARD-PERIOD-MODE-INTEGRITY-1", () => {
  it("reads the active filter mode and distinguishes month-only surfaces", () => {
    expect(source).toContain("const { dateRange, selectedYear, filterMode } = useDateFilter();");
    expect(source).toContain('const isDashboardMonthMode = filterMode === "month";');
  });

  it("loads the full cross-year selected envelope without adding a transaction query", () => {
    expect(source).toContain(
      "function getDashboardFetchRange(\n  selectedYear: number,\n  selectedEndYear: number = selectedYear,",
    );
    expect(source).toContain(
      "Math.min(selectedYear, selectedEndYear, currentYear) - 1",
    );
    expect(source).toContain(
      "Math.max(selectedYear, selectedEndYear, currentYear)",
    );
    expect(source).toContain(
      "getDashboardFetchRange(selectedYear, selectedPeriodEndYear)",
    );
    expect(source).toContain(
      "getDashboardFetchRange(year, selectedPeriodEndYear)",
    );
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
  });

  it("revalidates period state when a custom range end year changes", () => {
    expect(source).toContain("const loadedPeriodEndYearRef = useRef<number | null>(null);");
    expect(source).toContain(
      "loadedPeriodEndYearRef.current !== selectedPeriodEndYear",
    );
    expect(source).toContain(
      "loadedPeriodEndYearRef.current = selectedPeriodEndYear",
    );
    expect(source).toContain(
      "[invalidatePeriodReadinessForNewContext, selectedPeriodEndYear]",
    );
  });

  it("uses the selected period end for Net Worth history and attribution", () => {
    expect(source).toContain("const selectedPeriodEndMonth = useMemo(");
    expect(source).toContain("selectedYear: selectedPeriodEndYear");
    expect(source).toContain("selectedMonth: selectedPeriodEndMonth");
    expect(source).toContain("/{selectedPeriodEndYear}");
  });

  it("never treats quarter/year/custom as the first month for month-only surfaces", () => {
    expect(source).toContain(
      'isDashboardSectionVisible(dashboardCustomization, "budget") &&\n            isDashboardMonthMode',
    );
    expect(source).toContain(
      'isDashboardSectionVisible(dashboardCustomization, "month-progress") &&\n            isDashboardMonthMode',
    );
    expect(source).toContain('data-dashboard-period-scope="month-only"');
    expect(source).toContain("if (!isDashboardMonthMode) return null;");
    expect(source).toContain(
      "isDashboardMonthMode && monthEndCloseout.visible",
    );
  });

  it("keeps period review and recent-transaction drill-downs on the exact selected range", () => {
    expect(source).toContain("const dashboardTransactionPeriodNavigation = useMemo(");
    expect(source).toContain("...dashboardTransactionPeriodNavigation");
    expect(source).toContain(
      "buildTransactionsHref(dashboardTransactionPeriodNavigation)",
    );
  });

  it("builds top-spending categories from the canonical filtered period", () => {
    expect(source).toContain(
      "buildCategorySpendingData(nonTransferFilteredTransactions, categories)",
    );
    expect(source).toContain(
      'subtitle="Các danh mục chi tiêu lớn nhất trong kỳ đang xem để nhận diện nơi cần tối ưu"',
    );
    expect(source).not.toContain(
      "date.getMonth() === selectedMonth - 1",
    );
  });

  it("adds no finance query or mutation", () => {
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getNetWorthSnapshotsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });
});
