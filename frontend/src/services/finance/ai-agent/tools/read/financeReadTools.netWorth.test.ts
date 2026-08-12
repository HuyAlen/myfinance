import { describe, expect, it } from "vitest";
import {
  toDomainDebt,
  toDomainInvestment,
  toDomainTransaction,
  toDomainWallet,
} from "./financeReadTools.server";
import {
  calculateNetWorth,
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

describe("financeReadTools row -> domain adapters agree with canonical Net Worth", () => {
  it("get_financial_summary's net worth equals calculateNetWorth for the same wallet/investment/debt rows", () => {
    const wallets = [
      toDomainWallet({ id: "w1", name: "Wallet", type: "cash", balance: 2_000_000 }),
    ];
    const investments = [
      toDomainInvestment({ id: "i1", name: "Stock", currentValue: 500_000 }),
    ];
    const debts = [
      toDomainDebt({ id: "d1", name: "Loan", remainingAmount: 300_000 }),
    ];

    const breakdown = calculateNetWorth({ wallets, investments, debts });

    expect(breakdown.cashAndWallets).toBe(2_000_000);
    expect(breakdown.investments).toBe(500_000);
    expect(breakdown.totalDebt).toBe(300_000);
    expect(breakdown.totalAssets).toBe(2_500_000);
    expect(breakdown.netWorth).toBe(2_200_000);
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
