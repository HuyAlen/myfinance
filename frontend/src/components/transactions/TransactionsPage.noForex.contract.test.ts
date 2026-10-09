import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRANSACTIONS-NO-FOREX-1 + TRANSACTIONS-CASH-MOVEMENT-CARDS-1.
 * Transactions may read bounded Forex cash for summary aggregates only.
 * Forex identity, mutation, history, list filtering and export stay in Investments.
 */
describe("TransactionsPage reads Forex for cash cards without owning its ledger", () => {
  const transactions = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const investments = readFileSync(
    path.resolve(__dirname, "../investments/InvestmentsPage.tsx"),
    "utf8",
  );
  const reloadStart = transactions.indexOf("const reloadData = useCallback(async () => {");
  const feedStart = transactions.indexOf("const filtered = useMemo(() => {");
  const feedEnd = transactions.indexOf("const sorted = useMemo(() => {", feedStart);

  it("reads bounded Forex history solely for the summary in the effective period", () => {
    expect(transactions).toContain("getForexCashTransactionsInRange(startDate, endDate)");
    expect(transactions).toContain("summarizeTransactionWalletCashMovement({");
    expect(reloadStart).toBeGreaterThan(-1);
    expect(feedStart).toBeGreaterThan(reloadStart);
  });

  it("does not own Forex accounts, history editing, export, or manual mutations", () => {
    for (const token of [
      "getForexAccounts(",
      "deleteForexCashTransaction(",
      "createForexCashTransaction(",
      'from("forex_cash_transactions")',
      "forexCashTransactions.map(",
    ]) {
      expect(transactions).not.toContain(token);
    }
    expect(transactions.slice(feedStart, feedEnd)).not.toContain("forexCashTransactions");
    expect(transactions).not.toContain('data-ui="forex-history-workstation"');
    expect(investments).toContain('data-ui="forex-history-workstation"');
    expect(investments).toContain("getForexCashTransactions");
  });

  it("preserves the ordinary transactions read and realtime listener", () => {
    expect(transactions).toContain("getTransactionsInRange(startDate, endDate)");
    expect(transactions).toContain('useRealtimeTable(\n    ["transactions", "wallets", "categories"],');
    expect(transactions).toContain('useRealtimeTable(\n    ["saving_transactions", "forex_cash_transactions"],');
  });
});
