import { describe, expect, it } from "vitest";
import {
  toDomainDebt,
  toDomainForexAccount,
  toDomainForexCashTransaction,
  toDomainInvestment,
  toDomainSaving,
  toDomainTransaction,
  toDomainWallet,
} from "./financeReadTools.server";
import {
  calculateBalanceSheetSnapshot,
  getSavingRate,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

/**
 * INTEGRATION-1.4 regression coverage: `get_financial_summary` /
 * `get_financial_health` must derive netWorth/income/expense/savingRate from
 * the canonical `calculateNetWorth`/`getTotalIncome`/`getTotalExpense`/
 * `getSavingRate` via row -> domain adapters, not a second
 * `walletAssets + investmentAssets - totalDebt` formula that silently drops
 * savings/Forex and never applies real-expense semantics.
 */

describe("financeReadTools adapters agree with the canonical full balance sheet", () => {
  it("includes wallet + saving + investment + Forex assets before subtracting debt", () => {
    const wallets = [
      toDomainWallet({ id: "w1", name: "Wallet", type: "cash", balance: 2_000_000 }),
    ];
    const savings = [
      toDomainSaving({
        id: "s1",
        name: "Saving",
        type: "savings_account",
        balance: 400_000,
      }),
    ];
    const investments = [
      toDomainInvestment({ id: "i1", name: "Stock", currentValue: 500_000 }),
    ];
    const debts = [
      toDomainDebt({ id: "d1", name: "Loan", remainingAmount: 300_000 }),
    ];
    const forexAccounts = [
      toDomainForexAccount({
        id: "fx1",
        name: "FX",
        broker: "Broker",
        currency: "USD",
        status: "active",
        current_equity: 250_000,
      }),
    ];
    const forexCashTransactions = [
      toDomainForexCashTransaction({
        id: "fxt1",
        forex_account_id: "fx1",
        wallet_id: "w1",
        type: "deposit",
        amount: 200_000,
        currency: "VND",
        fee: 0,
        transaction_date: "2026-08-01",
        transaction_time: "09:00",
      }),
    ];

    const breakdown = calculateBalanceSheetSnapshot({
      wallets,
      savings,
      investments,
      debts,
      forexAccounts,
      forexCashTransactions,
    });

    expect(breakdown.cashAndWallets).toBe(2_000_000);
    expect(breakdown.savings).toBe(400_000);
    expect(breakdown.investments).toBe(500_000);
    expect(breakdown.forex).toBe(250_000);
    expect(breakdown.totalAssets).toBe(3_150_000);
    expect(breakdown.totalDebt).toBe(300_000);
    expect(breakdown.netWorth).toBe(2_850_000);
  });
});

describe("financeReadTools income/expense agree with canonical real-expense semantics", () => {
  it("excludes an investment-planning-group expense category from expense (regression: previously counted as raw type==='expense')", () => {
    const category = {
      id: "cat-1",
      name: "Investment Category",
      type: "expense" as const,
      planningGroup: "investment" as const,
    };
    const transactions = [
      toDomainTransaction({
        id: "t1",
        type: "income",
        amount: 20_000,
        categoryId: "cat-1",
        walletId: "w1",
        note: null,
        date: "2026-08-01",
      }),
      toDomainTransaction({
        id: "t2",
        type: "expense",
        amount: 6_000,
        categoryId: "cat-1",
        walletId: "w1",
        note: null,
        date: "2026-08-02",
      }),
    ];

    expect(getTotalIncome(transactions)).toBe(20_000);
    expect(getTotalExpense(transactions, [category])).toBe(0);
  });

  it("savingRate matches getSavingRate exactly", () => {
    expect(getSavingRate(20_000, 6_000)).toBe(70);
    expect(getSavingRate(0, 6_000)).toBe(0);
  });
});
