import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function periodAllocationRegion() {
  const start = source.indexOf("const periodFutureAllocation = useMemo(");
  const end = source.indexOf("Dashboard v5 data model", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function financialStructureCardsRegion() {
  const start = source.indexOf("const financialStructureCards = useMemo(");
  const end = source.indexOf("const financialStructureReady", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("DASHBOARD-FINANCIAL-STRUCTURE-SAVINGS-1", () => {
  it("uses gross period contributions instead of positive-clamped net allocation for the visible amount", () => {
    const region = periodAllocationRegion();

    expect(region).toContain(
      "savingAmount: periodFinanceFlow.savingContribution",
    );
    expect(region).toContain(
      "investmentAmount: periodFinanceFlow.investmentContribution",
    );
    expect(region).toContain(
      "totalAmount: periodFinanceFlow.futureContribution",
    );
    expect(region).not.toContain(
      "savingAmount: periodFinanceFlow.savingAllocation",
    );
    expect(region).not.toContain(
      "investmentAmount: periodFinanceFlow.investmentAllocation",
    );
  });

  it("carries withdrawals and signed net movement into Financial Structure", () => {
    const region = periodAllocationRegion();

    expect(region).toContain(
      "savingWithdrawal: periodFinanceFlow.savingWithdrawal",
    );
    expect(region).toContain(
      "investmentWithdrawal: periodFinanceFlow.investmentWithdrawal",
    );
    expect(region).toContain(
      "totalWithdrawal: periodFinanceFlow.futureWithdrawal",
    );
    expect(region).toContain(
      "netAmount: periodFinanceFlow.futureNetAllocation",
    );
  });

  it("shows period contribution, withdrawal and signed net instead of a misleading zero-only state", () => {
    const region = financialStructureCardsRegion();

    expect(region).toContain("Nạp ${formatVND(");
    expect(region).toContain("Rút ra ${formatVND(");
    expect(region).toContain("Ròng ${");
    expect(region).toContain("futureAllocationWithdrawal");
    expect(region).toContain("futureAllocationNet");
    expect(region).toContain("investmentWithdrawal");
    expect(region).toContain("investmentNet");
  });
});
