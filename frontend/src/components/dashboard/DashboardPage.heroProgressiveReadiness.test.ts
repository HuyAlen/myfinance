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
 * comparison/chart render before canonical Net Worth history has loaded.
 * NETWORTH-HISTORY-1 intentionally decouples that chart from transaction and
 * saving-transaction readiness because those ledgers no longer reconstruct it.
 */
describe("Hero headline + asset buckets use isDashboardReady alone (PERF-4B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("no longer imports a composite Net Worth trend gate from dashboardReadiness", () => {
    const importStart = source.indexOf("beginPeriodGeneration,");
    expect(importStart).toBeGreaterThan(-1);
    const importEnd = source.indexOf(
      '} from "@/src/lib/dashboard/dashboardReadiness";',
      importStart,
    );
    expect(importEnd).toBeGreaterThan(importStart);
    const importSource = source.slice(importStart, importEnd);

    expect(importSource).not.toContain("isNetWorthTrendReady");
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

describe("Net Worth comparison + chart use canonical history readiness (NETWORTH-HISTORY-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("netWorthTrendReady depends only on netWorthHistoryReady", () => {
    expect(source).toContain(
      "const netWorthTrendReady = netWorthHistoryReady;",
    );
    const declarationStart = source.indexOf(
      "const netWorthTrendReady = netWorthHistoryReady;",
    );
    const declarationWindow = source.slice(declarationStart, declarationStart + 220);
    expect(declarationWindow).not.toContain("cashFlowReady");
    expect(declarationWindow).not.toContain("savingInvestmentReady");
  });

  it("both the comparison and chart remain gated on netWorthTrendReady", () => {
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

describe("Chart JS chunk preload overlaps finance-data loading while canonical history stays concurrent (PERF-4B / NETWORTH-HISTORY-1)", () => {
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

  it("adds only the required year-scoped Net Worth history reader; existing data-call counts remain stable", () => {
    const baselineCounts: Record<string, number> = {
      "getWallets(": 1,
      "getTransactionsInRange(": 2,
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

    // One full-reload call + one period-reload call; the import itself is not
    // counted because this source-contract intentionally matches call syntax.
    expect(source.split("getNetWorthSnapshotsInRange(").length - 1).toBe(2);
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

describe("Action Center removal / Financial Structure regression guard", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("Action Center remains intentionally removed from Dashboard", () => {
    expect(source).not.toContain(
      "const actionCenterReady = isActionCenterReady(",
    );
    expect(source).not.toContain("{/* Action center */}");
    expect(source).not.toContain("Ưu tiên tài chính");
    expect(source).not.toContain("<ActionCard");
  });

  it("financialStructureReady keeps its existing formula — untouched by the Action Center removal", () => {
    expect(source).toContain(
      "const financialStructureReady = cashFlowReady && savingInvestmentReady;",
    );
  });
});
