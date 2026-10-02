import { describe, expect, it } from "vitest";
import { buildRecurringDueActions, summarizeRecurringDueActions } from "./recurringDueAction";
import type { RecurringMoneySchedule } from "./recurringMoney";
import type { Transaction } from "@/src/types/finance";

function schedule(overrides: Partial<RecurringMoneySchedule> = {}): RecurringMoneySchedule {
  return {
    id: "category-rent",
    source: "category",
    sourceId: "rent",
    title: "Nhà ở",
    type: "expense",
    amount: 6_500_000,
    categoryId: "rent",
    categoryName: "Nhà ở",
    walletId: "bank",
    walletName: "TP Bank",
    recurrence: "monthly",
    nextRunDate: "2026-08-05",
    effectiveNextRunDate: "2026-10-05",
    enabled: true,
    legacy: false,
    issues: [],
    shadowedSourceIds: [],
    ...overrides,
  };
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    type: "expense",
    amount: 6_500_000,
    categoryId: "rent",
    walletId: "bank",
    note: "Nhà ở",
    date: "2026-10-05",
    ...overrides,
  };
}

describe("RECURRING-DUE-ACTION-1", () => {
  it("marks an unrecorded occurrence due today", () => {
    const actions = buildRecurringDueActions({
      schedules: [schedule()],
      transactions: [],
      referenceDate: "2026-10-05",
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].status).toBe("due-today");
    expect(actions[0].daysUntilDue).toBe(0);
  });

  it("reminds within the next 3 calendar days", () => {
    const actions = buildRecurringDueActions({
      schedules: [schedule()],
      transactions: [],
      referenceDate: "2026-10-02",
      upcomingDays: 3,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      status: "upcoming",
      dueDate: "2026-10-05",
      daysUntilDue: 3,
    });
  });

  it("does not remind outside the upcoming window", () => {
    expect(
      buildRecurringDueActions({
        schedules: [schedule()],
        transactions: [],
        referenceDate: "2026-10-01",
        upcomingDays: 3,
      }),
    ).toEqual([]);
  });

  it("suppresses the due reminder after the exact canonical transaction is recorded", () => {
    expect(
      buildRecurringDueActions({
        schedules: [schedule()],
        transactions: [tx()],
        referenceDate: "2026-10-05",
      }),
    ).toEqual([]);
  });

  it("does not hide a due item because of an unrelated transaction", () => {
    const actions = buildRecurringDueActions({
      schedules: [schedule()],
      transactions: [tx({ walletId: "cash" })],
      referenceDate: "2026-10-05",
    });
    expect(actions).toHaveLength(1);
  });

  it("ignores paused and invalid schedules", () => {
    const actions = buildRecurringDueActions({
      schedules: [
        schedule({ id: "paused", enabled: false }),
        schedule({ id: "invalid", issues: ["missing-wallet"] }),
      ],
      transactions: [],
      referenceDate: "2026-10-05",
    });
    expect(actions).toEqual([]);
  });

  it("summarizes today vs upcoming without claiming overdue state", () => {
    const actions = buildRecurringDueActions({
      schedules: [
        schedule({ id: "today", effectiveNextRunDate: "2026-10-02" }),
        schedule({ id: "soon", effectiveNextRunDate: "2026-10-04" }),
      ],
      transactions: [],
      referenceDate: "2026-10-02",
    });
    expect(summarizeRecurringDueActions(actions)).toMatchObject({
      total: 2,
      dueTodayCount: 1,
      upcomingCount: 1,
    });
  });
});
