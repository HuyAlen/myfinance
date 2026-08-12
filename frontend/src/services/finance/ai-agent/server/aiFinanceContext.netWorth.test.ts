import { describe, expect, it } from "vitest";
import {
  toDomainDebt,
  toDomainInvestment,
  toDomainTransaction,
  toDomainWallet,
} from "./aiFinanceContext.server";
import {
  calculateNetWorth,
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

describe("aiFinanceContext row -> domain adapters agree with canonical Net Worth", () => {
  it("computes the same net worth as calculateNetWorth for the same wallet/investment/debt data", () => {
    const wallets = [toDomainWallet(walletRow(1_000_000))];
    const investments = [toDomainInvestment(investmentRow(300_000))];
    const debts = [toDomainDebt(debtRow(100_000))];

    const adapted = calculateNetWorth({ wallets, investments, debts });
    const direct = calculateNetWorth({
      wallets: [{ id: "w1", name: "Wallet", type: "cash", balance: 1_000_000 }],
      investments: [
        {
          id: "i1",
          name: "Investment",
          type: "stock",
          currentValue: 300_000,
          investedAmount: 300_000,
        },
      ],
      debts: [
        { id: "d1", name: "Debt", totalAmount: 100_000, remainingAmount: 100_000 },
      ],
    });

    expect(adapted).toEqual(direct);
    expect(adapted.netWorth).toBe(1_200_000);
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
