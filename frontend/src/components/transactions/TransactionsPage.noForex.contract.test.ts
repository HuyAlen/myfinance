import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRANSACTIONS-NO-FOREX-1 / TRANSACTIONS-INCOME-EXPENSE-SCOPE-1.
 * Forex funding, fees, and principal remain owned by Investments and included
 * in wallet-liquidity accounting. None of those ledgers belong to the ordinary
 * Transactions income/expense cards or editable feed.
 */
describe("Transactions owns no Forex or Savings capital summary", () => {
  const transactions = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const investments = readFileSync(
    path.resolve(__dirname, "../investments/InvestmentsPage.tsx"),
    "utf8",
  );
  const wallets = readFileSync(
    path.resolve(__dirname, "../wallets/WalletsPage.tsx"),
    "utf8",
  );

  it("does not fetch or aggregate Forex/Savings capital in Transactions", () => {
    expect(transactions).toContain("getTransactionsInRange(startDate, endDate)");
    expect(transactions).toContain("summarizeTransactionIncomeExpense({");
    for (const token of [
      "getForexCashTransactionsInRange",
      "getSavingTransactionsInRange",
      "forexCashTransactions",
      "savingMovements",
      "summarizeTransactionWalletCashMovement",
      "showCashMovementBreakdown",
    ]) {
      expect(transactions).not.toContain(token);
    }
  });

  it("keeps all Forex history/mutations in Investments", () => {
    for (const token of [
      "getForexAccounts(",
      "deleteForexCashTransaction(",
      "createForexCashTransaction(",
      'from("forex_cash_transactions")',
      'data-ui="forex-history-workstation"',
    ]) {
      expect(transactions).not.toContain(token);
    }
    expect(investments).toContain('data-ui="forex-history-workstation"');
    expect(investments).toContain("getForexCashTransactions");
  });

  it("preserves canonical wallet movement including investment and saving activity", () => {
    expect(wallets).toContain("calculateWalletCashMovementSnapshot({");
    expect(wallets).toContain("getSavingTransactionsInRange(startDate, endDate)");
    expect(wallets).toContain("getForexCashTransactionsInRange(startDate, endDate)");
    expect(transactions).toContain('useRealtimeTable(\n    ["transactions", "wallets", "categories"],');
    expect(transactions).not.toContain('useRealtimeTable(\n    ["saving_transactions", "forex_cash_transactions"],');
  });
});
