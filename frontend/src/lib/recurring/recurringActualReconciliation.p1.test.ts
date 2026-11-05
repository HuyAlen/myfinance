import { describe, expect, it } from "vitest";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import {
  buildRecurringMoneySchedules,
  excludeRecordedRecurringOccurrences,
  isRecordedRecurringOccurrence,
  reconcileCurrentMonthlyOccurrence,
  reconcileRecurringOccurrence,
  toRecurringScheduleInputs,
} from "./recurringMoney";
import { expandRecurringScheduleOccurrences } from "@/src/lib/dashboard/dashboardIntelligence";

const wallet: Wallet = { id: "bank", name: "Ngân hàng", type: "bank", balance: 10_000_000 };
function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "electric", name: "Điện", type: "expense",
    isRecurring: true, recurrence: "monthly", defaultAmount: 1_000_000,
    defaultWalletId: "bank", nextRunDate: "2026-09-15",
    ...overrides,
  };
}
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "actual-1", type: "expense", amount: 850_000,
    categoryId: "electric", walletId: "cash",
    date: "2026-11-02", note: "Đã trả hóa đơn",
    ...overrides,
  };
}
function fixture(transactions: Transaction[] = [], categories: Category[] = [category()], referenceDate = "2026-11-05") {
  const schedules = buildRecurringMoneySchedules({
    categories, transactions, wallets: [wallet], referenceDate,
  });
  return { schedule: schedules[0], schedules, transactions };
}

