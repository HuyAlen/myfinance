import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const snapshotStart = source.indexOf("const todaySnapshot = useMemo(() => {");
const snapshotEnd = source.indexOf("const monthlyPulse = useMemo(", snapshotStart);
const snapshotRegion = source.slice(snapshotStart, snapshotEnd);

const todaySectionStart = source.indexOf("{/* Today's summary */}");
const todaySectionEnd = source.indexOf("// ─── Sub-components", todaySectionStart);
const todaySection = source.slice(todaySectionStart, todaySectionEnd);

describe("DASHBOARD-TODAY-SUMMARY-SEMANTICS-1 — P0", () => {
  it("keeps Today pinned to the real local calendar day, independent of the selected Dashboard period", () => {
    expect(snapshotStart).toBeGreaterThan(-1);
    expect(snapshotRegion).toContain("const todayKey = toLocalDateKey(new Date());");
    expect(snapshotRegion).toContain("dateRange: { startDate: todayKey, endDate: todayKey }");
    expect(snapshotRegion).not.toContain("dashboardMonthKey");
    expect(snapshotRegion).not.toContain("selectedMonth");
  });

  it("derives Today from the canonical finance-flow SSOT with internal Wallet transfers excluded", () => {
    expect(snapshotRegion).toContain("calculateFinanceFlowSnapshot({");
    expect(snapshotRegion).toContain("!isInternalTransferTransaction(transaction)");
    expect(snapshotRegion).toContain("savingMovements: savingTransactions");
    expect(snapshotRegion).toContain("forexCashTransactions,");
  });

  it("uses operating flow for Thu vao, Chi ra and Rong instead of gross Wallet liquidity", () => {
    expect(snapshotRegion).toContain("operatingCashIn: flow.operatingCashIn");
    expect(snapshotRegion).toContain("operatingCashOut: flow.operatingCashOut");
    expect(snapshotRegion).toContain("operatingNetCashFlow: flow.operatingNetCashFlow");
    expect(snapshotRegion).not.toContain("cashIn: flow.cashIn");
    expect(snapshotRegion).not.toContain("cashOut: flow.cashOut");
    expect(snapshotRegion).not.toContain("net: flow.netCashMovement");
  });

  it("keeps Today allocation on canonical futureAllocation semantics", () => {
    expect(snapshotRegion).toContain("allocation: flow.futureAllocation");
  });

  it("separates Savings/Forex principal movement from operating Thu vao / Chi ra", () => {
    expect(snapshotRegion).toContain("capitalMovementIn: flow.capitalMovementIn");
    expect(snapshotRegion).toContain("capitalMovementOut: flow.capitalMovementOut");
    expect(todaySection).toContain('data-dashboard-today-capital-movement="true"');
    expect(todaySection).toContain("todaySnapshot.capitalMovementIn");
    expect(todaySection).toContain("todaySnapshot.capitalMovementOut");
    expect(todaySection).toContain("Không tính vào Thu vào / Chi ra");
  });

  it("renders the four Today cards from operating semantics", () => {
    expect(todaySection).toContain("todaySnapshot.operatingCashIn");
    expect(todaySection).toContain("todaySnapshot.operatingCashOut");
    expect(todaySection).toContain("todaySnapshot.allocation");
    expect(todaySection).toContain("todaySnapshot.operatingNetCashFlow");
    expect(todaySection).not.toContain("todaySnapshot.cashIn");
    expect(todaySection).not.toContain("todaySnapshot.cashOut");
    expect(todaySection).not.toContain("todaySnapshot.net");
  });

  it("reuses the existing complete cash-movement readiness gate and never paints fake zero values on first load", () => {
    expect(source).toContain(
      "const cashMovementReady = cashFlowReady && savingInvestmentReady;",
    );
    expect(todaySection).toContain("{cashMovementReady ? (");
    expect(todaySection).toContain('data-dashboard-today-loading="true"');
    expect(todaySection).toContain("animate-pulse");
  });

  it("adds no Dashboard finance query for the Today correction", () => {
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });
});