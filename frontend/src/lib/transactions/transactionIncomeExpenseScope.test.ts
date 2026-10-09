import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import { getTotalExpense, getTotalIncome } from "@/src/services/finance/financeCalculations";
import {
  isOrdinaryTransactionFeedRow,
  scopeTransactionSummaryRows,
  summarizeTransactionIncomeExpense,
} from "./transactionIncomeExpenseScope";

const categories: Category[] = [
  { id: "income", name: "Salary", type: "income", planningGroup: "income" },
  { id: "expense", name: "Food", type: "expense", planningGroup: "variable" },
  { id: "saving", name: "Saving allocation", type: "expense", planningGroup: "saving" },
  { id: "investment", name: "Investment allocation", type: "expense", planningGroup: "investment" },
];
const range = { startDate: "2026-10-01", endDate: "2026-10-31" };
const tx = (
  id: string,
  type: Transaction["type"],
  amount: number,
  extras: Partial<Transaction> = {},
): Transaction => ({
  id,
  type,
  amount,
  date: "2026-10-08",
  categoryId: type === "income" ? "income" : "expense",
  walletId: "wallet-1",
  note: id,
  ...extras,
});
const ordinary = [
  tx("salary", "income", 1000),
  tx("food", "expense", 200),
  tx("portfolio-deposit", "transfer", 300, {
    categoryId: "",
    transferReferenceType: "investment",
    sourceType: "wallet",
    destinationType: "investment",
  }),
  tx("portfolio-withdraw", "transfer", 80, {
    categoryId: "",
    transferReferenceType: "investment",
    sourceType: "investment",
    destinationType: "wallet",
  }),
  tx("savings-deposit", "transfer", 400, {
    categoryId: "",
    transferReferenceType: "saving",
    sourceType: "wallet",
    destinationType: "saving",
  }),
  tx("savings-withdraw", "transfer", 100, {
    categoryId: "",
    transferReferenceType: "saving",
    sourceType: "saving",
    destinationType: "wallet",
  }),
  tx("wallet-transfer", "transfer", 50, { transferToWalletId: "wallet-2" }),
];

const summarize = (
  overrides: Partial<Parameters<typeof summarizeTransactionIncomeExpense>[0]> = {},
) => summarizeTransactionIncomeExpense({
  transactions: ordinary,
  categories,
  scope: { effectiveRange: range },
  ...overrides,
});

describe("TRANSACTIONS-INCOME-EXPENSE-SCOPE-1", () => {
  it("counts ordinary income and real expense only; capital deposits and withdrawals are excluded", () => {
    expect(summarize()).toEqual({
      income: 1000,
      expense: 200,
      net: 800,
      incomeCount: 1,
      expenseCount: 1,
      transferCount: 1,
      transferTurnover: 50,
    });
  });

  it("keeps legacy manual saving/investment expense allocations out of real expense", () => {
    const withLegacy = [
      ...ordinary,
      tx("manual-saving", "expense", 1000, { categoryId: "saving" }),
      tx("manual-investment", "expense", 1200, { categoryId: "investment" }),
    ];
    const result = summarize({ transactions: withLegacy });
    expect(result.income).toBe(getTotalIncome(withLegacy));
    expect(result.expense).toBe(getTotalExpense(withLegacy, categories));
    expect(result.expense).toBe(200);
    expect(result.expenseCount).toBe(1);
  });

  it("does not misclassify income or expense based on transfer-like text", () => {
    const result = summarize({
      transactions: [
        tx("cash-in", "income", 40, { note: "Withdraw at ATM" }),
        tx("tuition", "expense", 30, { note: "Internal transfer payment" }),
      ],
    });
    expect(result.income).toBe(40);
    expect(result.expense).toBe(30);
    expect(result.net).toBe(10);
  });

  it("does not turn a transfer into either income or expense", () => {
    const result = summarize({ transactions: [tx("transfer", "transfer", 999, {
      transferToWalletId: "wallet-2",
    })] });
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.net).toBe(0);
    expect(result.transferCount).toBe(1);
    expect(result.transferTurnover).toBe(999);
  });

  it("filters one Wallet's income/expense; incoming transfers count only as internal turnover", () => {
    const result = summarize({
      transactions: [
        ...ordinary,
        tx("salary-2", "income", 400, { walletId: "wallet-2" }),
        tx("food-2", "expense", 70, { walletId: "wallet-2" }),
      ],
      scope: { effectiveRange: range, walletId: "wallet-2" },
    });
    expect(result.income).toBe(400);
    expect(result.expense).toBe(70);
    expect(result.net).toBe(330);
    expect(result.transferTurnover).toBe(50);
  });

  it("uses the inclusive intersection of global period and local date filters", () => {
    const transactions = [
      tx("inside", "income", 10, { date: "2026-10-08" }),
      tx("before", "income", 20, { date: "2026-09-30" }),
      tx("after", "income", 30, { date: "2026-11-01" }),
    ];
    expect(summarize({ transactions }).income).toBe(10);
    expect(summarize({ transactions, scope: {
      effectiveRange: range, dateFrom: "2026-10-09",
    } }).income).toBe(0);
    expect(summarize({ transactions, scope: {
      effectiveRange: range, dateFrom: "2026-10-08", dateTo: "2026-10-08",
    } }).income).toBe(10);
  });

  it("returns genuine zero for an empty intersection, not values from another month", () => {
    const result = summarize({ scope: { effectiveRange: range, dateFrom: "2026-11-01" } });
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
    expect(result.net).toBe(0);
    expect(result.transferCount).toBe(0);
  });

  it("keeps managed mirrors hidden while ordinary wallet transfers remain in the feed", () => {
    expect(ordinary.filter(isOrdinaryTransactionFeedRow).map((item) => item.id))
      .toEqual(["salary", "food", "wallet-transfer"]);
    expect(scopeTransactionSummaryRows(ordinary, { effectiveRange: range }).length)
      .toBe(3);
  });

  it("does not modify caller transaction arrays", () => {
    const before = ordinary.map((item) => item.id);
    summarize();
    expect(ordinary.map((item) => item.id)).toEqual(before);
  });
});
