import { describe, expect, it } from "vitest";
import {
  calculateDashboardSummary,
  getForexAssetValue,
} from "./financeCalculations";
import type {
  Debt,
  ForexAccount,
  ForexCashTransaction,
  Goal,
  Investment,
  SavingAccount,
  Transaction,
  Wallet,
} from "@/src/types/finance";

/**
 * PERF-1 regression: locks in the "Primary Dashboard Minimum Data Contract".
 *
 * DashboardPage.tsx's reloadData() splits its fetches into a PRIMARY group
 * (wallets, investments, forex accounts+equity, the Forex cash-transaction
 * ledger, categories, transactions, debts, goals, savings balances) that
 * gates `isDashboardReady`, and a SECONDARY group (Budget rows,
 * saving_transactions ledger) that resolves independently and never blocks
 * the KPI cards.
 *
 * The Forex cash-transaction ledger is deliberately PRIMARY, not secondary:
 * `getForexAssetValue` (the canonical current-asset-value calculation) falls
 * back to this ledger's net deposits-withdrawals-fees for any Forex account
 * without a manually-entered `currentEquity`. If that ledger were deferred,
 * `calculateDashboardSummary`'s `forexAssetValue` input would be
 * incomplete at the moment `isDashboardReady` flips true, and Net Worth
 * would silently under-report until the ledger arrived a moment later — see
 * the "Forex fallback correctness" describe block below.
 *
 * `calculateDashboardSummary`'s parameter type has no `budgets` field at
 * all (TypeScript already enforces this statically). This test proves the
 * *runtime* result is a complete, correct summary using only the
 * primary-group shape of data, so a future change that silently made this
 * function depend on a deferred dataset would be caught here (either a type
 * error at the call site, or a value regression in this test).
 */

describe("calculateDashboardSummary — Primary Dashboard Minimum Data Contract (PERF-1)", () => {
  it("produces a complete, correct summary from only the primary-group datasets", () => {
    const wallets: Wallet[] = [{ id: "w1", name: "Cash", type: "cash", balance: 5_000_000 }];
    const savings: SavingAccount[] = [
      { id: "s1", name: "Emergency", type: "savings_account", balance: 2_000_000 },
    ];
    const investments: Investment[] = [
      { id: "i1", name: "VN30", type: "stock", investedAmount: 1_000_000, currentValue: 1_200_000 },
    ];
    const debts: Debt[] = [{ id: "d1", name: "Loan", totalAmount: 1_000_000, remainingAmount: 800_000 }];
    const goals: Goal[] = [{ id: "g1", name: "Trip", targetAmount: 10_000_000, currentAmount: 5_000_000 }];
    const categories = [{ id: "c1", name: "Food", type: "expense" as const }];
    const transactions: Transaction[] = [
      { id: "t1", type: "income", amount: 10_000_000, categoryId: "c1", walletId: "w1", note: "", date: "2026-08-01" },
      { id: "t2", type: "expense", amount: 3_000_000, categoryId: "c1", walletId: "w1", note: "", date: "2026-08-02" },
    ];

    // Note: no `budgets`, no saving/forex cash-transaction ledgers passed —
    // calculateDashboardSummary's input type doesn't even have those fields.
    const summary = calculateDashboardSummary({
      wallets,
      savings,
      investments,
      debts,
      transactions,
      categories,
      goals,
      forexAssetValue: 0,
    });

    expect(summary.walletAssets).toBe(5_000_000);
    expect(summary.savingAssets).toBe(2_000_000);
    expect(summary.investmentAssets).toBe(1_200_000);
    expect(summary.totalDebt).toBe(800_000);
    expect(summary.netWorth).toBe(5_000_000 + 2_000_000 + 1_200_000 - 800_000);
    expect(summary.income).toBe(10_000_000);
    expect(summary.expense).toBe(3_000_000);
    expect(summary.goalScore).toBeGreaterThan(0);
    expect(summary.financialHealthScore).toBeGreaterThanOrEqual(0);
  });
});

