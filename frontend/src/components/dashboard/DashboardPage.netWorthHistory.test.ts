import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
);

function reloadPeriodBody() {
  const start = source.indexOf("const reloadPeriod = useCallback(async (year: number) => {");
  const end = source.indexOf("// Guards against overlapping Dashboard reloads", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Dashboard canonical Net Worth history (NETWORTH-HISTORY-1)", () => {
  it("uses the persisted history reader + pure snapshot trend builder", () => {
    expect(source).toContain("getNetWorthSnapshotsInRange");
    expect(source).toContain("buildCanonicalNetWorthTrend");
    expect(source).toContain("snapshots: netWorthSnapshots");
  });

  it("contains none of the removed reverse-reconstruction helpers", () => {
    for (const obsolete of [
      "getTransactionNetWorthImpact",
      "getSavingTransactionNetWorthImpact",
      "transactionImpactAfterMonth",
      "savingImpactAfterMonth",
      "firstNetWorthDataMonth",
    ]) {
      expect(source).not.toContain(obsolete);
    }
  });

  it("fetches history as a first-class concurrent full-load query", () => {
    const historyStart = source.indexOf("const netWorthHistoryPromise = measureDashboardQuery(");
    const historyGroup = source.indexOf("const netWorthHistoryGroupPromise = (async () => {");
    expect(historyStart).toBeGreaterThanOrEqual(0);
    expect(historyGroup).toBeGreaterThan(historyStart);
    expect(source.slice(historyStart, historyGroup)).not.toContain(
      "await netWorthHistoryPromise",
    );
  });

  it("year switching starts transactions and history before awaiting either", () => {
    const body = reloadPeriodBody();
    const transactionStart = body.indexOf("const transactionsRequest = measureDashboardQuery(");
    const historyStart = body.indexOf("const historyRequest = measureDashboardQuery(");
    const awaitBoth = body.indexOf("await Promise.allSettled([");

    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(historyStart).toBeGreaterThan(transactionStart);
    expect(awaitBoth).toBeGreaterThan(historyStart);
    expect(body).toContain('getNetWorthSnapshotsInRange(`${year}-01-01`, `${year}-12-01`)');
  });

  it("shares one period generation guard so a stale year cannot overwrite the newest year", () => {
    const body = reloadPeriodBody();
    expect(body).toContain("const periodGeneration = beginPeriodGeneration(periodRequestIdRef);");
    expect(body).toContain("isStalePeriodGeneration(periodRequestIdRef, periodGeneration)");
    expect(body).toContain("if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;");
  });

  it("invalidates old-year history readiness before a new context can render", () => {
    const start = source.indexOf("const invalidatePeriodReadinessForNewContext = useCallback(() => {");
    const end = source.indexOf("}, []);", start);
    const body = source.slice(start, end);

    expect(body).toContain("hasLoadedNetWorthHistoryRef.current = false");
    expect(body).toContain("loadedNetWorthHistoryYearRef.current = null");
    expect(body).toContain("setNetWorthHistoryReady(false)");
  });

  it("gates the history chart independently from cash-flow and saving-investment readiness", () => {
    const declaration = "const netWorthTrendReady = netWorthHistoryReady;";
    const start = source.indexOf(declaration);
    expect(start).toBeGreaterThanOrEqual(0);
    const window = source.slice(start, start + 250);
    expect(window).not.toContain("cashFlowReady");
    expect(window).not.toContain("savingInvestmentReady");
  });
});
