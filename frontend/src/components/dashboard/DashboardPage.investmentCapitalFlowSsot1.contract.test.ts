import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("INVESTMENT-CAPITAL-FLOW-SSOT-1 Dashboard adoption", () => {
  it("keeps Investment-owned transfer rows in the canonical period Finance Flow", () => {
    expect(source).toContain("isInvestmentManagedTransaction");
    expect(source).toContain(
      "!isInternalTransferTransaction(transaction) ||",
    );
    expect(source).toContain("isInvestmentManagedTransaction(transaction)");
  });

  it("continues deriving Financial Structure allocations from periodFinanceFlow", () => {
    expect(source).toContain(
      "investmentAmount: periodFinanceFlow.investmentAllocation",
    );
    expect(source).toContain(
      "totalAmount: periodFinanceFlow.futureAllocation",
    );
  });
});