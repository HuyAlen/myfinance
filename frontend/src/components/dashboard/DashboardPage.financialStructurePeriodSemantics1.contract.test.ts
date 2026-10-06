import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function financialStructureRegion() {
  const start = source.indexOf("const financialStructureAdjusted = useMemo(");
  const end = source.indexOf("const cashMovementReady =", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function financialStructurePanel() {
  const start = source.indexOf('title="Cấu trúc tài chính"');
  const end = source.indexOf("</Panel>", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("DASHBOARD-FINANCIAL-STRUCTURE-PERIOD-SEMANTICS-1", () => {
  it("names saving/investment cards as allocations instead of current asset balances", () => {
    const region = financialStructureRegion();

    expect(region).toContain('title: "Phân bổ tiết kiệm & đầu tư"');
    expect(region).toContain('title: "Phân bổ đầu tư"');
    expect(region).not.toContain('title: "Tiết kiệm & Đầu tư"');
    expect(region).not.toContain('title: "Tỷ trọng đầu tư"');
  });

  it("keeps the values grounded in periodFutureAllocation rather than current Savings/Portfolio snapshots", () => {
    const region = financialStructureRegion();

    expect(region).toContain(
      "const savingAmount = periodFutureAllocation.savingAmount;",
    );
    expect(region).toContain(
      "const investmentAmount = periodFutureAllocation.investmentAmount;",
    );
    expect(region).not.toContain("savingsSnapshot.totalSavings");
    expect(region).not.toContain("snapshotInvestments");
  });

  it("explains a genuine zero combined allocation as no new allocation in the selected period", () => {
    const region = financialStructureRegion();

    expect(region).toContain(
      "financialStructureAdjusted.futureAllocationAmount <= 0",
    );
    expect(region).toContain(
      '"Chưa ghi nhận phân bổ tiết kiệm hoặc đầu tư trong kỳ"',
    );
  });

  it("distinguishes no investment allocation from a period that allocated only to savings", () => {
    const region = financialStructureRegion();

    expect(region).toContain(
      "financialStructureAdjusted.investmentAmount <= 0",
    );
    expect(region).toContain(
      "financialStructureAdjusted.savingAmount > 0",
    );
    expect(region).toContain(
      '"Kỳ này chỉ ghi nhận phân bổ vào tiết kiệm"',
    );
    expect(region).toContain(
      '"Chưa ghi nhận phân bổ đầu tư trong kỳ"',
    );
  });

  it("makes the panel itself explicit that ratios are selected-period flow semantics", () => {
    const panel = financialStructurePanel();

    expect(panel).toContain(
      'subtitle="Tỷ lệ chi tiêu và phân bổ vốn trên thu nhập của kỳ đang chọn"',
    );
    expect(panel).toContain(
      'data-dashboard-financial-structure-scope="period"',
    );
    expect(panel).toContain(
      "không phải số dư Tiết kiệm hoặc giá trị danh mục Đầu tư hiện tại",
    );
  });

  it("preserves the existing readiness gate and adds no new fetch dependency", () => {
    const panel = financialStructurePanel();

    expect(source).toContain(
      "const financialStructureReady = cashFlowReady && savingInvestmentReady;",
    );
    expect(panel).toContain("financialStructureReady ? (");
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getInvestments(").length - 1).toBe(1);
  });
});