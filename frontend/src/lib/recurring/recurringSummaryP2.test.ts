import { describe, expect, it } from "vitest";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import { buildRecurringMonthSummary } from "./recurringSummaryP2";
import { buildRecurringMoneySchedules } from "./recurringMoney";
import { buildRecurringMonthView } from "./recurringMonthView";

const wallets: Wallet[] = [
  { id: "bank", name: "Ngân hàng", type: "bank", balance: 10_000_000 },
  { id: "cash", name: "Tiền mặt", type: "cash", balance: 1_000_000 },
];
function plan(id: string, amount: number, overrides: Partial<Category> = {}): Category {
  return {
    id, name: id, type: "expense", isRecurring: true, recurrence: "monthly",
    defaultAmount: amount, defaultWalletId: "bank", nextRunDate: "2026-09-05",
    ...overrides,
  };
}
function payment(id: string, categoryId: string, amount: number, date = "2026-11-02", overrides: Partial<Transaction> = {}): Transaction {
  return {
    id, categoryId, amount, date, type: "expense", walletId: "cash", note: id,
    ...overrides,
  };
}
function summary(
  month: string,
  categories: Category[],
  transactions: Transaction[],
  todayKey = "2026-11-05",
) {
  const viewMonth = buildRecurringMonthView(month, todayKey);
  const schedules = buildRecurringMoneySchedules({
    categories, wallets, transactions, referenceDate: viewMonth.startDate,
  });
  return buildRecurringMonthSummary({ viewMonth, schedules, transactions });
}

