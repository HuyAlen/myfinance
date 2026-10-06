import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function recentActivitySource() {
  const start = source.indexOf("// Recent Activity is a selected-period surface.");
  const end = source.indexOf("const recentTxnGroups = useMemo(", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("DASHBOARD-RECENT-ACTIVITY-PERIOD-INTEGRITY-1", () => {
  it("uses the canonical inclusive date-range helper for secondary ledgers", () => {
    expect(source).toContain("filterByDateRange,");
    const recent = recentActivitySource();
    expect(recent).toContain("filterByDateRange(\n        savingTransactions,\n        dateRange,");
    expect(recent).toContain("filterByDateRange(\n        forexCashTransactions,\n        dateRange,");
  });

  it("scopes Savings interest by its financial transaction date before mapping", () => {
    const recent = recentActivitySource();
    expect(recent).toContain("(transaction) => transaction.date,");
    expect(recent).toContain(
      ').filter((transaction) => transaction.type === "interest")',
    );
    expect(recent).toContain(
      "const savingTxns = recentSavingInterestTransactionsInPeriod.map(",
    );
    expect(recent).not.toContain("const savingTxns = savingTransactions");
  });

  it("scopes Forex cash movement by transactionDate before mapping", () => {
    const recent = recentActivitySource();
    expect(recent).toContain("(transaction) => transaction.transactionDate,");
    expect(recent).toContain(
      "const forexTxns = recentForexCashTransactionsInPeriod.map((transaction) => {",
    );
    expect(recent).not.toContain(
      "const forexTxns = forexCashTransactions.map((transaction) => {",
    );
  });

  it("keeps ordinary finance rows on the existing filtered period and excludes internal transfers", () => {
    const recent = recentActivitySource();
    expect(recent).toContain("const financeTxns = filteredTransactions");
    expect(recent).toContain(
      ".filter((transaction) => !isInternalTransferTransaction(transaction))",
    );
  });

  it("merges only period-scoped ledgers before sorting and taking the latest five", () => {
    const recent = recentActivitySource();
    expect(recent).toContain(
      "return [...financeTxns, ...savingTxns, ...forexTxns]",
    );
    expect(recent).toContain(".sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())");
    expect(recent).toContain(".slice(0, 5);");
    expect(recent).toContain("recentSavingInterestTransactionsInPeriod,");
    expect(recent).toContain("recentForexCashTransactionsInPeriod,");
  });

  it("adds no Savings or Forex finance read", () => {
    expect(source.split('from("saving_transactions")').length - 1).toBe(1);
    expect(source.split("getForexCashTransactions(").length - 1).toBe(1);
  });
});