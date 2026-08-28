import { describe, expect, it } from "vitest";
import {
  toDomainDebt,
  toDomainForexAccount,
  toDomainForexCashTransaction,
  toDomainInvestment,
  toDomainSaving,
  toDomainTransaction,
  toDomainWallet,
} from "./aiFinanceContext.server";
import {
  calculateBalanceSheetSnapshot,
  getSavingRate,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

/**
 * INTEGRATION-1.4 regression coverage: the AI chat context's Net Worth /
 * income / expense / savingRate must be computed from the same canonical
 * `calculateNetWorth`/`getTotalIncome`/`getTotalExpense`/`getSavingRate` that
 * Dashboard and Reports use, via row -> domain adapters, not a second
 * `walletBalance + investmentValue - totalDebt` formula.
 */

function walletRow(balance: number) {
  return {
    id: "w1",
    user_id: "u1",
    name: "Wallet",
    type: "cash" as const,
    balance,
  };
}

function debtRow(remainingAmount: number) {
  return {
    id: "d1",
    user_id: "u1",
    name: "Debt",
    totalAmount: remainingAmount,
    remainingAmount,
    interestRate: null,
    minimumPayment: null,
    dueDate: null,
    loanTermMonths: null,
  };
}

function investmentRow(currentValue: number) {
  return {
    id: "i1",
    user_id: "u1",
    name: "Investment",
    type: "stock" as const,
    symbol: null,
    investedAmount: currentValue,
    currentValue,
    purchaseDate: null,
    notes: null,
    quantity: null,
    averageCost: null,
    currentPrice: null,
  };
}

function transactionRow(overrides: {
  id: string;
  type: "income" | "expense" | "transfer" | "saving" | "investment";
  amount: number;
  date: string;
}) {
  return {
    id: overrides.id,
    user_id: "u1",
    type: overrides.type,
    amount: overrides.amount,
    categoryId: "cat-1",
    walletId: "w1",
    note: "",
    date: overrides.date,
    transferToWalletId: null,
    isRecurring: null,
    recurrence: null,
    nextRunDate: null,
  };
}

describe("aiFinanceContext row -> domain adapters agree with the canonical full balance sheet", () => {
  it("includes Savings and Forex in the same current assets/debt snapshot", () => {
    const wallets = [toDomainWallet(walletRow(1_000_000))];
    const investments = [toDomainInvestment(investmentRow(300_000))];
    const debts = [toDomainDebt(debtRow(100_000))];
    const savings = [
      toDomainSaving({
        id: "s1",
        name: "Saving",
        type: "savings_account",
        balance: 500_000,
        interest_rate: null,
        maturity_date: null,
        notes: null,
      }),
    ];
    const forexAccounts = [
      toDomainForexAccount({
        id: "fx1",
        name: "FX",
        broker: "Broker",
        currency: "USD",
        status: "active",
        current_equity: 400_000,
      }),
    ];
    const forexCashTransactions = [
      toDomainForexCashTransaction({
        id: "fxt1",
        forex_account_id: "fx1",
        wallet_id: "w1",
        type: "deposit",
        amount: 300_000,
        currency: "VND",
        fee: 0,
        transaction_date: "2026-08-01",
        transaction_time: "10:00",
      }),
    ];

    const adapted = calculateBalanceSheetSnapshot({
      wallets,
      savings,
      investments,
      debts,
      forexAccounts,
      forexCashTransactions,
    });

    expect(adapted.cashAndWallets).toBe(1_000_000);
    expect(adapted.savings).toBe(500_000);
    expect(adapted.investments).toBe(300_000);
    expect(adapted.forex).toBe(400_000);
    expect(adapted.totalAssets).toBe(2_200_000);
    expect(adapted.netWorth).toBe(2_100_000);
  });
});

describe("aiFinanceContext income/expense agree with canonical real-expense semantics", () => {
  it("excludes a saving-planning-group expense category from expense (regression: previously counted as raw type==='expense')", () => {
    const category = {
      id: "cat-1",
      name: "Saving Category",
      type: "expense" as const,
      planningGroup: "saving" as const,
    };
    const transactions = [
      transactionRow({ id: "t1", type: "income", amount: 10_000, date: "2026-08-01" }),
      transactionRow({ id: "t2", type: "expense", amount: 3_000, date: "2026-08-02" }),
    ].map(toDomainTransaction);

    const income = getTotalIncome(transactions);
    const expense = getTotalExpense(transactions, [category]);

    expect(income).toBe(10_000);
    // The expense transaction is on a saving-planning-group category, so the
    // canonical "real expense" semantics exclude it — expense is 0, not 3000.
    expect(expense).toBe(0);
  });

  it("excludes a Savings Finance Engine transfer transaction from both income and expense (regression)", () => {
    const transactions = [
      transactionRow({ id: "t1", type: "income", amount: 10_000, date: "2026-08-01" }),
      transactionRow({ id: "t2", type: "transfer", amount: 5_000, date: "2026-08-02" }),
    ].map(toDomainTransaction);

    expect(getTotalIncome(transactions)).toBe(10_000);
    expect(getTotalExpense(transactions, [])).toBe(0);
  });

  it("savingRate matches getSavingRate exactly, including the zero-income fallback", () => {
    expect(getSavingRate(10_000, 7_000)).toBe(30);
    expect(getSavingRate(0, 500)).toBe(0);
    expect(getSavingRate(-100, 0)).toBe(0);
  });
});