describe("MYFINANCE-RECURRING-SUMMARY-CARDS-P2", () => {
  it("shows 3/3, unchanged 8.9m plan, 8.667054m actual, and -232946 expense difference", () => {
    const categories = [
      plan("house", 6_500_000),
      plan("electric", 1_200_000),
      plan("management", 1_200_000),
    ];
    const transactions = [
      payment("house-1", "house", 6_500_000),
      payment("electric-1", "electric", 997_650, "2026-11-04"),
      payment("management-1", "management", 1_169_404, "2026-11-08"),
    ];
    expect(summary("2026-11", categories, transactions)).toMatchObject({
      totalCount: 3, recordedCount: 3, pendingCount: 0,
      estimatedExpense: 8_900_000,
      actualExpense: 8_667_054,
      recordedEstimatedExpense: 8_900_000,
      expenseDifference: -232_946,
    });
  });

  it("keeps planned totals when all occurrences are paid, despite effective next date rolling to December", () => {
    const result = summary("2026-11", [plan("electric", 1_200_000)], [payment("p1", "electric", 900_000)]);
    expect(result).toMatchObject({
      estimatedExpense: 1_200_000, actualExpense: 900_000,
      expenseDifference: -300_000, recordedCount: 1,
    });
  });

  it("does not mark unpaid bills as savings or a negative expense variance", () => {
    const result = summary("2026-11",
      [plan("house", 6_500_000), plan("electric", 1_200_000), plan("management", 1_200_000)],
      [payment("house-1", "house", 6_500_000)],
    );
    expect(result).toMatchObject({
      totalCount: 3, recordedCount: 1, pendingCount: 2,
      estimatedExpense: 8_900_000, actualExpense: 6_500_000,
      recordedEstimatedExpense: 6_500_000,
      expenseDifference: 0,
    });
    expect(summary("2026-11", [plan("electric", 1_200_000)], [])).toMatchObject({
      recordedCount: 0, expenseDifference: 0,
    });
  });

  it("separates income and expense, including their independently realized variances", () => {
    const categories = [
      plan("house", 6_500_000),
      plan("salary", 14_000_000, { type: "income" }),
      plan("bonus", 2_000_000, { type: "income" }),
    ];
    const transactions = [
      payment("house-1", "house", 6_800_000),
      payment("salary-1", "salary", 14_200_000, "2026-11-20", { type: "income" }),
    ];
    expect(summary("2026-11", categories, transactions)).toMatchObject({
      totalCount: 3, recordedCount: 2, pendingCount: 1,
      estimatedExpense: 6_500_000, actualExpense: 6_800_000, expenseDifference: 300_000,
      estimatedIncome: 16_000_000, actualIncome: 14_200_000,
      recordedEstimatedIncome: 14_000_000, incomeDifference: 200_000,
    });
    expect(summary("2026-11", [plan("salary", 14_000_000, { type: "income" })],
      [payment("salary-1", "salary", 13_800_000, "2026-11-17", { type: "income" })])
    ).toMatchObject({
      estimatedExpense: 0, estimatedIncome: 14_000_000,
      actualExpense: 0, actualIncome: 13_800_000, incomeDifference: -200_000,
      recordedIncomeCount: 1, recordedExpenseCount: 0,
    });
  });

  it("aggregates multiple transactions of the same category in one month only once per actual", () => {
    expect(summary("2026-11", [plan("electric", 1_200_000)], [
      payment("electric-a", "electric", 400_000, "2026-11-01"),
      payment("electric-b", "electric", 450_000, "2026-11-30"),
      payment("other", "other", 400_000),
      payment("wrong-type", "electric", 1_000_000, "2026-11-02", { type: "income" }),
    ])).toMatchObject({
      recordedCount: 1, actualExpense: 850_000, estimatedExpense: 1_200_000,
      expenseDifference: -350_000,
    });
  });

  it("recomputes by selected month, edit, delete, moved category and changed wallet", () => {
    const categories = [plan("electric", 1_200_000)];
    const tx = [payment("p1", "electric", 997_650, "2026-11-02")];
    expect(summary("2026-10", categories, tx)).toMatchObject({
      recordedCount: 0, actualExpense: 0, estimatedExpense: 1_200_000,
    });
    expect(summary("2026-11", categories, tx)).toMatchObject({
      recordedCount: 1, actualExpense: 997_650,
    });
    expect(summary("2026-12", categories, tx)).toMatchObject({
      recordedCount: 0, actualExpense: 0, estimatedExpense: 1_200_000,
    });
    expect(summary("2026-11", categories, [{ ...tx[0], amount: 850_000 }]).expenseDifference).toBe(-350_000);
    expect(summary("2026-11", categories, []).recordedCount).toBe(0);
    expect(summary("2026-11", categories, [{ ...tx[0], categoryId: "food" }]).recordedCount).toBe(0);
    expect(summary("2026-11", categories, [{ ...tx[0], walletId: "bank" }]).recordedCount).toBe(1);
  });

  it("includes daily, weekly, and yearly schedule occurrences without monthly-only shortcuts", () => {
    const categories = [
      plan("coffee", 10_000, { recurrence: "daily", nextRunDate: "2026-11-01" }),
      plan("weekly", 100_000, { recurrence: "weekly", nextRunDate: "2026-11-02" }),
      plan("annual", 1_000_000, { recurrence: "yearly", nextRunDate: "2026-11-05" }),
    ];
    const transactions = [
      payment("coffee-2", "coffee", 15_000, "2026-11-02"),
      payment("weekly-1", "weekly", 80_000, "2026-11-05"),
      payment("annual-1", "annual", 950_000, "2026-11-29"),
    ];
    expect(summary("2026-11", categories, transactions)).toMatchObject({
      totalCount: 36, recordedCount: 3, pendingCount: 33,
      estimatedExpense: 1_800_000,
      actualExpense: 1_045_000,
      recordedEstimatedExpense: 1_110_000,
      expenseDifference: -65_000,
    });
  });

  it("excludes paused, invalid and colliding schedules rather than double-allocating one payment", () => {
    const categories = [
      plan("paused", 1_000_000, { isRecurring: false }),
      plan("invalid", 1_000_000, { defaultWalletId: "deleted" }),
      plan("electric", 1_200_000),
    ];
    const legacy = payment("legacy", "electric", 1_500_000, "2026-09-05", {
      walletId: "bank", isRecurring: true,
      recurrence: "monthly", nextRunDate: "2026-10-15",
    });
    expect(summary("2026-11", categories, [legacy, payment("p1", "electric", 850_000)]))
      .toMatchObject({
        totalCount: 0, recordedCount: 0, pendingCount: 0,
        actualExpense: 0, estimatedExpense: 0, expenseDifference: 0,
      });
  });

  it("handles monthly day-31 clamping and empty months", () => {
    const categories = [plan("rent", 1_000_000, { nextRunDate: "2026-10-31" })];
    expect(summary("2026-11", categories, [])).toMatchObject({
      totalCount: 1, recordedCount: 0, pendingCount: 1, estimatedExpense: 1_000_000,
    });
    expect(summary("2026-09", [plan("future", 1_000_000, { nextRunDate: "2026-11-05" })], []))
      .toMatchObject({ totalCount: 0, recordedCount: 0, estimatedExpense: 0 });
  });
});
