import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function snapshotRegion() {
  const start = source.indexOf("const currentSavingInvestmentSnapshot = useMemo(");
  const end = source.indexOf("const financialStructureCards = useMemo(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function cardsRegion() {
  const start = source.indexOf("const financialStructureCards = useMemo(");
  const end = source.indexOf("const financialStructureReady", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function panelRegion() {
  const start = source.indexOf('title="Cấu trúc tài chính"');
  const end = source.indexOf("</Panel>", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("DASHBOARD-FINANCIAL-STRUCTURE-ALLOCATION-VISIBILITY-1", () => {
  it("derives current Savings from the canonical Savings snapshot", () => {
    const region = snapshotRegion();

    expect(region).toContain(
      "savings: Math.max(0, savingsSnapshot.totalSavings)",
    );
  });

  it("derives current Investment assets from Portfolio currentValue plus current Forex asset value", () => {
    const region = snapshotRegion();

    expect(region).toContain("snapshotInvestments.reduce(");
    expect(region).toContain("investment.currentValue");
    expect(region).toContain("forexSnapshot.assetValue");
    expect(region).toContain(
      "const investments = portfolioInvestments + forexInvestments;",
    );
  });

  it("keeps current assets explicitly separate from period allocation values", () => {
    const cards = cardsRegion();

    expect(cards).toContain('label: "Tiết kiệm hiện có"');
    expect(cards).toContain('label: "Đầu tư hiện có"');
    expect(cards).toContain('label: "Danh mục đầu tư"');
    expect(cards).toContain('label: "Ngoại hối"');

    const adjustedStart = source.indexOf(
      "const financialStructureAdjusted = useMemo(",
    );
    const adjustedEnd = source.indexOf(
      "const currentSavingInvestmentSnapshot",
      adjustedStart,
    );
    const adjusted = source.slice(adjustedStart, adjustedEnd);

    expect(adjusted).toContain(
      "const savingAmount = periodFutureAllocation.savingAmount;",
    );
    expect(adjusted).toContain(
      "const investmentAmount = periodFutureAllocation.investmentAmount;",
    );
    expect(adjusted).not.toContain("currentSavingInvestmentSnapshot");
  });

  it("renders a dedicated current-assets block without replacing the period percentage", () => {
    const panel = panelRegion();

    expect(panel).toContain(
      "data-dashboard-financial-structure-current-assets={item.title}",
    );
    expect(panel).toContain("Hiện có");
    expect(panel).toContain("{formatVND(asset.value)}");
    expect(panel).toContain("{item.value}");
    expect(panel).toContain("{item.amount}");
  });

  it("waits for the existing canonical asset snapshot before showing current balances", () => {
    expect(source).toContain(
      "cashFlowReady && savingInvestmentReady && isDashboardReady;",
    );
  });

  it("adds no new Dashboard fetch and keeps the current snapshot sourced from already-loaded state", () => {
    expect(source.split("getInvestments(").length - 1).toBe(1);
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split('from("savings")').length - 1).toBe(1);
    expect(source.split('from("forex_accounts")').length - 1).toBe(1);
  });
});