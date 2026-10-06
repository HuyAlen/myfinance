import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DASHBOARD-INTELLIGENCE-WAVE-1 cross-feature adoption", () => {
  const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

  it("adopts MONTHLY-SPENDING-PACE-1 without replacing canonical Budget math", () => {
    expect(source).toContain("buildMonthlySpendingPace({");
    expect(source).toContain('data-dashboard-intelligence="monthly-spending-pace"');
    expect(source).toContain("monthlyPulse.budgetLimit");
  });

  it("adopts FINANCE-REVIEW-INBOX-1 as derived review candidates", () => {
    expect(source).toContain("buildFinanceReviewInbox({");
    expect(source).toContain('data-dashboard-intelligence="review-inbox"');
    expect(source).toContain("getReviewReasonLabel");
  });

  it("adopts RECURRING-CASH-FORECAST-1 from all recurring events before UI slicing", () => {
    expect(source).toContain("const allUpcomingMoneyEvents = useMemo(() => {");
    const recurringForecastSource = source
      .slice(
        source.indexOf("const recurringCashForecast = useMemo("),
        source.indexOf("const safeToSpend", source.indexOf("const recurringCashForecast = useMemo(")),
      )
      .replace(/\s+/g, " ");
    expect(recurringForecastSource).toContain(
      "buildRecurringCashForecast( allUpcomingMoneyEvents, recurringReferenceDate, )",
    );
    expect(recurringForecastSource).not.toContain("new Date()");
    expect(source).toContain('data-dashboard-intelligence="recurring-cash-forecast"');
  });

  it("adopts INVESTMENT-ALLOCATION-OVERVIEW-1 with current Portfolio + Forex assets", () => {
    expect(source).toContain("buildInvestmentAllocationOverview({");
    expect(source).toContain("forexAssetValue: forexSnapshot.assetValue");
    expect(source).toContain('data-dashboard-intelligence="investment-allocation"');
  });

  it("adopts NET-WORTH-ATTRIBUTION-1 only from persisted Net Worth snapshots", () => {
    expect(source).toContain("buildNetWorthAttribution({");
    expect(source).toContain("snapshots: netWorthSnapshots");
    expect(source).toContain('data-dashboard-intelligence="net-worth-attribution"');
  });

  it("adopts DASHBOARD-PERIOD-COMPARISON-1 from FinanceFlow SSOT instead of KPI-local arithmetic", () => {
    expect(source).toContain("resolveMonthComparisonWindow(fullCurrentRange, todayKey)");
    expect(source).toContain("calculateFinanceFlowSnapshot({");
    expect(source).toContain("buildDashboardComparison(currentFlow.realExpense, previousFlow.realExpense)");
    expect(source).toContain('data-dashboard-intelligence="period-comparison"');
  });

  it("keeps the new intelligence layer presentation-only with no Supabase write path", () => {
    expect(source).not.toContain("dashboardIntelligenceRpc");
    expect(source).not.toContain("review_inbox");
  });
});
