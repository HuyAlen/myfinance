import { describe, expect, it } from "vitest";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import {
  buildRecurringMonthView,
  projectSelectedRecurringMonth,
} from "./recurringMonthView";
import {
  buildRecurringMoneySchedules,
  reconcileCurrentMonthlyOccurrence,
  toRecurringScheduleInputs,
} from "./recurringMoney";

const wallets: Wallet[] = [
  { id: "bank", name: "Ngân hàng", type: "bank", balance: 1_000_000 },
];
const category: Category = {
  id: "electric", name: "Phí điện", type: "expense",
  isRecurring: true, recurrence: "monthly", defaultAmount: 1_200_000,
  defaultWalletId: "bank", nextRunDate: "2026-09-05",
};
const paid: Transaction = {
  id: "actual-nov", categoryId: "electric", walletId: "bank",
  date: "2026-11-02", amount: 997_650, type: "expense", note: "Điện",
};
function snapshot(monthKey: string, transactions: Transaction[]) {
  const viewMonth = buildRecurringMonthView(monthKey, "2026-11-05");
  const schedules = buildRecurringMoneySchedules({
    categories: [category], wallets, transactions, referenceDate: viewMonth.startDate,
  });
  const status = reconcileCurrentMonthlyOccurrence({
    schedule: schedules[0], schedules, transactions, referenceDate: viewMonth.startDate,
  });
  const occurrences = projectSelectedRecurringMonth({
    viewMonth, forecastSchedules: toRecurringScheduleInputs(schedules),
    schedules, transactions,
  });
  return { viewMonth, schedules, status, occurrences };
}

describe("RECURRING-SELECTED-MONTH-CONTEXT-HOTFIX-P1", () => {
  it("resolves exact boundaries for November, December and leap-year February", () => {
    expect(buildRecurringMonthView("2026-11", "2026-11-05")).toMatchObject({
      monthKey: "2026-11", startDate: "2026-11-01", endDate: "2026-11-30",
      horizonDays: 29, isCurrentMonth: true, monthLabel: "11/2026",
    });
    expect(buildRecurringMonthView("2026-12", "2026-11-05")).toMatchObject({
      startDate: "2026-12-01", endDate: "2026-12-31", horizonDays: 30,
      isCurrentMonth: false,
    });
    expect(buildRecurringMonthView("2028-02", "2026-11-05")).toMatchObject({
      startDate: "2028-02-01", endDate: "2028-02-29", horizonDays: 28,
    });
    expect(buildRecurringMonthView("2026-02", "2026-11-05").endDate).toBe("2026-02-28");
  });

  it("fails safely on invalid selected month rather than JS-normalizing it", () => {
    expect(buildRecurringMonthView("2026-13", "2026-11-05").monthKey).toBe("2026-11");
    expect(buildRecurringMonthView("2026-00", "2026-11-05").monthKey).toBe("2026-11");
  });

  it("does not carry an already-recorded November payment into October or December", () => {
    const oct = snapshot("2026-10", [paid]);
    const nov = snapshot("2026-11", [paid]);
    const dec = snapshot("2026-12", [paid]);
    expect(oct.status).toMatchObject({ status: "pending", actualAmount: 0 });
    expect(nov.status).toMatchObject({
      status: "recorded", actualAmount: 997_650, difference: -202_350,
    });
    expect(dec.status).toMatchObject({ status: "pending", actualAmount: 0 });
    expect(oct.occurrences).toHaveLength(1);
    expect(nov.occurrences).toHaveLength(0);
    expect(dec.occurrences).toHaveLength(1);
    expect(oct.occurrences[0].date.getMonth()).toBe(9);
    expect(dec.occurrences[0].date.getMonth()).toBe(11);
    expect(nov.schedules[0].amount).toBe(1_200_000);
    expect(dec.schedules[0].amount).toBe(1_200_000);
  });

  it("recomputes selected-month realization on edit, delete and category changes", () => {
    expect(snapshot("2026-11", [paid]).status?.actualAmount).toBe(997_650);
    expect(snapshot("2026-11", [{ ...paid, amount: 850_000 }]).status?.difference).toBe(-350_000);
    expect(snapshot("2026-11", []).status?.status).toBe("pending");
    expect(snapshot("2026-11", [{ ...paid, categoryId: "rent" }]).status?.status).toBe("pending");
  });

  it("keeps the calendar projection within November rather than rolling into December", () => {
    const november = snapshot("2026-11", []);
    expect(november.occurrences).toHaveLength(1);
    expect(november.occurrences[0].date.getFullYear()).toBe(2026);
    expect(november.occurrences[0].date.getMonth()).toBe(10);
    expect(november.occurrences[0].date.getDate()).toBe(5);
    expect(november.viewMonth.endDate).toBe("2026-11-30");
  });

  it("includes month-end clamped recurring dates and excludes all next-month dates", () => {
    const viewMonth = buildRecurringMonthView("2026-11", "2026-11-05");
    const schedules = buildRecurringMoneySchedules({
      categories: [{ ...category, nextRunDate: "2026-10-31" }],
      transactions: [], wallets, referenceDate: viewMonth.startDate,
    });
    const occurrences = projectSelectedRecurringMonth({
      viewMonth, schedules, transactions: [],
      forecastSchedules: toRecurringScheduleInputs(schedules),
    });
    expect(occurrences.map((item) => item.date.getDate())).toEqual([30]);
  });

  it("keeps history and future selectors independent of the real current month", () => {
    expect(buildRecurringMonthView("2026-10", "2026-11-05").isCurrentMonth).toBe(false);
    expect(buildRecurringMonthView("2026-12", "2026-11-05").isCurrentMonth).toBe(false);
    expect(buildRecurringMonthView("2026-11", "2026-11-05").isCurrentMonth).toBe(true);
  });
});
