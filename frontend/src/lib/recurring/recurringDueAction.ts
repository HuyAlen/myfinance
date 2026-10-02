import type { Transaction } from "@/src/types/finance";
import type { RecurringMoneySchedule } from "./recurringMoney";

export type RecurringDueStatus = "due-today" | "upcoming";

export type RecurringDueAction = {
  scheduleId: string;
  sourceId: string;
  title: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string;
  walletId: string;
  dueDate: string;
  daysUntilDue: number;
  status: RecurringDueStatus;
};

function parseLocalDateOrdinal(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return undefined;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) return undefined;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function sameRecordedOccurrence(
  schedule: RecurringMoneySchedule,
  dueDate: string,
  transaction: Transaction,
) {
  return (
    transaction.date === dueDate &&
    transaction.type === schedule.type &&
    transaction.categoryId === schedule.categoryId &&
    transaction.walletId === schedule.walletId &&
    Math.round(Math.abs(Number(transaction.amount) || 0)) ===
      Math.round(Math.abs(Number(schedule.amount) || 0))
  );
}

/**
 * RECURRING-DUE-ACTION-1
 *
 * Pure reminder model. It NEVER creates transactions or mutates balances.
 *
 * - due-today: effective occurrence is today and no matching transaction for
 *   that exact schedule identity has been recorded for the due date.
 * - upcoming: effective occurrence is within `upcomingDays` calendar days.
 *
 * We intentionally do not invent an "overdue" state yet: the current data
 * model has no durable execution/skip receipt for recurring schedules, so
 * claiming an older occurrence is unpaid would be guesswork.
 */
export function buildRecurringDueActions(input: {
  schedules: RecurringMoneySchedule[];
  transactions: Transaction[];
  referenceDate: string;
  upcomingDays?: number;
}): RecurringDueAction[] {
  const referenceOrdinal = parseLocalDateOrdinal(input.referenceDate);
  if (referenceOrdinal === undefined) return [];

  const upcomingDays = Math.max(
    0,
    Math.floor(Number(input.upcomingDays ?? 3) || 0),
  );

  return input.schedules
    .filter((schedule) => schedule.enabled && schedule.issues.length === 0)
    .flatMap((schedule) => {
      const dueDate =
        schedule.effectiveNextRunDate ?? schedule.nextRunDate ?? "";
      const dueOrdinal = parseLocalDateOrdinal(dueDate);
      if (dueOrdinal === undefined) return [];

      const daysUntilDue = dueOrdinal - referenceOrdinal;
      if (daysUntilDue < 0 || daysUntilDue > upcomingDays) return [];

      const recorded = input.transactions.some((transaction) =>
        sameRecordedOccurrence(schedule, dueDate, transaction),
      );
      if (recorded) return [];

      return [
        {
          scheduleId: schedule.id,
          sourceId: schedule.sourceId,
          title: schedule.title,
          type: schedule.type,
          amount: schedule.amount,
          categoryId: schedule.categoryId,
          walletId: schedule.walletId,
          dueDate,
          daysUntilDue,
          status: daysUntilDue === 0 ? "due-today" : "upcoming",
        } satisfies RecurringDueAction,
      ];
    })
    .sort((a, b) => {
      if (a.daysUntilDue !== b.daysUntilDue) {
        return a.daysUntilDue - b.daysUntilDue;
      }
      if (a.type !== b.type) return a.type === "expense" ? -1 : 1;
      return a.title.localeCompare(b.title, "vi");
    });
}

export function summarizeRecurringDueActions(actions: RecurringDueAction[]) {
  const dueToday = actions.filter((item) => item.status === "due-today");
  const upcoming = actions.filter((item) => item.status === "upcoming");
  return {
    total: actions.length,
    dueTodayCount: dueToday.length,
    upcomingCount: upcoming.length,
    dueToday,
    upcoming,
  };
}
