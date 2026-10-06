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

  it("continues deriving Financial Structure period activity from periodFinanceFlow", () => {
    expect(source).toContain(
      "investmentAmount: periodFinanceFlow.investmentContribution",
    );
    expect(source).toContain(
      "investmentWithdrawal: periodFinanceFlow.investmentWithdrawal",
    );
    expect(source).toContain(
      "totalAmount: periodFinanceFlow.futureContribution",
    );
    expect(source).toContain(
      "totalWithdrawal: periodFinanceFlow.futureWithdrawal",
    );
    expect(source).toContain(
      "netAmount: periodFinanceFlow.futureNetAllocation",
    );
  });
});