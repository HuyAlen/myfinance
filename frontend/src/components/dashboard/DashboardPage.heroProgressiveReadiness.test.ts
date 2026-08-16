import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PERF-4B — Dashboard Critical Path Reduction.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the existing pattern in
 * DashboardPage.actionCenterReadiness.test.ts.
 *
 * The PERF-4 audit found the Net Worth Hero treated its headline, 5 asset-
 * category buckets, period comparison, and trend chart as one all-or-
 * nothing unit gated by `heroReady` (isDashboardReady && cashFlowReady) —
 * even though the headline/buckets are computed purely from the Net Worth
 * asset/liability bundle (`calculateNetWorth` takes no transactions/
 * categories argument) and never needed cashFlowReady at all. These tests
 * lock in the fixed, per-field gating so a future change cannot silently
 * re-couple the headline/buckets to an unrelated dataset, or let the
 * comparison/chart render before `savingTransactions` has actually loaded
 * (the separate F-6 correctness-adjacent gap the same audit found).
 */
describe("Hero headline + asset buckets use isDashboardReady alone (PERF-4B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("imports isNetWorthTrendReady, and no longer imports isHeroReady, from the canonical dashboardReadiness module", () => {
    const importStart = source.indexOf("beginPeriodGeneration,");
    expect(importStart).toBeGreaterThan(-1);
    const importEnd = source.indexOf(
      '} from "@/src/lib/dashboard/dashboardReadiness";',
      importStart,
    );
    expect(importEnd).toBeGreaterThan(importStart);
    const importSource = source.slice(importStart, importEnd);

    expect(importSource).toContain("isNetWorthTrendReady");
    expect(importSource).not.toContain("isHeroReady");
  });

  it("the headline value is gated on isDashboardReady, not a shared heroReady flag", () => {
    const start = source.indexOf(
      '<div className="mt-5 flex flex-wrap items-end gap-3">',
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(
      '<div className="mt-5 grid grid-cols-2 gap-2.5',
      start,
    );
    expect(end).toBeGreaterThan(start);
    const headlineRegion = source.slice(start, end);

    expect(headlineRegion).toContain("{isDashboardReady ? (");
    expect(headlineRegion).not.toContain("heroReady");

    const readyIdx = headlineRegion.indexOf("{isDashboardReady ? (");
    const headlineTextIdx = headlineRegion.indexOf(
      "{formatVND(summary.netWorth)}",
    );
    expect(headlineTextIdx).toBeGreaterThan(readyIdx);
  });

  it("the cash-flow badge is gated on cashFlowReady alone, independent of the headline's own gate", () => {
    const start = source.indexOf(
      '<div className="mt-5 flex flex-wrap items-end gap-3">',
    );
    const end = source.indexOf(
      '<div className="mt-5 grid grid-cols-2 gap-2.5',
      start,
    );
    const headlineRegion = source.slice(start, end);

    expect(headlineRegion).toContain("{cashFlowReady ? (");
    const badgeGateIdx = headlineRegion.indexOf("{cashFlowReady ? (");
    const badgeTextIdx = headlineRegion.indexOf(
      '{netCashFlow >= 0 ? "Dòng tiền dương" : "Dòng tiền âm"}',
    );
    expect(badgeTextIdx).toBeGreaterThan(badgeGateIdx);
  });

  it("all 5 HeroMinis (asset-category buckets) use isLoading={!isDashboardReady} — zero remaining isLoading={!heroReady}", () => {
    const occurrencesNew =
      source.split("isLoading={!isDashboardReady}").length - 1;
    const occurrencesOld = source.split("isLoading={!heroReady}").length - 1;
    expect(occurrencesNew).toBe(5);
    expect(occurrencesOld).toBe(0);
  });
});