function forexAccount(id: string, currentEquity: number | null): ForexAccount {
  return {
    id,
    name: id,
    broker: "Test Broker",
    currency: "VND",
    status: "active",
    currentEquity,
  };
}

function forexTx(
  forexAccountId: string,
  type: "deposit" | "withdrawal",
  amount: number,
  fee = 0,
): ForexCashTransaction {
  return {
    id: `${forexAccountId}-${type}-${amount}`,
    forexAccountId,
    walletId: "w1",
    type,
    amount,
    currency: "VND",
    fee,
    transactionDate: "2026-08-01",
    transactionTime: "09:00",
  };
}

/**
 * PERF-1 Forex fallback correctness: proves the exact chain
 * `raw Forex account rows + cash ledger` -> `getForexAssetValue` (canonical)
 * -> `calculateDashboardSummary`'s `forexAssetValue` input -> Net Worth
 * produces the correct total using ONLY data available once the (now
 * primary) forex-accounts + forex-cash-transactions fetches resolve —
 * i.e. before `isDashboardReady` would ever flip true.
 */
describe("Forex fallback correctness feeding calculateDashboardSummary (PERF-1)", () => {
  it("mixed accounts: authoritative currentEquity + net-capital fallback sum correctly", () => {
    const accounts = [forexAccount("A", 400_000_000), forexAccount("B", null)];
    const ledger = [
      forexTx("B", "deposit", 100_000_000),
      forexTx("B", "withdrawal", 20_000_000),
      forexTx("B", "deposit", 0, 5_000_000), // fee-only-style entry
    ];

    const forexAssetValue = getForexAssetValue(accounts, ledger);

    // A: 400M authoritative. B: 100M - 20M - 5M = 75M fallback. Total 475M.
    expect(forexAssetValue).toBe(475_000_000);
  });

  it("fallback-only case (§18 mandatory): deposit 100M, withdrawal 20M, fee 5M -> 75M", () => {
    const accounts = [forexAccount("A", null)];
    const ledger = [
      forexTx("A", "deposit", 100_000_000),
      forexTx("A", "withdrawal", 20_000_000),
      forexTx("A", "deposit", 0, 5_000_000),
    ];

    expect(getForexAssetValue(accounts, ledger)).toBe(75_000_000);
  });

  it("all-authoritative-equity case: no ledger needed, both accounts sum directly", () => {
    const accounts = [forexAccount("A", 100_000_000), forexAccount("B", 200_000_000)];

    expect(getForexAssetValue(accounts, [])).toBe(300_000_000);
  });

  it("zero/empty case: no Forex accounts -> 0, ledger absence is not a correctness blocker", () => {
    expect(getForexAssetValue([], [])).toBe(0);
  });

  it("full Net Worth regression (§19): wallets+savings+investments+forex(equity+fallback)-debts", () => {
    const wallets: Wallet[] = [{ id: "w1", name: "Cash", type: "cash", balance: 1_000_000_000 }];
    const savings: SavingAccount[] = [
      { id: "s1", name: "Emergency", type: "savings_account", balance: 200_000_000 },
    ];
    const investments: Investment[] = [
      { id: "i1", name: "VN30", type: "stock", investedAmount: 250_000_000, currentValue: 300_000_000 },
    ];
    const debts: Debt[] = [
      { id: "d1", name: "Loan", totalAmount: 300_000_000, remainingAmount: 250_000_000 },
    ];
    const accounts = [forexAccount("A", 400_000_000), forexAccount("B", null)];
    const ledger = [
      forexTx("B", "deposit", 100_000_000),
      forexTx("B", "withdrawal", 20_000_000),
      forexTx("B", "deposit", 0, 5_000_000),
    ];
    const forexAssetValue = getForexAssetValue(accounts, ledger);
    expect(forexAssetValue).toBe(475_000_000); // 400M equity + 75M fallback

    const summary = calculateDashboardSummary({
      wallets,
      savings,
      investments,
      debts,
      transactions: [],
      categories: [],
      goals: [],
      forexAssetValue,
    });

    // 1,000 + 200 + 300 + 475 - 250 = 1,725 (in millions)
    expect(summary.netWorth).toBe(1_725_000_000);
  });
});
