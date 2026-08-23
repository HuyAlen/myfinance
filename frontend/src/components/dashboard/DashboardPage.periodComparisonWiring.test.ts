import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dashboard KPI period-comparison UI was intentionally removed.
 *
 * Keep Net Worth's own chart comparison (`changeFromPrevious`) intact, but
 * prevent the two red-highlighted KPI footer rows ("so với kỳ trước") from
 * being reintroduced on Net Cash Flow / Saving & Investment.
 */
describe("DashboardPage KPI period comparison removal", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("removes the standalone Dashboard period-comparison dependency and memo", () => {
    expect(source).not.toContain(
      '"@/src/lib/dashboard/dashboardPeriodComparison"',
    );
    expect(source).not.toContain("const periodComparison = useMemo(");
    expect(source).not.toContain("buildDashboardComparison(");
    expect(source).not.toContain("resolveMonthComparisonWindow(");
    expect(source).not.toContain("isComparisonWindowLoaded(");
  });

  it("removes both KPI comparison labels and tone mapping", () => {
    expect(source).not.toContain("cashFlowComparisonLabel");
    expect(source).not.toContain("savingRateComparisonLabel");
    expect(source).not.toContain("function comparisonTone(");
    expect(source).not.toContain("formatComparisonLabel(");
  });

  it("Net Cash Flow and Saving & Investment KPI definitions no longer carry a comparison field", () => {
    const kpiCardsStart = source.indexOf("const kpiCards = [");
    expect(kpiCardsStart).toBeGreaterThan(-1);
    const kpiCardsEnd = source.indexOf("] as const;", kpiCardsStart);
    expect(kpiCardsEnd).toBeGreaterThan(kpiCardsStart);
    const kpiCardsSource = source.slice(kpiCardsStart, kpiCardsEnd);

    expect(kpiCardsSource).toContain('title: "Dòng tiền ròng"');
    expect(kpiCardsSource).toContain('title: "Tiết kiệm & Đầu tư"');
    expect(kpiCardsSource).not.toContain("comparison:");
  });

  it("KpiCard no longer accepts or renders a comparison prop", () => {
    const start = source.indexOf("function KpiCard({");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("function Panel(", start);
    expect(end).toBeGreaterThan(start);
    const kpiCardSource = source.slice(start, end);

    expect(kpiCardSource).not.toContain("comparison,");
    expect(kpiCardSource).not.toContain("comparison && (");
    expect(kpiCardSource).not.toContain("toneStyles[comparison.tone]");
  });

  it("keeps the existing Net Worth chart comparison untouched", () => {
    expect(source).toContain("changeFromPrevious");
    expect(source).toContain("So với kỳ trước");
    expect(source).toContain("netWorthChartStats.changeFromPrevious");
  });

  it("KPI contextual navigation remains intact", () => {
    expect(source).toContain(
      "href: buildTransactionsHref({ month: dashboardMonthKey }),",
    );
    expect(source).toContain(
      "onClick={item.href ? () => router.push(item.href!) : undefined}",
    );
  });
});
