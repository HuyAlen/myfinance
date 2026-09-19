import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRANSACTIONS-NO-FOREX-1
 * Transactions owns the ordinary income/expense/transfer ledger only.
 * Forex deposit/withdraw history is exclusively presented and mutated in
 * Investments, preventing duplicate ledgers and duplicate destructive paths.
 */
describe("TransactionsPage has no Forex ownership", () => {
  const transactions = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const normalized = transactions.replace(/\s+/g, " ");
  const investments = readFileSync(
    path.resolve(__dirname, "../investments/InvestmentsPage.tsx"),
    "utf8",
  );

  it("does not read, map, render, filter, export, mutate or subscribe to Forex", () => {
    for (const token of [
      "ForexAccount",
      "ForexCashTransaction",
      "getForexAccounts",
      "getForexCashTransactionsInRange",
      "deleteForexCashTransaction",
      "forex_accounts",
      "forex_cash_transactions",
      "forex_cash",
      "Forex Cash",
      '"forex"',
    ]) {
      expect(transactions).not.toContain(token);
    }
    expect(transactions.toLowerCase()).not.toContain("forex");
  });

  it("loads only the ordinary ledger dependencies", () => {
    expect(normalized).toContain(
      "const [txnsResult, catsResult, walletsResult] = await Promise.allSettled([ getTransactionsInRange(startDate, endDate), getCategories(), getWallets(), ]);",
    );
  });

  it("subscribes only to transaction/category/wallet realtime boundaries", () => {
    expect(normalized).toContain(
      'useRealtimeTable( ["transactions", "wallets", "categories"], requestTransactionsRefresh, );',
    );
  });

  it("keeps Forex cash history in Investments", () => {
    expect(investments).toContain('data-ui="forex-history-workstation"');
    expect(investments).toContain("Lịch sử nạp/rút");
    expect(investments).toContain("getForexCashTransactions");
  });
});