describe("RECURRING-ACTUAL-RECONCILIATION-P1", () => {
  it("uses estimated amount only as plan; any positive actual amount, wallet and day within month match", () => {
    const input = fixture([tx()]);
    const november = reconcileCurrentMonthlyOccurrence({ ...input, referenceDate: "2026-11-05" });
    expect(november).toMatchObject({
      status: "recorded", actualAmount: 850_000,
      estimatedAmount: 1_000_000, difference: -150_000,
      transactionCount: 1, transactionIds: ["actual-1"],
    });
    expect(input.schedule.amount).toBe(1_000_000);
    expect(input.schedule.effectiveNextRunDate).toBe("2026-12-15");
  });

  it("aggregates several actual transactions in the same category and month without creating any transaction", () => {
    const input = fixture([
      tx({ id: "part-1", amount: 400_000, date: "2026-11-01" }),
      tx({ id: "part-2", amount: 450_000, date: "2026-11-28", walletId: "bank" }),
      tx({ id: "transfer", type: "transfer", amount: 300_000 }),
      tx({ id: "wrong-cat", categoryId: "food" }),
    ]);
    expect(reconcileCurrentMonthlyOccurrence({ ...input, referenceDate: "2026-11-05" }))
      .toMatchObject({ status: "recorded", actualAmount: 850_000, transactionCount: 2 });
    expect(input.transactions).toHaveLength(4);
  });

  it("does not carry a prior-month or a different type/category transaction into November", () => {
    const input = fixture([
      tx({ id: "oct", date: "2026-10-31" }),
      tx({ id: "dec", date: "2026-12-01" }),
      tx({ id: "income", type: "income" }),
      tx({ id: "other-cat", categoryId: "rent" }),
    ]);
    expect(reconcileCurrentMonthlyOccurrence({ ...input, referenceDate: "2026-11-05" })?.status).toBe("pending");
    expect(input.schedule.effectiveNextRunDate).toBe("2026-11-15");
    expect(isRecordedRecurringOccurrence(input.schedule, "2026-11-15", tx({ date: "2026-10-31" }))).toBe(false);
    expect(isRecordedRecurringOccurrence(input.schedule, "2026-11-15", tx({ amount: 0 }))).toBe(false);
  });

  it("automatically recomputes after edit/delete; the persisted estimate and anchor stay unchanged", () => {
    const original = fixture([tx()]);
    const edited = fixture([tx({ amount: 1_350_000 })]);
    const deleted = fixture([]);
    expect(reconcileCurrentMonthlyOccurrence({ ...original, referenceDate: "2026-11-05" })?.actualAmount).toBe(850_000);
    expect(reconcileCurrentMonthlyOccurrence({ ...edited, referenceDate: "2026-11-05" })?.difference).toBe(350_000);
    expect(reconcileCurrentMonthlyOccurrence({ ...deleted, referenceDate: "2026-11-05" })?.status).toBe("pending");
    expect(original.schedule.nextRunDate).toBe("2026-09-15");
    expect(edited.schedule.amount).toBe(1_000_000);
  });

  it("matches daily strictly by day and weekly within non-overlapping seven-day periods", () => {
    const daily = fixture([], [category({ recurrence: "daily" })]).schedule;
    const weekly = fixture([], [category({ recurrence: "weekly" })]).schedule;
    expect(isRecordedRecurringOccurrence(daily, "2026-11-05", tx({ date: "2026-11-06" }))).toBe(false);
    expect(isRecordedRecurringOccurrence(weekly, "2026-11-05", tx({ date: "2026-11-11" }))).toBe(true);
    expect(isRecordedRecurringOccurrence(weekly, "2026-11-05", tx({ date: "2026-11-12" }))).toBe(false);
    expect(reconcileCurrentMonthlyOccurrence({ schedule: daily, schedules: [daily], transactions: [tx()], referenceDate: "2026-11-05" })).toBeNull();
  });

  it("fails closed for two active schedules with the same category; never allocates one actual twice", () => {
    const legacy = tx({
      id: "legacy-schedule", amount: 1_500_000, walletId: "bank",
      isRecurring: true, recurrence: "monthly", nextRunDate: "2026-10-20",
    });
    const input = fixture([legacy, tx()], [category()]);
    expect(input.schedules).toHaveLength(2);
    expect(input.schedules.every((item) => item.issues.includes("ambiguous-category-schedule"))).toBe(true);
    expect(toRecurringScheduleInputs(input.schedules)).toEqual([]);
    expect(reconcileCurrentMonthlyOccurrence({ ...input, referenceDate: "2026-11-05" })?.status).toBe("ambiguous");
  });

  it("suppresses realized future occurrences in a 90-day forecast even when they are not consecutive", () => {
    const transactions = [tx({ id: "dec", date: "2026-12-02" })];
    const input = fixture(transactions, [category({ nextRunDate: "2026-11-15" })], "2026-11-05");
    const predicted = expandRecurringScheduleOccurrences(
      toRecurringScheduleInputs(input.schedules), "2026-11-05", 90,
    );
    const remaining = excludeRecordedRecurringOccurrences({
      occurrences: predicted, schedules: input.schedules, transactions,
    });
    expect(predicted.some((item) => item.date.getMonth() === 11)).toBe(true);
    expect(remaining.some((item) => item.date.getMonth() === 11)).toBe(false);
    expect(remaining.some((item) => item.date.getMonth() === 10)).toBe(true);
  });

  it("does not infer a year-long payment from a different month for annual schedules", () => {
    const annual = fixture([], [category({ recurrence: "yearly", nextRunDate: "2026-11-15" })]).schedule;
    expect(isRecordedRecurringOccurrence(annual, "2026-11-15", tx({ date: "2026-10-02" }))).toBe(false);
    expect(isRecordedRecurringOccurrence(annual, "2026-11-15", tx({ date: "2026-11-28" }))).toBe(true);
  });

  it("keeps a paused schedule out of current-month completion status", () => {
    const input = fixture([tx()], [category({ isRecurring: false })]);
    expect(reconcileCurrentMonthlyOccurrence({ ...input, referenceDate: "2026-11-05" })).toBeNull();
  });

  it("returns stable on-demand reconciliation values without moving any money", () => {
    const input = fixture([tx()]);
    const r = reconcileRecurringOccurrence({ ...input, dueDate: "2026-11-15" });
    expect(r.transactionIds).toEqual(["actual-1"]);
    expect(r.estimatedAmount).toBe(1_000_000);
    expect(input.transactions[0].amount).toBe(850_000);
  });
});
