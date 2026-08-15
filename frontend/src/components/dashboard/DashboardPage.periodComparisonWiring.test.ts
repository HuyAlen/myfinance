import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UI-DASH-4 Period Comparison Layer — wiring contracts.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the existing pattern in
 * DashboardPage.budgetAttentionWiring.test.ts and
 * DashboardPage.navigationAdoption.test.ts.
 *
 * These tests prove DashboardPage wires the new comparison layer up
 * correctly: reuses the canonical pipeline for both current AND previous
 * windows, reuses the EXISTING fetch-range function rather than a new
 * formula (zero new query), scopes itself to month mode only, and never
 * renders a comparison while the underlying KPI is loading.
 */
describe("DashboardPage period comparison wiring (UI-DASH-4)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("imports the pure period-comparison helpers", () => {
    expect(source).toContain(
      '"@/src/lib/dashboard/dashboardPeriodComparison"',
    );
    const importIndex = source.indexOf(
      '"@/src/lib/dashboard/dashboardPeriodComparison"',
    );
    const importWindow = source.slice(Math.max(0, importIndex - 250), importIndex);
    expect(importWindow).toContain("buildDashboardComparison");
    expect(importWindow).toContain("isComparisonWindowLoaded");
    expect(importWindow).toContain("resolveMonthComparisonWindow");
  });

  it("reads filterMode from the shared date-filter context (not a locally reinvented mode)", () => {
    expect(source).toContain(
      "const { dateRange, selectedYear, filterMode } = useDateFilter();",
    );
  });

  it("the comparison is scoped to month mode only — quarter/year/custom stay unavailable", () => {
    const memoStart = source.indexOf("const periodComparison = useMemo(");
    expect(memoStart).toBeGreaterThan(-1);
    const memoEnd = source.indexOf(
      "function formatComparisonLabel",
      memoStart,
    );
    const memoSource = source.slice(memoStart, memoEnd);

    expect(memoSource).toContain('filterMode !== "month"');
    expect(memoSource).toContain("return unavailable");
  });

  it("reuses the EXISTING getDashboardFetchRange for its loaded-data boundary — no new fetch-range formula", () => {
    const occurrences = source.split("getDashboardFetchRange(").length - 1;
    // One definition site is not itself a call; count call sites only by
    // checking the two known call sites (reloadData/reloadPeriod) plus
    // this sprint's new read still resolve to the same function name.
    expect(occurrences).toBeGreaterThanOrEqual(3);

    const loadedRangeIndex = source.indexOf(
      "const loadedRangeStartDate = useMemo(",
    );
    expect(loadedRangeIndex).toBeGreaterThan(-1);
    const loadedRangeWindow = source.slice(loadedRangeIndex, loadedRangeIndex + 200);
    expect(loadedRangeWindow).toContain("getDashboardFetchRange(selectedYear)");
  });

  it("checks previous-window availability against the loaded boundary before computing anything — never a new query", () => {
    const memoStart = source.indexOf("const periodComparison = useMemo(");
    const memoEnd = source.indexOf("function formatComparisonLabel", memoStart);
    const memoSource = source.slice(memoStart, memoEnd);

    expect(memoSource).toContain(
      "isComparisonWindowLoaded(previous, loadedRangeStartDate)",
    );
    // No new network/Supabase call anywhere in this memo.
    expect(memoSource).not.toContain("getTransactionsInRange");
    expect(memoSource).not.toContain("supabase");
    expect(memoSource).not.toContain("await ");
  });

  it("previous-period Cash Flow reuses the exact same canonical helpers as the current period (getTotalIncome/getTotalExpense/isInternalTransferTransaction)", () => {
    const memoStart = source.indexOf("const periodComparison = useMemo(");
    const memoEnd = source.indexOf("function formatComparisonLabel", memoStart);
    const memoSource = source.slice(memoStart, memoEnd);

    expect(memoSource).toContain("isInternalTransferTransaction(transaction)");
    expect(memoSource).toContain("getTotalIncome(previousNonTransfer)");
    expect(memoSource).toContain("getTotalExpense(previousNonTransfer, categories)");
  });

  it("previous-period Saving Rate reuses the exact same canonical helpers as the current period (getNetSavingAllocation/getNetInvestmentAllocation/clampScore)", () => {
    const memoStart = source.indexOf("const periodComparison = useMemo(");
    const memoEnd = source.indexOf("function formatComparisonLabel", memoStart);
    const memoSource = source.slice(memoStart, memoEnd);

    expect(memoSource).toContain("getNetSavingAllocation(");
    expect(memoSource).toContain("getNetInvestmentAllocation(");
    expect(memoSource).toContain("clampScore(");
  });

  it("never substitutes a missing previous value with zero — buildDashboardComparison receives previousNetCashFlow/previousSavingRate directly, not a fallback", () => {
    const memoStart = source.indexOf("const periodComparison = useMemo(");
    const memoEnd = source.indexOf("function formatComparisonLabel", memoStart);
    const memoSource = source.slice(memoStart, memoEnd);

    expect(memoSource).toContain(
      "buildDashboardComparison(netCashFlow, previousNetCashFlow)",
    );
    const savingRateCallIndex = memoSource.indexOf(
      "buildDashboardComparison(\n        summary.savingRate,",
    );
    // CRLF-agnostic: locate the call by its first line, then confirm both
    // arguments appear within a small window rather than requiring an
    // exact multi-line literal match.
    const fallbackIndex = memoSource.indexOf("savingRate: buildDashboardComparison(");
    expect(savingRateCallIndex !== -1 || fallbackIndex !== -1).toBe(true);
    const anchor = savingRateCallIndex !== -1 ? savingRateCallIndex : fallbackIndex;
    const window = memoSource.slice(anchor, anchor + 100);
    expect(window).toContain("summary.savingRate");
    expect(window).toContain("previousSavingRate");
  });

  it("the Net Cash Flow and Saving Rate KPI cards each carry a comparison field derived from periodComparison, gated on an available label", () => {
    const kpiCardsStart = source.indexOf("const kpiCards = [");
    expect(kpiCardsStart).toBeGreaterThan(-1);
    const kpiCardsEnd = source.indexOf("] as const;", kpiCardsStart);
    const kpiCardsSource = source.slice(kpiCardsStart, kpiCardsEnd);

    expect(kpiCardsSource).toContain("cashFlowComparisonLabel");
    expect(kpiCardsSource).toContain("savingRateComparisonLabel");
    expect(kpiCardsSource).toContain("comparisonTone(periodComparison.cashFlow)");
    expect(kpiCardsSource).toContain("comparisonTone(periodComparison.savingRate)");
  });

  it("direction-to-tone interpretation lives in DashboardPage (metric-specific), not inside the generic comparison helper", () => {
    expect(source).toContain("function comparisonTone(");
    const toneStart = source.indexOf("function comparisonTone(");
    const toneWindow = source.slice(toneStart, toneStart + 300);
    expect(toneWindow).toContain('direction === "up"');
    expect(toneWindow).toContain('direction === "down"');
  });

  it("KpiCard only renders the comparison line outside the loading branch — no comparison shown while isLoading", () => {
    const kpiCardFnStart = source.indexOf("function KpiCard({");
    expect(kpiCardFnStart).toBeGreaterThan(-1);
    const kpiCardFnEnd = source.indexOf("function Panel(", kpiCardFnStart);
    const kpiCardSource = source.slice(kpiCardFnStart, kpiCardFnEnd);

    const loadingBranchIndex = kpiCardSource.indexOf("isLoading ? (");
    const comparisonIndex = kpiCardSource.indexOf("comparison && (");
    expect(loadingBranchIndex).toBeGreaterThan(-1);
    expect(comparisonIndex).toBeGreaterThan(loadingBranchIndex);
  });

  it("KpiCard reuses the existing toneStyles map for the comparison line — no new color system introduced", () => {
    const kpiCardFnStart = source.indexOf("function KpiCard({");
    const kpiCardFnEnd = source.indexOf("function Panel(", kpiCardFnStart);
    const kpiCardSource = source.slice(kpiCardFnStart, kpiCardFnEnd);

    expect(kpiCardSource).toContain("toneStyles[comparison.tone].value");
  });

  it("does not add a standalone Period Comparison section — no new top-level section marker introduced", () => {
    expect(source).not.toMatch(/\{\/\*\s*Period [Cc]omparison/);
  });

  it("Budget Pace is not implemented in this sprint (deferred) — Monthly Progress's existing budgetUsage/projectedBudgetUsage fields are untouched", () => {
    expect(source).toContain("budgetUsage,");
    expect(source).toContain("projectedBudgetUsage,");
    // No new comparison wiring for budget pace anywhere near monthlyPulse.
    const monthlyPulseStart = source.indexOf("const monthlyPulse = useMemo(");
    expect(monthlyPulseStart).toBeGreaterThan(-1);
    const monthlyPulseEnd = source.indexOf(
      "}, [budgets, dashboardMonthKey, selectedMonth, selectedYear, transactions]);",
      monthlyPulseStart,
    );
    const monthlyPulseSource = source.slice(monthlyPulseStart, monthlyPulseEnd);
    expect(monthlyPulseSource).not.toContain("buildDashboardComparison");
  });

  it("Net Worth's existing previous-period comparison (netWorthChartStats) is untouched — no second Net Worth comparison introduced", () => {
    expect(source).toContain("changeFromPrevious");
    // Only one occurrence of the Net Worth comparison field name — this
    // sprint did not duplicate or rename it.
    const occurrences = source.split("changeFromPrevious").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(1);
  });

  it("KPI contextual navigation (UI-DASH-3) remains unchanged: Net Cash Flow still routes to Transactions(month), and href wiring is untouched", () => {
    expect(source).toContain(
      "href: buildTransactionsHref({ month: dashboardMonthKey }),",
    );
    expect(source).toContain(
      "onClick={item.href ? () => router.push(item.href!) : undefined}",
    );
  });
});
