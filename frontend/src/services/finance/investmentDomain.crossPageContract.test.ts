import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INVESTMENT-DOMAIN-1 — cross-page ownership contract.
 *
 * Portfolio Investment[] and Forex remain distinct persisted sources, but both
 * must be visible/manageable under /investments and both must continue feeding
 * the canonical balance sheet + AI investment capability.
 */
describe("unified investment domain across UI, balance sheet and AI", () => {
  const investmentsPage = readFileSync(
    path.resolve(__dirname, "../../components/investments/InvestmentsPage.tsx"),
    "utf8",
  );
  const header = readFileSync(
    path.resolve(__dirname, "../../components/layout/Header.tsx"),
    "utf8",
  );
  const calculations = readFileSync(
    path.resolve(__dirname, "financeCalculations.ts"),
    "utf8",
  );
  const capabilities = readFileSync(
    path.resolve(__dirname, "ai-agent/context/aiFinanceCapabilities.ts"),
    "utf8",
  );

  it("gives /investments explicit ownership of both persisted investment sources", () => {
    expect(investmentsPage).toContain("getInvestments()");
    expect(investmentsPage).toContain("getForexAssetValue(accounts, transactions)");
    expect(investmentsPage).toContain('from("forex_accounts")');
    expect(investmentsPage).toContain('from("forex_cash_transactions")');
    expect(investmentsPage).toContain("Portfolio");
    expect(investmentsPage).toContain("Tài khoản & vốn Forex");
  });

  it("makes both Portfolio and Forex discoverable through one global investment route", () => {
    expect(header).toContain("buildInvestmentsHref({ investmentId: i.id })");
    expect(header).toContain(
      "buildInvestmentsHref({ forexAccountId: account.id })",
    );
  });

  it("keeps Portfolio and Forex additive in the canonical balance sheet rather than collapsing storage models", () => {
    expect(calculations).toContain(
      "const investments = getTotalInvestmentValue(input.investments);",
    );
    expect(calculations).toContain("const forex = input.forexAssetValue ?? 0;");
    expect(calculations).toContain(
      "const totalAssets = cashAndWallets + savings + investments + forex;",
    );
    expect(calculations).toContain(
      "getForexAssetValue(\n      input.forexAccounts ?? [],",
    );
  });

  it("keeps AI investment summary grounded in both Portfolio value and Forex equity", () => {
    expect(capabilities).toContain("investment_summary: {");
    expect(capabilities).toContain('"investment.currentValue"');
    expect(capabilities).toContain('"forex.currentEquity"');
  });
});
