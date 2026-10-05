import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DASHBOARD-PERIOD-COMPARISON-1", () => {
  const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

  it("uses the existing pure period-window helper and Finance Flow SSOT", () => {
    expect(source).toContain('"@/src/lib/dashboard/dashboardPeriodComparison"');
    expect(source).toContain("resolveMonthComparisonWindow(fullCurrentRange, todayKey)");
    expect(source).toContain("isComparisonWindowLoaded(window.previous, loadedRange.startDate)");
    expect(source).toContain("buildDashboardComparison(");
    expect(source).toContain("calculateFinanceFlowSnapshot({");
  });

  it("compares expense, net cash movement and future allocation with metric-specific semantics", () => {
    expect(source).toContain("currentFlow.realExpense");
    expect(source).toContain("currentFlow.netCashMovement");
    expect(source).toContain("currentFlow.futureAllocation");
    expect(source).toContain('label="Chi tiêu"');
    expect(source).toContain('label="Dòng tiền ròng"');
    expect(source).toContain('label="Tiết kiệm & đầu tư"');
    expect(source).toContain("lowerIsBetter");
  });

  it("keeps comparison out of KpiCard props and out of the Net Worth Hero", () => {
    const kpiStart = source.indexOf("function KpiCard({");
    const kpiEnd = source.indexOf("function ComparisonMetricRow(", kpiStart);
    const region = source.slice(kpiStart, kpiEnd > kpiStart ? kpiEnd : source.indexOf("function Panel(", kpiStart));
    expect(region).not.toContain("comparison,");
    expect(source).toContain("So với bản ghi trước");
  });

  it("renders a dedicated comparison intelligence surface", () => {
    expect(source).toContain('title="So với kỳ trước"');
    expect(source).toContain('data-dashboard-intelligence="period-comparison"');
  });
});
