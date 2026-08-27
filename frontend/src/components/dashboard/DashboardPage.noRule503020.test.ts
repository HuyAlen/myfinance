import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASH-NO-503020-1 — Remove prescriptive 50/30/20 budgeting from Dashboard.
 *
 * Dashboard keeps factual cash-flow and Financial Structure metrics, but
 * must not calculate, display, or describe the 50/30/20 rule.
 */
describe("Dashboard does not expose the 50/30/20 rule (DASH-NO-503020-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("removes the rule helper import and derived allocation memo", () => {
    expect(source).not.toContain("calculateRule503020");
    expect(source).not.toContain("allocation5030");
  });

  it("removes all rule UI copy and the dedicated allocation row component", () => {
    expect(source).not.toContain("50/30/20");
    expect(source).not.toContain("AllocationRow");
    expect(source).not.toContain("AllocationKind");
  });

  it("keeps the Cash Flow panel and its canonical three factual values", () => {
    const start = source.indexOf('title="Dòng tiền trong kỳ"');
    const end = source.indexOf("</Panel>", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const panel = source.slice(start, end);

    expect(panel).toContain('label="Thu nhập"');
    expect(panel).toContain('label="Chi tiêu"');
    expect(panel).toContain('label="Còn lại"');
    expect(panel).toContain("<CashFlowChart data={cashFlowData} />");
  });

  it("keeps Financial Structure as an independent operational analysis", () => {
    expect(source).toContain('title="Cấu trúc tài chính"');
    expect(source).toContain("calculateFinancialStructureSummary({");
    expect(source).toContain("financialStructureCards.map(");
  });

  it("does not add any new data read to replace the removed rule", () => {
    // One canonical transaction-range read belongs to reloadData and one to
    // reloadPeriod. Retiring 50/30/20 must not introduce a third consumer.
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });
});