describe("Net Worth comparison + chart require netWorthTrendReady, including savingInvestmentReady (PERF-4B / F-6)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("netWorthTrendReady is computed from isDashboardReady, cashFlowReady, and savingInvestmentReady, in that order", () => {
    const start = source.indexOf(
      "const netWorthTrendReady = isNetWorthTrendReady(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    const callSource = source.slice(start, end);

    const order = ["isDashboardReady", "cashFlowReady", "savingInvestmentReady"];
    let lastIndex = -1;
    for (const arg of order) {
      const idx = callSource.indexOf(arg);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("both the comparison delta and the NetWorthTrendChart are gated on netWorthTrendReady — exactly two occurrences inside the Hero panel", () => {
    const panelStart = source.indexOf(
      '<div className="mt-5 rounded-3xl border border-slate-200/80 bg-white/95/85',
    );
    expect(panelStart).toBeGreaterThan(-1);
    const panelEnd = source.indexOf("</section>", panelStart);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelSource = source.slice(panelStart, panelEnd);

    const occurrences =
      panelSource.split("{netWorthTrendReady ? (").length - 1;
    expect(occurrences).toBe(2);
    expect(panelSource).toContain("<NetWorthTrendChart trend={netWorthTrend} />");
  });

  it("chart rendering is not reachable via the removed heroReady flag anywhere in the file", () => {
    expect(source).not.toContain("{heroReady ? (");
  });
});

describe("Chart JS chunk preload overlaps finance-data loading without a new query (PERF-4B / F-2)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("both charts are preloaded via a fire-and-forget, empty-deps effect ahead of the mount data-fetch effect", () => {
    const preloadStart = source.indexOf(
      'void import("./NetWorthTrendChart");',
    );
    expect(preloadStart).toBeGreaterThan(-1);
    const preloadEffectStart = source.lastIndexOf("useEffect(", preloadStart);
    const preloadEffectEnd = source.indexOf("}, []);", preloadStart);
    const preloadEffectSource = source.slice(
      preloadEffectStart,
      preloadEffectEnd,
    );
    expect(preloadEffectSource).toContain('void import("./CashFlowChart");');

    // Runs ahead of the mount effect that fires reloadData("initial") — the
    // preload must not sit downstream of/after data-fetch has started.
    const mountReloadIdx = source.indexOf('runReloadRef.current("initial")');
    expect(mountReloadIdx).toBeGreaterThan(preloadStart);
  });

  it("the preload uses the exact same import specifiers as the existing dynamic() calls — same chunk, not a second instance", () => {
    const netWorthChartImportOccurrences =
      source.split('import("./NetWorthTrendChart")').length - 1;
    const cashFlowChartImportOccurrences =
      source.split('import("./CashFlowChart")').length - 1;
    // One inside dynamic(), one inside the new preload effect.
    expect(netWorthChartImportOccurrences).toBe(2);
    expect(cashFlowChartImportOccurrences).toBe(2);
  });

  it("does not add a new finance-data-fetching call — every query call site count matches its existing, unchanged baseline", () => {
    // Each of these is invoked exactly once in reloadData, EXCEPT
    // getTransactionsInRange, which has two genuine, pre-existing call
    // sites (the mount/full reloadData, and reloadPeriod's year-switch-only
    // reload) plus one comment mention — none of that is new, and none of
    // it was touched by this ticket, which changes rendering readiness,
    // not fetching.
    const baselineCounts: Record<string, number> = {
      "getWallets(": 1,
      "getTransactionsInRange(": 3,
      "getInvestments(": 1,
      "getDebts(": 1,
      "getForexAccounts(": 1,
      "getForexCashTransactions(": 1,
      "getCategories(": 1,
      "getGoals(": 1,
      "getBudgets(": 1,
    };
    for (const [fn, expectedCount] of Object.entries(baselineCounts)) {
      const occurrences = source.split(fn).length - 1;
      expect(occurrences).toBe(expectedCount);
    }
  });

  it("the preload effect sets no state and awaits nothing — a pure fire-and-forget side effect", () => {
    const preloadStart = source.indexOf(
      'void import("./NetWorthTrendChart");',
    );
    const preloadEffectStart = source.lastIndexOf("useEffect(", preloadStart);
    const preloadEffectEnd = source.indexOf("}, []);", preloadStart);
    const preloadEffectSource = source.slice(
      preloadEffectStart,
      preloadEffectEnd,
    );
    expect(preloadEffectSource).not.toContain("setState");
    expect(preloadEffectSource).not.toContain("await ");
    expect(preloadEffectSource).not.toContain("set");
  });
});

describe("Action Center / Financial Structure regression guard (PERF-4B out-of-scope, must remain untouched)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("actionCenterReady's call to isActionCenterReady is unchanged — still the full six-flag union", () => {
    const start = source.indexOf(
      "const actionCenterReady = isActionCenterReady(",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    const callSource = source.slice(start, end);
    for (const arg of [
      "isDashboardReady",
      "cashFlowReady",
      "savingInvestmentReady",
      "emergencyFundReady",
      "goalsReady",
      "budgetsLoaded",
    ]) {
      expect(callSource).toContain(arg);
    }
  });

  it("financialStructureReady keeps its existing formula — not touched by this ticket (known, deferred P3)", () => {
    expect(source).toContain(
      "const financialStructureReady = cashFlowReady && savingInvestmentReady;",
    );
  });
});
