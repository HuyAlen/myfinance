import type { Transaction } from "@/src/types/finance";
import {
  excludeRecordedRecurringOccurrences,
  type RecurringMoneySchedule,
  toRecurringScheduleInputs,
} from "@/src/lib/recurring/recurringMoney";
import {
  expandRecurringScheduleOccurrences,
  type RecurringOccurrence,
} from "@/src/lib/dashboard/dashboardIntelligence";

/**
 * RECURRING-SELECTED-MONTH-CONTEXT-HOTFIX-P1
 * Use the canonical header month for historical/current/future recurring views.
 * The real current date is used only for due-today reminders and default
 * transaction dates in the current month.
 */
export type RecurringMonthView = {
  monthKey: string;
  monthLabel: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  horizonDays: number;
  isCurrentMonth: boolean;
};

function isValidMonthKey(monthKey: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return false;
  const year = Number(monthKey.slice(0, 4));
  return year >= 1900 && year <= 9999;
}

export function buildRecurringMonthView(selectedMonth: string, todayKey: string): RecurringMonthView {
  const currentMonth = todayKey.slice(0, 7);
  // The provider validates its month keys. Guard against an invalid deep-link
  // without using a silently normalized JavaScript Date.
  const monthKey = isValidMonthKey(selectedMonth)
    ? selectedMonth
    : isValidMonthKey(currentMonth) ? currentMonth : "1970-01";
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad2 = (number: number) => String(number).padStart(2, "0");

  return {
    monthKey,
    monthLabel: `${pad2(month)}/${year}`,
    year,
    month,
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${pad2(days)}`,
    horizonDays: days - 1,
    isCurrentMonth: monthKey === currentMonth,
  };
}

export function projectSelectedRecurringMonth(input: {
  viewMonth: RecurringMonthView;
  forecastSchedules: ReturnType<typeof toRecurringScheduleInputs>;
  schedules: RecurringMoneySchedule[];
  transactions: Transaction[];
}): RecurringOccurrence[] {
  const { viewMonth, forecastSchedules, schedules, transactions } = input;
  const localFirstDay = new Date(viewMonth.year, viewMonth.month - 1, 1);
  const projected = expandRecurringScheduleOccurrences(
    forecastSchedules,
    localFirstDay,
    viewMonth.horizonDays,
  ).filter((occurrence) =>
    occurrence.date.getFullYear() === viewMonth.year &&
    occurrence.date.getMonth() + 1 === viewMonth.month,
  );
  return excludeRecordedRecurringOccurrences({
    occurrences: projected,
    schedules,
    transactions,
  });
}
